-- =============================================================================
-- V1-alpha · Paso 4 · Datos iniciales
-- Fuente de verdad: docs/ARQUITECTURA.md (§6.2, §13 paso 4, §15, Anexos A y C).
--
-- Qué carga:
--   * Plan "Silver" (8 posteos + 15 historias). SIN precio: el precio vigente
--     se carga desde el panel, nunca en el repositorio (§15).
--   * Cliente EIA con su marca, firma, Instagram y cuota.
--   * Ficha de EIA y el perfil de público "Juan" (Anexo A).
--   * Catálogos de EIA: 6 pilares, 9 servicios y 1 serie.
--
-- Qué NO carga:
--   * Obras (projects): todavía no hay datos.
--   * Invitaciones nuevas: ver el bloque comentado al final. La primera admin
--     ya está en la migración 20260930140000_v1_initial_admin_invitation.sql.
--   * Planificaciones ni piezas.
--
-- Se puede correr varias veces: nunca duplica y nunca pisa datos que ya
-- existan (si alguien editó algo desde el panel, se respeta).
-- No cambia el esquema ni las políticas RLS. Se corre como administrador de la
-- base (SQL Editor de Supabase o `supabase db reset` en local).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plan Silver (solo admin lo ve; sin precio)
-- -----------------------------------------------------------------------------
insert into public.plans (name, quota_posts, quota_stories, includes_copy, includes_filming,
                          report_every_months, monthly_price, notes)
values ('Silver', 8, 15, false, false, 3, null,
        'Precio vigente y detalles del plan: se completan desde el panel.')
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Cliente EIA
-- -----------------------------------------------------------------------------
insert into public.clients (name, slug, logo_url, brand_colors, signature, instagram_handle,
                            plan_id, quota_posts, quota_stories, publish_copy_enabled,
                            report_every_months, review_email_enabled, review_email_text,
                            notify_team_on_review_done, active)
values (
  'EIA Ingeniería',
  'eia',
  null,  -- pendiente: archivos originales del logo (§15)
  '{"primary": "#2C3D42", "secondary": "#ED5824", "background": "#F1E7DD"}'::jsonb,
  '| EIA Ingeniería',
  '@eia.ingenieria',
  (select id from public.plans where name = 'Silver'),
  8,
  15,
  false,  -- Julieta escribe el copy
  3,      -- por defecto 3 meses hasta confirmar (§15)
  false,  -- el mail de aviso llega en la V1-beta
  null,
  false,
  true
)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Ficha de EIA (Anexo A)
-- -----------------------------------------------------------------------------
insert into public.client_profiles (client_id, description, service_area, differentiators, tone,
                                    ai_rules, forbidden_topics, needs_technical_validation,
                                    visual_rules)
select
  c.id,
  'EIA — Estudio de Ingeniería Aplicada. Empresa familiar de ingenieros civiles con experiencia '
    || 'en desarrollo, cálculo, dirección y ejecución de obras civiles. Tipos de obra: viviendas, '
    || 'edificios, galpones, puentes y rutas.',
  'Alto Valle de Río Negro. El público de referencia es de Villa Regina. También tienen obras en '
    || 'otras zonas, como Bahía Blanca.',
  'Servicio personalizado, profesionalismo, trato cercano, interacción con el cliente y seguimiento '
    || 'continuo. Alto nivel académico y experiencia en grandes obras.',
  'Claro, cercano y profesional. Explica la ingeniería de forma simple y transmite seguridad.',
  array[
    'No mostrar datos del cliente, ubicación ni planos identificables.',
    'Jonathan valida el contenido técnico.'
  ],
  '{}'::text[],
  'Todo el contenido técnico (cálculos, normativa) lo valida Jonathan.',
  'Colores: azul petróleo #2C3D42, naranja #ED5824, crema #F1E7DD. Tipografías: Century Gothic '
    || '(títulos y textos) y Open Sans. Logo: "EIA." con el trazo de la I en ladrillos naranjas y '
    || 'la bajada "Estudio de Ingeniería Aplicada".'
from public.clients c
where c.slug = 'eia'
on conflict (client_id) do nothing;

-- Perfil de público "Juan" (Anexo A). La tabla no tiene clave única por nombre,
-- por eso se controla con "where not exists".
insert into public.audience_personas (client_id, name, data)
select
  c.id,
  'Juan',
  jsonb_build_object(
    'edad', 35,
    'zona', 'Villa Regina (Alto Valle de Río Negro)',
    'ocupacion', 'Productor agropecuario, con estudios universitarios',
    'publico_general', 'Hombres de 35 a 50 años, trabajadores independientes y apasionados por su oficio',
    'habitos', 'Usa Facebook e Instagram todos los días, de forma pasiva',
    'busca', 'Confiabilidad, profesionalismo y soluciones rápidas',
    'deseos', 'Seguridad y tranquilidad',
    'miedos', 'Ser estafado',
    'evita', 'El tecnicismo excesivo y la pérdida de tiempo'
  )
from public.clients c
where c.slug = 'eia'
  and not exists (
    select 1 from public.audience_personas p where p.client_id = c.id and p.name = 'Juan'
  );

-- -----------------------------------------------------------------------------
-- 4. Catálogos de EIA (§6.2 y Anexo A)
-- -----------------------------------------------------------------------------
insert into public.pillars (client_id, name, position)
select c.id, v.name, v.position
from public.clients c
cross join (values
  ('Educativo técnico', 1),
  ('Servicios', 2),
  ('Obra real', 3),
  ('Series/cultura', 4),
  ('Actualidad', 5),
  ('Marca', 6)
) as v(name, position)
where c.slug = 'eia'
on conflict (client_id, name) do nothing;

insert into public.services (client_id, name, position)
select c.id, v.name, v.position
from public.clients c
cross join (values
  ('Cálculo y diseño estructural', 1),
  ('Asesoramiento técnico', 2),
  ('Evaluación de estructuras existentes (modificaciones y ampliaciones)', 3),
  ('Viabilidad estructural de obras nuevas, ampliaciones y reformas', 4),
  ('Evaluación para retomar obras detenidas', 5),
  ('Modelado estructural antes de construir', 6),
  ('Galpones, depósitos, talleres y espacios productivos', 7),
  ('Dirección y ejecución de obra', 8),
  ('Obras viales (rutas, barreras New Jersey)', 9)
) as v(name, position)
where c.slug = 'eia'
on conflict (client_id, name) do nothing;

insert into public.series (client_id, name, position)
select c.id, 'Arquitectura alrededor del mundo', 1
from public.clients c
where c.slug = 'eia'
on conflict (client_id, name) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Invitaciones (§2.1) — PREPARADAS, NO ACTIVAS
--    No se cargan mails que no fueron confirmados. Para invitar a alguien,
--    descomentá su línea, completá el mail real EN MINÚSCULAS y corré solo
--    este bloque. Quien entra por primera vez queda vinculada sola (paso 3).
--    Más adelante esto se hace desde el panel (Usuarios e invitaciones).
-- -----------------------------------------------------------------------------
-- insert into public.memberships (email, client_id, role, can_review, can_comment,
--                                 can_mark_published, notify_on_review, active)
-- values
--   -- Milagros Cárdenas · Iris & Co · Admin
--   ('MAIL_DE_MILAGROS', null, 'admin', true, true, true, true, true),
--   -- Jonathan · EIA · Aprobador · recibe el mail de aviso
--   ('MAIL_DE_JONATHAN', (select id from public.clients where slug = 'eia'),
--    'approver', false, false, false, true, true),
--   -- Julieta · EIA · Lectora · puede marcar publicadas y recibe el mail de aviso
--   ('MAIL_DE_JULIETA', (select id from public.clients where slug = 'eia'),
--    'viewer', false, false, true, true, true),
--   -- Padre de Jonathan · EIA · Lector
--   ('MAIL_DEL_PADRE_DE_JONATHAN', (select id from public.clients where slug = 'eia'),
--    'viewer', false, false, false, false, true)
-- on conflict on constraint memberships_email_client_key do nothing;
