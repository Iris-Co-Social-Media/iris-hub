# Iris & Co · Planificación — Documento de arquitectura

> **Versión 1.1 — 30/09/2026**
> **Autoras:** Lucía Olivera y Milagros Cárdenas (Iris & Co)
> **Primer cliente:** EIA — Estudio de Ingeniería Aplicada

Este documento es la **fuente de verdad** del proyecto. Cualquier IA que trabaje en el código, ya sea Claude Code, Claude o ChatGPT, tiene que leerlo antes de hacer cambios. Si una decisión cambia, **primero se actualiza este documento** y después el código.

**Cambios de la versión 1.1** (solo documentación, sin cambios funcionales):
- El hosting se implementó en **Cloudflare Workers** (static assets), no en Cloudflare Pages. Se actualizaron D12, D14, §5 y §11.
- Se agregó el paso **5b · Carga** al orden de construcción de la V1-alpha (§13), que ya formaba parte del alcance de la V1-alpha.

---

## 0. Cómo usar este documento con una IA

- **Cuando empieces una tarea,** decile a la IA: *"Leé docs/ARQUITECTURA.md y después hacé X"*.
- **Cuando aparezca un error,** pegale a la IA:
  1. el mensaje de error completo;
  2. qué estabas haciendo;
  3. en qué pantalla pasó.

  Pedile que **explique el problema antes de cambiar código**.
- **Reglas para la IA:**
  - No agregar servicios pagos.
  - No cambiar el stack.
  - No desactivar la seguridad (RLS) para "hacer que funcione".
  - Todo cambio en la base de datos va como archivo de *migración* en `supabase/migrations/`.
- **Archivos de instrucciones:** `CLAUDE.md` (lo lee Claude Code) y `AGENTS.md` (lo leen ChatGPT/Codex). Los dos apuntan a este documento, así ninguna IA trabaja "a ciegas".

---

## 1. Resumen de decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Es un sitio web** que se usa desde el navegador en la compu y el celular. No es una app para instalar. | Es lo más cómodo y no hace falta instalar nada. |
| D2 | **El sitio es de Iris & Co.** EIA es el primer cliente, dentro de su propio espacio. | Permite sumar clientes sin rehacer nada. |
| D3 | **Una sola instalación preparada para varios clientes.** No se hace un sitio por cliente. | Hay un solo código que mantener y entra en los free tiers. |
| D4 | **Solo Instagram** en la interfaz. El modelo de datos queda preparado para otras redes. | EIA solo usa Instagram. |
| D5 | **Acceso solo por invitación.** Se entra con un código de 6 dígitos que llega por mail, o con Google. | Es seguro y no hay contraseñas que recordar. |
| D6 | **Jonathan aprueba la idea antes del diseño.** No aprueba la pieza final. | Así funciona el flujo real. |
| D7 | **Los estados y los formatos son fijos en el código.** Las listas (pilares, servicios, obras, series) se editan desde el panel. | Es más simple de mantener sin saber programar. |
| D8 | **El contenido se guarda en "pantallas" o "láminas".** No se guarda como texto libre. | Permite copiar rápido, que la IA lo analice y conectarlo con Canva. |
| D9 | **Las fechas son estimativas.** No hay alertas de atraso. | Así trabajan ustedes y el cliente. |
| D10 | **La IA nunca modifica el calendario directamente.** Siempre funciona así: Propuesta → Revisar → Aplicar. | Es un requisito del proyecto. |
| D11 | **La V2 arranca en modo "copiar y pegar"** con ChatGPT o Claude, a USD 0. La conexión por API queda preparada. | El objetivo es costo cero. |
| D12 | **Hosting en Cloudflare Workers (static assets), no en Vercel.** | Hasta donde sé, el plan gratis de Vercel es solo para uso no comercial. Cloudflare recomienda Workers para proyectos nuevos y soporta SPAs de React + Vite. |
| D13 | **Todas las cuentas van a nombre del mail de Iris.** | El producto es de Iris & Co. |
| D14 | **Dominio gratuito** de Workers: `iris-hub.irisandco-socialmedia.workers.dev`. | No tiene contras funcionales. Se puede comprar un dominio propio más adelante. |
| D15 | **Los mails salen desde el Gmail de Iris** con una contraseña de aplicación. | Es gratis y los mails llegan bien, sin caer en spam. |

---

## 2. Usuarios, roles y permisos

### 2.1 Personas

| Persona | Lado | Rol | Permisos extra |
|---|---|---|---|
| Lucía Olivera | Iris & Co | **Admin** | — |
| Milagros Cárdenas | Iris & Co | **Admin** | — |
| (futuro) colaborador de Iris | Iris & Co | **Editor** | — |
| Jonathan | EIA | **Aprobador** | Recibe el mail de aviso |
| Julieta | EIA | **Lector** | Puede marcar piezas como publicadas y recibe el mail de aviso |
| Padre de Jonathan | EIA | **Lector** | — |

### 2.2 Qué puede hacer cada rol

| Acción | Admin | Editor | Aprobador | Lector |
|---|---|---|---|---|
| Ver todos los clientes | ✅ | ✅ | ❌ (solo el suyo) | ❌ (solo el suyo) |
| Ver planificaciones en *Borrador* | ✅ | ✅ | ❌ | ❌ |
| Ver planificaciones enviadas a revisión | ✅ | ✅ | ✅ | ✅ |
| Crear y editar piezas | ✅ | ✅ | ❌ | ❌ |
| Revisar ideas (Revisado / Cambios pedidos) | ✅ | ✅ | ✅ | Solo con permiso extra |
| Comentar | ✅ | ✅ | ✅ | Solo con permiso extra |
| Marcar una pieza como *Publicada* | ✅ | ✅ | Solo con permiso extra | Solo con permiso extra |
| Ver comentarios internos de Iris | ✅ | ✅ | ❌ | ❌ |
| Invitar usuarios y cambiar permisos | ✅ | ❌ | ❌ | ❌ |
| Ver planes y precios | ✅ | ❌ | ❌ | ❌ |
| Borrar piezas | ✅ | ❌ | ❌ | ❌ |

**Permisos extra** que se pueden activar por persona: `can_review`, `can_comment`, `can_mark_published` y `notify_on_review`.

### 2.3 Ingreso

1. La persona entra al sitio y escribe su mail.
2. Si el mail **no está invitado**, no pasa nada más y no se envía ningún mail.
3. Si está invitado, le llega un **código de 6 dígitos** que vence en pocos minutos y sirve una sola vez.
4. Escribe el código y entra. **La sesión dura varias semanas.**
5. Como alternativa, puede usar el botón **"Entrar con Google"**, que funciona solo si ese mail está invitado.

---

## 3. Flujo de trabajo

### 3.1 La planificación mensual

```
Borrador ──► Enviada a revisión ──► Revisión completa ──► Cerrada
(solo Iris)   (la ve el cliente,     (Jonathan revisó     (terminó el mes;
              se envía el mail)       todas las ideas)     lo pendiente se traslada)
```

- **Enviar a revisión:** al tocar "Enviar a revisión", el sitio manda un mail a los usuarios del cliente que tengan `notify_on_review`. El texto del mail es editable.
- **Aviso opcional a Iris:** si está activado, a Lucía y a Milagros les llega un aviso cuando Jonathan termina de revisar el mes.
- **Cuota del mes:** se calcula como *cuota del plan − piezas trasladadas*. Ejemplo: 1 reel trasladado significa que faltan planificar 7 posteos y 15 historias.

### 3.2 La pieza

Los estados de producción y la revisión del cliente son dos campos separados.

**Estado de producción:**
```
Historia / Post / Carrusel:   Por hacer ──► Diseñada ──► Publicada
Reel:                         Por hacer (guion) ──► Esperando grabación ──► Grabado ──► Editada ──► Publicada
Cualquiera:                   ──► Archivada (en lugar de borrar)
```

**Revisión del cliente:**
```
Sin revisar ──► Revisado
            └─► Cambios pedidos (con nota) ──► (Iris corrige) ──► Sin revisar
```

Reglas:
- **"Diseñada" o "Editada"** significa que la pieza ya está en el Drive compartido. No hace falta cargar el link.
- **"Publicada"** la marca Julieta, o quien tenga `can_mark_published`, cuando sube la pieza a Instagram.
- **Dashboard:** muestra como **"listas para diseñar"** las piezas en *Por hacer* que están en *Revisado*. No se bloquea editar una pieza sin revisar, solo se marca.
- **Pasar al mes siguiente:** mueve la pieza a la planificación del mes siguiente. **Conserva la revisión**, suma 1 a `times_carried_over` y registra el movimiento en el historial.
- **Reels:** la vista **"Esperando grabación"** le muestra a Jonathan los guiones listos, en letra grande para leer desde el celular. No hay alertas ni insistencias.
- **Errores después de diseñar:** si Jonathan ve un error de tipeo en una pieza ya diseñada, se resuelve por fuera del sitio y ustedes vuelven la pieza a *Por hacer*.

---

## 4. Arquitectura de producto (pantallas)

```
Iris & Co · Planificación
├── Inicio ─────────────── resumen de todos los clientes (solo Iris)
├── Cliente: EIA
│   ├── Mes ────────────── calendario mensual + lista + avance de cuota
│   ├── Revisión ───────── lo que ve Jonathan: ideas pendientes, avance "14/23"
│   ├── Esperando grabación ─ guiones de reels listos para grabar
│   ├── Banco de ideas ─── piezas sin fecha ni mes
│   ├── Pieza (detalle) ── datos, pantallas, comentarios, historial
│   ├── Ficha del cliente ─ servicios, público, tono, reglas, marca
│   └── Catálogos ──────── pilares, servicios, obras, series
├── Panel (solo admin)
│   ├── Usuarios e invitaciones
│   ├── Planes y precios
│   ├── Avisos por mail
│   └── Exportar backup
└── (V2+) Asistente IA ─── propuestas del mes, chat, aplicar cambios
```

**Principios de diseño:**
- **Todo el sitio es responsive**, para la compu y el celular.
- **En el celular** se priorizan estas acciones: ver la pieza, **copiar cada texto con un toque**, abrir Canva y cambiar el estado en un toque.
- **La pantalla de Revisión** está optimizada para la compu y también es cómoda en el celular. Jonathan puede dejar la revisión por la mitad y retomarla después.
- **El calendario y la tabla** están pensados sobre todo para la compu, pero se pueden usar en el celular.
- **Identidad visual:**
  - La estructura general usa la identidad de Iris & Co (ver Anexo B).
  - Dentro del espacio de un cliente se muestran su logo y su color principal (ver Anexo C).
- **Idioma:** toda la interfaz está en español.

---

## 5. Arquitectura técnica

### 5.1 Stack

| Capa | Tecnología | Costo |
|---|---|---|
| Interfaz | **React + Vite + TypeScript + Tailwind CSS** | Gratis |
| Navegación y datos | React Router, TanStack Query, supabase-js | Gratis |
| Validación | Zod (formularios y respuestas de IA) | Gratis |
| Hosting | **Cloudflare Workers** con static assets (deploy automático desde GitHub con Workers Builds y Worker Previews por rama) | Gratis, uso comercial permitido |
| Base de datos | **Supabase Postgres** | Free tier |
| Ingreso | **Supabase Auth**: código OTP por mail y Google OAuth | Free tier |
| Seguridad | **Row Level Security (RLS)** en todas las tablas | — |
| Lógica de servidor | **Supabase Edge Functions**: mails, IA y Canva | Free tier |
| Mails | SMTP del Gmail de Iris con contraseña de aplicación | Gratis |
| Código | GitHub, en un repositorio **privado** | Gratis |
| Mantenimiento | GitHub Actions: ping semanal a Supabase | Gratis |

**¿Por qué este stack y no Next.js + Vercel?**
- **El sitio es una aplicación privada detrás de un login.** No necesita SEO ni renderizado en servidor. Una SPA (una sola página que se arma en el navegador) con React + Vite es más simple, y las IAs la conocen muy bien.
- **Toda la seguridad vive en la base de datos (RLS).** Así no hace falta un backend propio que mantener.
- **Hasta donde sé, Vercel Hobby prohíbe el uso comercial,** y Cloudflare Workers no.

### 5.2 Diagrama

```
 Navegador (compu / celular)
        │  React SPA  (Cloudflare Workers)
        ▼
 ┌─────────────────────── Supabase ───────────────────────┐
 │  Auth (OTP + Google)  ──  hook: solo mails invitados    │
 │  Postgres + RLS  ◄── funciones SQL (revisar, publicar,   │
 │                      trasladar, aplicar propuesta)       │
 │  Edge Functions:                                         │
 │    • send-review-email  ──► Gmail SMTP (puerto 465)      │
 │    • ai-gateway (V2+)   ──► Gemini / Claude / OpenAI     │
 │    • canva (V4)         ──► Canva Connect API            │
 │  Secrets: claves de IA, contraseña de app de Gmail       │
 └──────────────────────────────────────────────────────────┘
        ▲
 GitHub Actions: ping semanal (evita la pausa por inactividad)
```

### 5.3 Entornos

- **Supabase "iris-prod":** los datos reales.
- **Supabase "iris-pruebas":** para probar migraciones antes de aplicarlas en prod. El plan gratuito permite 2 proyectos.
- **Cloudflare Workers** (Worker `iris-hub`):
  - la rama `main` se publica en el sitio real: `https://iris-hub.irisandco-socialmedia.workers.dev`;
  - las demás ramas generan una **Worker Preview**: `https://<rama>-iris-hub.irisandco-socialmedia.workers.dev`;
  - por ahora el sitio apunta a **iris-pruebas**; iris-prod todavía no está conectado. Para pasar a producción se cambian las dos variables de compilación (ver `docs/INGRESO.md`).

### 5.4 Estructura del repositorio

```
iris-hub/
├── CLAUDE.md            → "Leé docs/ARQUITECTURA.md antes de cualquier cambio"
├── AGENTS.md            → lo mismo, para ChatGPT/Codex
├── docs/ARQUITECTURA.md → este documento
├── wrangler.jsonc       → configuración de Cloudflare Workers (sin secretos)
├── src/
│   ├── pages/           → una carpeta por pantalla
│   ├── components/
│   ├── lib/             → cliente de Supabase, tipos, helpers
│   └── styles/
├── supabase/
│   ├── migrations/      → TODO cambio de base de datos, numerado
│   ├── functions/       → Edge Functions
│   ├── seed.sql         → datos iniciales (EIA, pilares, servicios)
│   └── tests/           → pruebas de permisos (RLS)
└── scripts/
    └── migracion-notion/ → importación del historial
```

### 5.5 Notas técnicas que verificar al construir

- **Invitaciones:** usar el hook de Auth *"Before User Created"* para rechazar mails que no estén en `memberships`. Además, el formulario solo pide el código si el mail está invitado.
- **Código de 6 dígitos:** configurar la plantilla de mail de OTP para que envíe `{{ .Token }}` en vez de un link.
- **Límite de mails:** configurar el **SMTP propio** (Gmail) en Auth, porque el SMTP que trae Supabase por defecto tiene límites muy bajos.
- **Puerto de envío:** hasta donde sé, las Edge Functions no permiten conexiones salientes a los puertos 25 y 587. Para Gmail, usar el **puerto 465 (SSL)**.
- **Configuración de los proyectos de Supabase:** *Data API* activada, *Automatically expose new tables* **desactivada** y *automatic RLS* **activada**. Por eso, cada migración que cree una tabla tiene que incluir sus `GRANT` explícitos a los roles `authenticated` (y `anon` solo si hace falta), además de sus políticas RLS.
- **Cloudflare Workers:**
  - `wrangler.jsonc` sirve `./dist` como static assets con `not_found_handling: "single-page-application"`, así cualquier ruta de React Router funciona al entrar directo o recargar.
  - Workers Builds: build `npm run build`, deploy `npx wrangler deploy` (rama `main`) y preview `npx wrangler preview` (demás ramas). Worker Previews necesita Wrangler 4.135.0 o posterior como dependencia del proyecto.
  - `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` son **variables de compilación** (Settings → Build → Variables and secrets). Son datos públicos; nunca van claves secretas.
- **Pausa por inactividad:** Supabase Free pausa el proyecto después de 7 días sin actividad. El workflow de GitHub Actions hace una consulta liviana una vez por semana.

---

## 6. Modelo de datos

**Convenciones:**
- Los nombres de tablas y columnas van en **inglés**; la interfaz, en español.
- Todas las tablas del cliente tienen `client_id`.
- Todas tienen `created_at` y `updated_at`.
- Las claves son `uuid`.

### 6.1 Tipos fijos (enums)

| Enum | Valores → etiqueta en la interfaz |
|---|---|
| `member_role` | `admin` Admin · `editor` Editor · `approver` Aprobador · `viewer` Lector |
| `piece_format` | `story` Historia · `post` Post · `carousel` Carrusel · `reel` Reel |
| `story_type` | `image` Imagen · `image_series` Serie de imágenes · `video` Video (solo historias) |
| `piece_status` | `todo` Por hacer · `awaiting_recording` Esperando grabación · `recorded` Grabado · `done` Diseñada/Editada · `published` Publicada · `archived` Archivada |
| `review_status` | `pending` Sin revisar · `approved` Revisado · `changes_requested` Cambios pedidos |
| `plan_status` | `draft` Borrador · `in_review` Enviada a revisión · `reviewed` Revisión completa · `closed` Cerrada |
| `objective` | `educate` Educar · `leads` Generar consultas · `experience` Mostrar experiencia · `engagement` Interacción · `brand` Marca |
| `interaction_type` | `none` · `poll` Encuesta · `quiz` Elegí la respuesta correcta · `question` Caja de preguntas · `slider` Deslizador |
| `piece_origin` | `manual` · `ai` · `notion_import` |

Regla: `awaiting_recording` y `recorded` solo son válidos cuando `format = 'reel'` (se controla con un `CHECK`).

En la interfaz, al crear una pieza primero se elige **Publicación** (Post, Carrusel, Reel) o **Historia** (Imagen, Serie de imágenes, Video). "Publicación" o "Historia" no se guarda aparte: sale de `format`. La interacción (`interaction`) se carga en las historias: Encuesta (`poll`), Caja de preguntas (`question`) o Elegí la respuesta correcta (`quiz`).

### 6.2 Núcleo (V1)

**`clients`**: los clientes de Iris.
| Columna | Tipo | Nota |
|---|---|---|
| id | uuid | |
| name | text | "EIA Ingeniería" |
| slug | text único | "eia" |
| logo_url | text | |
| brand_colors | jsonb | `{primary, secondary, background}` |
| signature | text | "\| EIA Ingeniería" |
| instagram_handle | text | "@eia.ingenieria" |
| plan_id | uuid → plans | |
| quota_posts | int | 8 |
| quota_stories | int | 15 |
| publish_copy_enabled | bool | false para EIA, porque Julieta escribe el copy |
| report_every_months | int | frecuencia del informe de métricas |
| review_email_enabled | bool | |
| review_email_text | text | editable |
| notify_team_on_review_done | bool | |
| active | bool | |

**`plans`** (**solo admin**): las plantillas de planes y sus precios.
`id, name ("Silver", "Platinum"), quota_posts, quota_stories, includes_copy, includes_filming, report_every_months, monthly_price, notes`

**`memberships`**: invitaciones y roles. La lista blanca de mails sale de esta tabla.
| Columna | Tipo | Nota |
|---|---|---|
| id | uuid | |
| email | text | en minúsculas; es la clave de la invitación |
| user_id | uuid → auth.users, null | se completa cuando la persona entra por primera vez |
| client_id | uuid → clients, **null** | null significa equipo de Iris |
| role | member_role | |
| can_review, can_comment, can_mark_published, notify_on_review | bool | permisos extra |
| active | bool | quitar el acceso sin borrar |
| invited_by | uuid | |

**`profiles`**: `id (= auth.users.id), full_name, avatar_url`

**`monthly_plans`**: la planificación de cada mes.
`id, client_id, month (date, día 1 del mes), status plan_status, sent_for_review_at, reviewed_at, notes` · único por `(client_id, month)`

**`pieces`**: cada pieza de contenido.
| Columna | Tipo | Nota |
|---|---|---|
| id | uuid | |
| client_id | uuid | |
| monthly_plan_id | uuid, null | null significa que está en el Banco de ideas |
| title | text | |
| description | text, null | "Descripción / idea": texto libre y opcional del equipo; no reemplaza objetivo, guion ni copy |
| format | piece_format | |
| story_type | story_type, null | solo si `format = 'story'` (se controla con un `CHECK`); null en las historias cargadas antes. La cantidad de imágenes de una serie son sus pantallas (`piece_frames`) |
| story_images_open | bool | la serie se eligió como "8 o más" (empieza con 8 pantallas y se pueden agregar más); solo con `story_type = 'image_series'` |
| platform | text | 'instagram' por defecto |
| estimated_date | date, null | es una fecha estimativa |
| status | piece_status | |
| review_status | review_status | |
| review_note | text | motivo de "Cambios pedidos" |
| reviewed_by / reviewed_at | uuid / timestamptz | |
| pillar_id | → pillars, null | |
| service_id | → services, null | |
| series_id | → series, null | |
| project_id | → projects, null | obra relacionada |
| objective | objective, null | |
| interaction | interaction_type | resumen para análisis |
| needs_client_on_camera | bool | por ejemplo, si Jonathan tiene que grabar |
| script | text | guion, solo para reels |
| publish_copy | text | solo si el cliente tiene `publish_copy_enabled` |
| canva_url | text | |
| album_url | text | se puede heredar de la obra |
| assignee_id | uuid | responsable |
| times_carried_over | int | cuántas veces se trasladó |
| published_at | timestamptz | se completa al marcarla como publicada |
| origin | piece_origin | |
| migration_notes | text | lo que no encajó al migrar |
| created_by | uuid | |

**`piece_frames`**: las pantallas de una historia o las láminas de un carrusel.
| Columna | Tipo | Nota |
|---|---|---|
| id | uuid | |
| piece_id | uuid | |
| position | int | 1, 2, 3… |
| label | text | "Portada", "Historia 2", "Foto 4 · El desafío" |
| headline | text | texto principal |
| body | text | texto secundario |
| visual_direction | text | "Qué mostrar" |
| interaction | jsonb, null | `{type, question, options[], correct_index}` |
| closing | text | cierre o CTA de esa pantalla |

**Catálogos editables** (todos con `client_id, name, description, active, position`):
- **`pillars`**: Educativo técnico · Servicios · Obra real · Series/cultura · Actualidad · Marca.
- **`services`**: los servicios de EIA (ver Anexo A).
- **`series`**: "Arquitectura alrededor del mundo".
- **`projects`** (obras): además de los campos comunes, `kind, general_area, year, album_url, confidential bool, notes`.

**Ficha del cliente:**
- **`client_profiles`**: `client_id (PK), description, service_area, differentiators, tone, ai_rules text[], forbidden_topics text[], needs_technical_validation text, visual_rules text`.
- **`audience_personas`**: `client_id, name, data jsonb` (edad, zona, ocupación, hábitos, miedos, deseos…).

**Colaboración:**
- **`comments`**: `id, piece_id, author_id, body, internal bool` (si es `internal`, solo lo ve Iris).
- **`activity_log`**: `id, client_id, piece_id, actor_id, action, before jsonb, after jsonb, at`. Se llena automáticamente con *triggers*.

**`reports`** (informes de métricas):
`id, client_id, period_start, period_end, due_date, status (pending/done), link, notes`

### 6.3 Tablas que se agregan después, ya diseñadas

**V2–V3 · IA**
- **`ai_settings`**: `task ('plan_month','write_copy','brief',…), provider, model, enabled`. Las claves **no** van acá: van en los *secrets*.
- **`ai_proposals`**: `id, client_id, monthly_plan_id, task, provider, model, mode ('manual'|'api'), context_snapshot jsonb, analysis_summary text, status ('open','applied','discarded'), created_by`.
- **`ai_proposal_items`**: `id, proposal_id, action ('create'|'update'|'remove'), piece_id null, payload jsonb, decision ('pending'|'accepted'|'rejected'), note`.

**V4–V5 · Canva**
- **`canva_templates`**: `id, client_id, name, format, canva_brand_template_id, composition_key, field_mapping jsonb, active`.
- **`design_log`**: `id, piece_id, template_id, composition_key, created_at`. Sirve para aplicar la regla de variedad.

**V6 · Métricas**
- **`piece_metrics`**: `id, piece_id, captured_at, reach, impressions, interactions, saves, shares, replies, poll_results jsonb, source ('manual'|'csv'|'api')`.

### 6.4 Qué es configurable

| Configurable desde el panel | Fijo en el código |
|---|---|
| Plan y cuota por cliente | Estados de producción y de revisión |
| Pilares, servicios, series y obras | Formatos (Historia, Post, Carrusel, Reel) |
| Ficha, reglas de IA y firma | Roles |
| Usuarios, roles y permisos extra | Objetivos y tipos de interacción |
| Avisos por mail y sus textos | |
| Si el cliente usa "copy para publicar" | |

### 6.5 Datos clave para que la IA planifique

Por cada pieza, la IA necesita: **formato, pilar, servicio, objetivo, interacción, serie, obra, fecha, si se publicó o se archivó, cuántas veces se trasladó y el motivo de los cambios pedidos**. Con esos datos puede responder preguntas como:
- ¿qué mix de pilares y formatos hubo en los últimos N meses?
- ¿qué servicios quedaron sin comunicar?
- ¿cuántos reels se graban realmente por mes?
- ¿qué tipo de ideas suele corregir Jonathan?

Cuando lleguen las métricas (V6), se suma: **qué funcionó mejor**.

---

## 7. Seguridad

1. **RLS activado en todas las tablas.** No se crea ninguna tabla sin sus políticas.
2. **Funciones SQL de ayuda:**
   - `is_team()`: el usuario es admin o editor de Iris.
   - `is_admin()`.
   - `client_role(client_id)`.
   - `has_perm(client_id, 'can_mark_published')`.
3. **Reglas de lectura:**
   - El equipo de Iris ve todo.
   - Un usuario del cliente ve **solo su `client_id`**, y **solo las planificaciones que no están en `draft`**.
   - Los comentarios `internal`, `plans`, `activity_log` y todo lo de IA son **solo para el equipo**.
4. **Los usuarios del cliente no editan tablas directamente.** Actúan a través de funciones controladas (`security definer`):
   - `review_piece(piece_id, decision, note)`
   - `mark_published(piece_id)`
   - `add_comment(piece_id, body)`

   Estas funciones validan el rol y el permiso extra antes de cambiar nada.
5. **Pruebas de permisos** en `supabase/tests/`:
   - un lector no puede editar;
   - un cliente no ve borradores ni datos de otros clientes;
   - nadie ve precios salvo las admins.

   Se corren antes de cada cambio en la base de datos.
6. **Secretos:**
   - Las claves de IA y la contraseña de aplicación de Gmail viven **solo** en los secrets de Supabase.
   - Nunca van en el código del navegador ni en GitHub.
7. **Cuenta de Iris:** la cuenta de Google de Iris debe tener **verificación en dos pasos**.
8. **Privacidad con la IA:**
   - No se envían a proveedores de IA las **obras marcadas como confidenciales**, los datos de los clientes finales de EIA ni los comentarios internos.
   - Hasta donde sé, en el plan **gratuito** de la API de Gemini, Google puede usar los datos para mejorar sus productos. Por eso solo se envía información no sensible.
9. **Backups:** botón "Exportar todo" (JSON/CSV). Conviene **usarlo una vez por mes**, porque el plan gratuito no ofrece backups descargables.

---

## 8. Arquitectura de IA

### 8.1 Principio

**La IA propone y las personas deciden.** La IA nunca escribe en `pieces`. Solo crea `ai_proposals` con sus `ai_proposal_items`. Cuando alguien toca "Aplicar", la función `apply_proposal()` aplica **solo los ítems aceptados**.

### 8.2 Dos modos, con la misma estructura

**Modo manual (V2, costo USD 0):**
1. En el Asistente, tocás **"Planificar noviembre"**.
2. El sitio arma un **paquete de contexto** en texto, listo para copiar. Incluye:
   - la ficha de EIA, las reglas y los perfiles de público;
   - la cuota del mes, descontando las piezas trasladadas;
   - un resumen de los últimos 3 a 6 meses (mix por pilar, formato y servicio) y la lista de títulos;
   - el motivo de los cambios que pidió Jonathan;
   - las obras disponibles (no confidenciales), las series y las fechas importantes;
   - las instrucciones y el **formato JSON de respuesta**.
3. Lo pegás en **ChatGPT o Claude** y conversás con la IA hasta que te guste la propuesta.
4. Pegás el JSON final en el sitio. Se valida con Zod y se convierte en una **propuesta**.
5. Revisás ítem por ítem (Aceptar, Rechazar o Editar) y tocás **Aplicar**.

**Modo API (cuando convenga):** la Edge Function `ai-gateway` hace lo mismo, pero automáticamente, con un chat dentro del sitio.

### 8.3 Capa de proveedores

```
ai-gateway (Edge Function)
  generate({ task, messages, tools?, responseSchema })
    ├── adapter: gemini   (primera opción gratuita)
    ├── adapter: claude
    └── adapter: openai
  → el proveedor y el modelo de cada tarea se leen de ai_settings
```

Cada adaptador traduce el formato común al de cada proveedor. Sumar un proveedor nuevo significa escribir un adaptador nuevo, sin tocar el resto del sitio.

### 8.4 Herramientas (tools) que la IA puede usar en modo API

**Solo lectura:**
- `get_client_profile()`: la ficha, las reglas y los perfiles de público.
- `get_quota_status(month)`: la cuota, lo trasladado y lo que falta.
- `list_pieces(from, to, filters)`: las piezas con sus datos clave.
- `get_content_mix(months)`: el mix agregado por pilar, formato, servicio y objetivo.
- `list_projects() / list_series() / list_services()`.
- `get_review_feedback(months)`: los motivos de "Cambios pedidos".
- `get_metrics(from, to)`: disponible desde la V6.

**Solo propuestas** (nunca escriben directo):
- `propose_piece(data)`
- `propose_update(piece_id, changes)`
- `propose_removal(piece_id, reason)`

**Ejemplo de conversación:**

> *"Me gusta todo menos la del 8"* → la IA llama a `propose_removal` y después a `propose_piece` sobre la misma propuesta → *"Aplicar"* → `apply_proposal()`.

### 8.5 Formato de respuesta (resumen)

```json
{
  "analysis": "Analicé jul–sep: 10 educativas, 2 de obra real; 'galpones' solo 1 vez...",
  "items": [
    {
      "action": "create",
      "estimated_date": "2026-11-04",
      "format": "carousel",
      "title": "¿Qué revisar antes de ampliar un galpón?",
      "pillar": "Educativo técnico",
      "service": "Galpones y espacios productivos",
      "objective": "leads",
      "interaction": "none",
      "frames": [
        {"label": "Portada", "headline": "...", "body": "...", "visual_direction": "..."}
      ],
      "reason": "Servicio poco comunicado; público rural (perfil Juan)."
    }
  ]
}
```

### 8.6 Reglas fijas para la IA (van en todo contexto)

- **Lenguaje simple.** Evitar el tecnicismo excesivo, porque el público lo rechaza.
- **Transmitir seguridad, confianza y tranquilidad.**
- **No mostrar datos de clientes, ubicaciones exactas ni planos identificables.**
- **Respetar la cuota** y el mix de formatos del plan.
- **Reels según la realidad:** no planificar más reels de los que históricamente se graban, y marcar `needs_client_on_camera`.
- **Contenido técnico sensible** (cálculos, normativa): siempre queda como *Sin revisar* hasta que Jonathan lo valide.
- **Variedad:** no repetir el mismo pilar más de 2 días seguidos, y alternar formatos e interacciones.

### 8.7 V3: brief y copy

Funciona con el mismo mecanismo, pero a nivel de pieza. La IA propone las pantallas (textos principal y secundario, qué mostrar, cierre) de una idea ya revisada. El usuario acepta el cambio completo o solo algunas pantallas. Si el plan del cliente incluye copy, también propone el `publish_copy`.

---

## 9. Estrategia con Canva

**Situación:**
- Iris tiene **Canva Pro**. Hay que confirmarlo en Canva → Configuración → Facturación.
- Según la documentación actual de Canva, el **Autofill** de la Connect API funciona con **Pro, Teams o Enterprise**.

**Preparación, que conviene empezar ya:**
1. Armar el **Brand Kit de EIA** con el logo, los colores y las tipografías del Anexo C.
2. Crear de **3 a 5 plantillas por formato** (Historia, Post, Carrusel) con **campos con nombre** que coincidan con `piece_frames`: `headline`, `body`, `closing` y una `photo` como imagen de reemplazo.
3. Asignar a cada plantilla una **composición** (`composition_key`), por ejemplo "foto completa + texto abajo" o "texto grande + foto recortada".

**V4, paso 1 (sin API, USD 0):**
- Botón **"Exportar para Canva"** que genera un CSV con las pantallas.
- Con ese CSV se usa **Crear en lote (Bulk Create)** de Canva sobre la plantilla.
- Cada pieza sale como un diseño editable, con la foto como elemento reemplazable.

**V4, paso 2 (API):**
- La Edge Function `canva` usa OAuth con la cuenta de Iris y llama a Autofill con la plantilla y los datos.
- Guarda el `canva_url` en la pieza.
- La foto queda como elemento de imagen reemplazable. **Nunca se genera una imagen plana.**
- A verificar al llegar a esta etapa: el tipo de integración que permite Canva para uso propio y el proceso de revisión de la app.

**V5, agente de diseño:**
- Elige la plantilla y la composición según el formato, el pilar y las reglas visuales de la ficha.
- **Regla de variedad:** consulta `design_log` y **no repite una composición usada en las últimas 3 piezas del mismo formato**.
- Aprende de los diseños aprobados, que se marcan como "referencia".

---

## 10. Métricas (V6)

- **Paso 1:** carga manual o por CSV de las estadísticas de Instagram en `piece_metrics`.
- **Recordatorio del informe:** el sitio crea un `report` según `report_every_months` y avisa cuando se acerca la fecha.
- **Paquete para el informe:** igual que en la V2, el sitio arma un resumen de métricas por pilar, formato y servicio para pegar en Claude y armar el informe trimestral, como hacen hoy.
- **Paso 2 (opcional):** Instagram Graph API. La cuenta de EIA ya es profesional, pero además requiere vincularla a una página de Facebook y crear una app de Meta, así que se evalúa más adelante.
- **La IA de planificación** empieza a usar "qué funcionó mejor" como criterio.

---

## 11. Costos

| Concepto | Costo |
|---|---|
| Cloudflare Workers, GitHub, Google OAuth | USD 0 |
| Supabase (2 proyectos gratuitos) | USD 0 |
| Mails por Gmail SMTP | USD 0 |
| IA en modo manual (ChatGPT Go / Claude que ya usan) | USD 0 extra |
| Canva Pro (ya lo pagan) | USD 0 extra |
| **Total para arrancar** | **USD 0 / mes** |

**Costos opcionales a futuro:**
- **Dominio propio:** pago anual bajo.
- **IA por API:** se paga por uso, y conviene ponerle un tope mensual.
- **Supabase Pro:** hasta donde sé, unos USD 25 por mes. Solo haría falta si el sitio crece mucho o se necesitan backups automáticos.

**Construcción:** Claude Code requiere un plan de Claude que lo incluya.

---

## 12. Migración desde Notion

**Alcance:**
- Alrededor de 18 meses de contenido, unas **400 piezas**, repartidas en varios workspaces.
- Se migran **solo textos y links**. Los adjuntos no se migran.

**Pasos:**
1. Exportar cada workspace en "Markdown & CSV", con subpáginas.
2. El script `scripts/migracion-notion/`:
   - unifica las columnas de cada workspace (Nombre, Estado, Estado (2), Fecha, Plataforma, Tipo);
   - convierte los estados: "Historia/Publicación por diseñar" pasa a `todo`, "…diseñada" a `done`, "Publicado" a `published`, "Sin revisar/Revisado" a `pending/approved`;
   - convierte los formatos: "Vídeo" pasa a `reel`, "Imagen/foto" a `post`;
   - **separa el cuerpo de cada página en pantallas** usando los patrones que ya usan: "Texto principal", "Texto secundario", "Interacción", "Sticker de quiz/encuesta", "Cierre", "CTA", "Historia N", "Foto N", "Guion", "Qué mostrar", "Álbum", "Servicio";
   - guarda en `migration_notes` lo que no encaja;
   - descarta páginas vacías o plantillas ("Sin título").
3. **Clasificación con IA,** en modo manual y por tandas: asignar pilar, servicio y objetivo a cada pieza histórica.
4. Importar al proyecto de pruebas, **revisar una muestra de 20 piezas** y recién entonces importar a producción.

---

## 13. Roadmap

### Qué se construye primero y por qué

**La V1 es la base de todo.** La IA (V2 y V3), Canva (V4 y V5) y las métricas (V6) se apoyan en tres cosas que tienen que estar desde el principio:
- piezas con datos estructurados;
- pantallas;
- permisos correctos.

Si la V1 se hace bien, las demás versiones **agregan tablas y pantallas sin rehacer nada**.

### Plan

| Etapa | Fechas objetivo | Contenido |
|---|---|---|
| **Fase 0 · Preparación** | 29/09 – 01/10 | Gmail de Iris con verificación en dos pasos y contraseña de aplicación · GitHub · 2 proyectos Supabase · Cloudflare · OAuth de Google · repositorio con este documento |
| **V1-alpha (mínimo para planificar octubre)** | 01/10 – ~06/10 | Ingreso por invitación · espacio EIA · planificación mensual (borrador / enviar a revisión) · piezas con pantallas · calendario + lista · pantalla de Revisión · estados · celular |
| **Decisión** | **05/10** | Si la V1-alpha no está usable, **octubre se planifica en Notion** y se importa después. Así el trabajo no se frena. |
| **V1-beta** | octubre | Comentarios · historial · mail de aviso · pasar al mes siguiente · Esperando grabación · panel (usuarios, catálogos, ficha, planes) · exportar backup · ping semanal |
| **V1.1 · Migración** | octubre – noviembre | Historial completo de Notion + clasificación |
| **V2 · Planificación con IA** | noviembre – diciembre | Asistente en modo manual → propuestas → aplicar. Objetivo: planificar **enero** con IA. |
| **V3 · Brief y copy con IA** | enero | Propuestas de pantallas por pieza |
| **V4 · Canva** | febrero – marzo | Exportar CSV para Bulk Create → luego Autofill por API |
| **V5 · Agente de diseño** | después de V4 | Selección de plantilla y composición + regla de variedad |
| **V6 · Métricas** | en paralelo desde V1.1 | Carga manual de métricas + recordatorio y paquete para el informe |

### Orden de construcción de la V1-alpha (para Claude Code)

1. Proyecto Vite + React + TS + Tailwind, deploy en Cloudflare Workers.
2. Migración SQL: enums, `clients`, `memberships`, `profiles`, `monthly_plans`, `pieces`, `piece_frames`, catálogos + RLS + funciones de ayuda.
3. Ingreso: OTP de 6 dígitos + Google + hook de invitación + SMTP de Gmail.
4. `seed.sql`: EIA, usuarios invitados, pilares, servicios y la serie.
5. Pantallas: Mes (calendario + lista + cuota) → Pieza (con pantallas y copiar con un toque) → Revisión.

   **5b · Carga.** Requisito del paso 7. Ya formaba parte del contenido de la V1-alpha ("planificación mensual (borrador / enviar a revisión) · piezas con pantallas · estados"):
   - crear la planificación del mes y cambiar su estado (Borrador ↔ Enviada a revisión);
   - crear y editar piezas con sus pantallas (agregar, editar, ordenar y quitar pantallas);
   - cambiar el estado de producción y archivar.

   Lo hace solo el equipo de Iris (admin y editor), con escritura directa protegida por RLS (§7). No requiere migraciones. Marcar como Publicada va por `mark_published` (paso 6).
6. Funciones `review_piece` y `mark_published` + pruebas de permisos.
7. Prueba real: Lucía y Milagros cargan 3 piezas, y Jonathan (o una cuenta de prueba con rol aprobador) las revisa desde el celular.

---

## 14. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Mantenerlo sin saber programar | Este documento, `CLAUDE.md` / `AGENTS.md`, stack simple, pruebas de permisos y proyecto de pruebas separado |
| Error de permisos que exponga datos | RLS en todo, funciones controladas y pruebas antes de cada cambio |
| Cambios en los free tiers | Stack estándar y portable. El botón de exportar permite mudarse. |
| Pausa de Supabase por inactividad | Ping semanal con GitHub Actions |
| Canva cambie condiciones o requisitos | Plan B de CSV + Bulk Create, sin API |
| Privacidad con la IA | Obras confidenciales excluidas. Solo se envía información no sensible al plan gratuito. |
| Los reels dependen de Jonathan | La IA planifica según lo que realmente se graba. No se insiste. |
| Plazo de octubre | Fecha de decisión el 05/10, con Notion como respaldo |

---

## 15. Pendientes

- [ ] Cuestionario inicial de EIA (lo busca Milagros), para completar la ficha.
- [ ] Archivos originales del logo de EIA (los dos PNG) y del logo de Iris & Co.
- [ ] Confirmar los colores exactos, ya que estos se tomaron de los PDFs.
- [x] Plan de EIA: **Silver** (8 posteos + 15 historias). El precio vigente se carga desde el panel, en la tabla `plans`. **No se escribe en el repositorio.**
- [ ] Confirmar la frecuencia del informe: el presupuesto Silver dice bimestral y la práctica actual es trimestral. Por defecto se usa 3 meses.
- [x] La cuenta de Instagram de EIA es **profesional** e Iris tiene acceso a las estadísticas.
- [ ] Confirmar el plan de Canva.
- [ ] Lista de workspaces de Notion a migrar.
- [ ] Fechas importantes para EIA (efemérides de ingeniería y construcción, feriados, aniversario).

---

## Anexo A · Ficha inicial de EIA

**Fuentes:** el documento de Coderhouse y el análisis del contenido de septiembre de 2026.

- **Nombre:** EIA — Estudio de Ingeniería Aplicada · Instagram `@eia.ingenieria`
- **Quiénes son:** una empresa familiar de ingenieros civiles con experiencia en desarrollo, cálculo, dirección y ejecución de obras civiles.
- **Tipos de obra:** viviendas, edificios, galpones, puentes y rutas.
- **Servicios** (semilla para la tabla `services`):
  - Cálculo y diseño estructural
  - Asesoramiento técnico
  - Evaluación de estructuras existentes (modificaciones y ampliaciones)
  - Viabilidad estructural de obras nuevas, ampliaciones y reformas
  - Evaluación para retomar obras detenidas
  - Modelado estructural antes de construir
  - Galpones, depósitos, talleres y espacios productivos
  - Dirección y ejecución de obra
  - Obras viales (rutas, barreras New Jersey)
- **Zona:** Alto Valle de Río Negro. El público de referencia es de Villa Regina. También tienen obras en otras zonas, como Bahía Blanca.
- **Público principal:**
  - Hombres de 35 a 50 años, trabajadores independientes y apasionados por su oficio.
  - **Perfil "Juan":** 35 años, productor agropecuario de Villa Regina, con estudios universitarios.
  - Usa Facebook e Instagram todos los días, de forma pasiva.
  - Busca confiabilidad, profesionalismo y soluciones rápidas.
  - Quiere seguridad y tranquilidad, y **le teme a ser estafado**.
  - **Evita el tecnicismo excesivo y la pérdida de tiempo.**
- **Diferenciales:** servicio personalizado, profesionalismo, trato cercano, interacción con el cliente y seguimiento continuo. Tienen un alto nivel académico y experiencia en grandes obras.
- **Tono:** claro, cercano y profesional. Explica la ingeniería de forma simple y transmite seguridad.
- **Firma habitual:** "… | EIA Ingeniería".
- **Reglas:** no mostrar datos del cliente, ubicación ni planos identificables. Jonathan valida el contenido técnico.
- **Serie activa:** "Arquitectura alrededor del mundo".

## Anexo B · Identidad de Iris & Co (para el sitio)

- **Colores** (tomados del presupuesto):

  | Uso | Color |
  |---|---|
  | Violeta oscuro, principal (textos y botones) | `#421869` |
  | Lavanda | `#C5BDEF` |
  | Lila claro | `#E2D7EC` |
  | Verde lima | `#D0ECA5` |
  | Crema, fondo | `#FFFEEC` |

- **Estilo:** ondas retro y el asterisco sobre la "I".
- **Tipografías:** el logo va como imagen. Para los textos, Avenir LT Pro es paga, así que en la web se usa **Nunito Sans** (Google Fonts) como alternativa gratuita.

## Anexo C · Identidad de EIA (espacio del cliente y Canva)

- **Colores** (tomados del PDF de Coderhouse):

  | Uso | Color |
  |---|---|
  | Azul petróleo | `#2C3D42` |
  | Naranja | `#ED5824` |
  | Crema | `#F1E7DD` |

- **Tipografías:** Century Gothic (títulos y textos) y Open Sans. En la web se puede usar una alternativa gratuita similar a Century Gothic.
- **Logo:** "EIA." con el trazo de la I en ladrillos naranjas y la bajada "Estudio de Ingeniería Aplicada".
