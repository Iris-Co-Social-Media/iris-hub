# Ingreso · Configuración manual (V1-alpha, paso 3)

Guía paso a paso de lo que se hace **a mano** en Supabase, Google y Cloudflare para que funcione el
ingreso. Todo va en el proyecto **iris-pruebas**. **iris-prod no se toca todavía.**

Se hace en este orden: A → B → C → D → E. Cada paso dice qué tenés que ver para saber que salió bien.

> **Secretos.** La contraseña de aplicación de Gmail y el "Client secret" de Google se pegan
> **solo** en el panel de Supabase. Nunca en GitHub, en el código, en un `.env` ni en un chat.

---

## A. Aplicar la migración de ingreso

1. Supabase → proyecto **iris-pruebas** (fijate el nombre arriba a la izquierda) → **SQL Editor** → **New query**.
2. Copiá y pegá **todo** el archivo `supabase/migrations/20260930130000_v1_auth.sql` y tocá **Run**.
   Si aparece un cartel de advertencia, confirmá con "Run this query".
3. Tiene que decir **"Success. No rows returned"**. Se corre **una sola vez**. Si da error, no lo
   repitas: copiá el mensaje completo y pasáselo a la IA.
4. Comprobación (consulta nueva → Run):

   ```sql
   select
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('before_user_created_hook', 'handle_new_auth_user', 'claim_invitations')) as funciones,
     (select count(*) from pg_trigger where tgname = 'on_auth_user_created_link_invitations') as trigger_cuentas;
   ```

   Tiene que dar **funciones = 3** y **trigger_cuentas = 1**.

## B. Supabase Auth

Todo en Supabase → **iris-pruebas** → menú **Authentication**. Supabase cambia seguido los nombres
del menú; si algo no coincide exacto, buscá la opción más parecida.

### B1. Activar el control de invitaciones (hook)

**Authentication → Hooks** → **Add hook** → **Before User Created**:
- Hook type: **Postgres**
- Schema: **public**
- Function: **before_user_created_hook**
- Guardar y dejarlo **activado**.

Desde ese momento, solo se pueden crear cuentas para mails con una invitación activa en `memberships`.
Vale para el código por mail y para Google.

### B2. Código de 6 dígitos que vence en 10 minutos

**Authentication → Sign In / Providers → Email**:
- **Enable Email provider**: activado.
- **Allow new users to sign up**: **activado**. Parece raro, pero es necesario: la primera vez que
  una persona invitada entra, se le crea la cuenta. El hook de B1 es el que bloquea a quien no está invitado.
- **Confirm email**: activado.
- **Email OTP Expiration**: **600** (segundos = 10 minutos).
- **Email OTP Length** (si aparece): **6**.
- Guardar.

### B3. Plantillas de mail (código en vez de link)

**Authentication → Emails → Templates**. Hay que cambiar **dos** plantillas, porque la primera vez
que alguien entra Supabase usa "Confirm signup", y las siguientes veces usa "Magic Link":

1. **Confirm signup**
2. **Magic Link**

> ⚠️ Si alguna de las dos plantillas conserva `{{ .ConfirmationURL }}`, el mail llega con un
> **link** en vez del código. Ese link lleva al "Site URL" (por defecto `localhost`) y da
> `ERR_CONNECTION_REFUSED`. Las dos tienen que quedar **solo** con `{{ .Token }}`.

En las dos, poné:
- **Subject:** `Tu código para entrar a Iris & Co`
- **Body** (reemplazá todo):

```html
<h2>Tu código de ingreso</h2>
<p>Escribí este código en la pantalla de ingreso de Iris &amp; Co · Planificación:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Vence en 10 minutos y sirve una sola vez.</p>
<p>Si no pediste este código, ignorá este mail.</p>
```

Guardá cada una.

### B4. Enviar los mails desde el Gmail de Iris

Antes necesitás la **contraseña de aplicación** del Gmail de Iris. Es de 16 letras y se crea en la
cuenta de Google → Seguridad → Contraseñas de aplicaciones. Requiere tener la verificación en dos pasos activa.

**Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:
- **Sender email:** el Gmail de Iris.
- **Sender name:** `Iris & Co`
- **Host:** `smtp.gmail.com`
- **Port:** `465`
- **Username:** el Gmail de Iris (completo).
- **Password:** la contraseña de aplicación de 16 letras, **sin espacios**.
- Guardar.

Después, en **Authentication → Rate Limits**: Supabase arranca con 30 mails por hora cuando se usa
SMTP propio. Para empezar alcanza. Si en algún momento no llegan mails, revisá este número.

### B5. Direcciones del sitio

El sitio está en Cloudflare Workers, con el subdominio `irisandco-socialmedia.workers.dev`:
- **Producción** (rama `main`): `https://iris-hub.irisandco-socialmedia.workers.dev`
- **Vistas previas** (otras ramas): `https://<rama>-iris-hub.irisandco-socialmedia.workers.dev`.
  Ejemplo: `https://claude-clever-goldberg-bakhgy-iris-hub.irisandco-socialmedia.workers.dev`

**Authentication → URL Configuration**:
- **Site URL:** `https://iris-hub.irisandco-socialmedia.workers.dev`
  Es la dirección "por defecto". Si queda en `http://localhost:3000` (lo que trae Supabase), cualquier
  mail con link lleva a `localhost` y falla.
- **Redirect URLs:** agregá una por una:
  - `https://iris-hub.irisandco-socialmedia.workers.dev/**`
  - `https://*-iris-hub.irisandco-socialmedia.workers.dev/**` (todas las vistas previas)
  - `http://localhost:5173/**` (para probar en la compu)

El sitio le pide a Supabase volver a la misma dirección desde donde se abrió (vista previa,
producción o la compu). Si esa dirección no está en esta lista, Supabase usa el Site URL.

## C. Google ("Entrar con Google")

### C1. En Google Cloud Console (con la cuenta de Iris)

1. Entrá a **console.cloud.google.com**, creá un proyecto (por ejemplo, `iris-planificacion`) y abrí
   **Google Auth Platform**.
2. **Branding:** nombre de la app `Iris & Co · Planificación`, mail de soporte = el Gmail de Iris.
3. **Audience:** tipo **External**. Pasalo a **In production** ("Publish app"). Como solo pide nombre,
   mail y foto, Google no exige verificación. Si lo dejás en "Testing", solo pueden entrar los mails
   que agregues como "test users".
4. **Data Access (Scopes):** agregá `openid`, `.../auth/userinfo.email` y `.../auth/userinfo.profile`.
5. **Clients → Create client** → tipo **Web application**:
   - **Authorized JavaScript origins:** no hace falta completarlo. Google devuelve a la persona a
     Supabase (no al sitio), y Supabase la devuelve al sitio usando la lista de B5.
   - **Authorized redirect URIs:** la "Callback URL" que muestra Supabase en
     **Authentication → Sign In / Providers → Google**. Tiene la forma
     `https://<referencia-del-proyecto>.supabase.co/auth/v1/callback`.
   - Crear. Copiá el **Client ID** y el **Client secret**.

### C2. En Supabase

**Authentication → Sign In / Providers → Google**:
- Activar.
- Pegar el **Client ID** y el **Client secret**. El secret va **solo acá**.
- Guardar.

## D. Cloudflare: las dos variables del sitio

El sitio necesita dos datos **públicos** de iris-pruebas. Están en Supabase → **Project Settings → API Keys**
(y la dirección, en **Data API** o **General**):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://<referencia-del-proyecto>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la **Publishable key** (`sb_publishable_…`). Si no aparece, la **anon public key**. **Nunca** la "secret key" ni la "service_role". |

Si por error se carga una clave secreta, el sitio no arranca y muestra un aviso.

Hay que cargarlas en Cloudflare para **producción y para las vistas previas**; por ahora, las dos con
iris-pruebas. Tienen que estar disponibles **al compilar** (build). Si se cambian, hay que volver a
publicar para que tomen efecto. Para pasar a producción más adelante, alcanza con cambiar estos dos
valores por los de iris-prod.

En Cloudflare van en **Workers & Pages → iris-hub → Settings → Build → Variables and secrets**
(variables de compilación). Si se cargan en otro lugar, el sitio no las ve y muestra
"Falta configurar el sitio".

## E. Para probar en la compu (opcional)

Copiá `.env.example` como `.env.local`, completá los dos valores y corré `npm run dev`.
`.env.local` nunca se sube a GitHub.

## F. Prueba final (cuando estén cargadas las invitaciones iniciales)

1. Entrar con el mail invitado → llega el código → entrar → pantalla **"¡Estás adentro!"** con el rol **Admin**.
2. Recargar la página: sigue adentro. Tocar **Salir**: vuelve a la pantalla de ingreso.
3. Probar con un mail **no invitado**: la pantalla muestra el mismo mensaje, pero **no llega ningún mail**.
4. Probar **Entrar con Google** con la cuenta invitada.
