-- =============================================================================
-- V1-alpha · Paso 2 · Núcleo de la base de datos
-- Fuente de verdad: docs/ARQUITECTURA.md (secciones 5.5, 6 y 7).
--
-- Esta migración crea: tipos fijos (enums), tablas del núcleo V1, claves
-- foráneas, restricciones e índices. La seguridad (GRANT + RLS) está en
-- 20260930120100_v1_rls.sql y las acciones controladas en
-- 20260930120200_v1_client_actions.sql. Las tres se aplican juntas.
--
-- Criterio para ON DELETE (la arquitectura no lo define):
--   * Por defecto RESTRICT: no se borran en cascada datos del negocio
--     (clientes, planificaciones, piezas, catálogos, historial). Para "sacar"
--     algo se usa active = false o el estado 'archived'.
--   * CASCADE solo para filas que no tienen sentido sin su padre:
--     piece_frames y comments de una pieza, y profiles de un usuario de Auth.
--   * SET NULL para referencias a personas (auth.users): si se elimina una
--     cuenta, el contenido y el historial se conservan sin autor.
--   * activity_log.piece_id usa SET NULL para que el historial sobreviva
--     aunque una admin borre la pieza.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos fijos (sección 6.1)
-- -----------------------------------------------------------------------------

create type public.member_role as enum ('admin', 'editor', 'approver', 'viewer');

create type public.piece_format as enum ('story', 'post', 'carousel', 'reel');

create type public.piece_status as enum (
  'todo', 'awaiting_recording', 'recorded', 'done', 'published', 'archived'
);

create type public.review_status as enum ('pending', 'approved', 'changes_requested');

create type public.plan_status as enum ('draft', 'in_review', 'reviewed', 'closed');

create type public.objective as enum ('educate', 'leads', 'experience', 'engagement', 'brand');

create type public.interaction_type as enum ('none', 'poll', 'quiz', 'question', 'slider');

create type public.piece_origin as enum ('manual', 'ai', 'notion_import');

-- -----------------------------------------------------------------------------
-- 2. updated_at automático
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Planes (solo admin; contiene precios)
-- -----------------------------------------------------------------------------

create table public.plans (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  quota_posts         integer not null default 0 check (quota_posts >= 0),
  quota_stories       integer not null default 0 check (quota_stories >= 0),
  includes_copy       boolean not null default false,
  includes_filming    boolean not null default false,
  report_every_months integer check (report_every_months > 0),
  monthly_price       numeric(12, 2) check (monthly_price >= 0),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint plans_name_key unique (name)
);

comment on table public.plans is
  'Plantillas de planes y precios. Solo admins (sección 2.2). El precio vigente se carga desde el panel, nunca en el repositorio.';

-- -----------------------------------------------------------------------------
-- 4. Clientes
-- -----------------------------------------------------------------------------

create table public.clients (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  slug                       text not null,
  logo_url                   text,
  brand_colors               jsonb not null default '{}'::jsonb,
  signature                  text,
  instagram_handle           text,
  plan_id                    uuid references public.plans (id) on delete restrict,
  quota_posts                integer not null default 0 check (quota_posts >= 0),
  quota_stories              integer not null default 0 check (quota_stories >= 0),
  publish_copy_enabled       boolean not null default false,
  -- Sección 15: por defecto se usa 3 meses.
  report_every_months        integer not null default 3 check (report_every_months > 0),
  review_email_enabled       boolean not null default false,
  review_email_text          text,
  notify_team_on_review_done boolean not null default false,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint clients_slug_key unique (slug),
  constraint clients_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint clients_brand_colors_is_object check (jsonb_typeof(brand_colors) = 'object')
);

-- -----------------------------------------------------------------------------
-- 5. Membresías (invitaciones y roles). La lista blanca de mails sale de acá.
-- -----------------------------------------------------------------------------

create table public.memberships (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  -- Se completa cuando la persona entra por primera vez (paso 3, Auth).
  user_id            uuid references auth.users (id) on delete set null,
  -- null = equipo de Iris.
  client_id          uuid references public.clients (id) on delete restrict,
  role               public.member_role not null,
  can_review         boolean not null default false,
  can_comment        boolean not null default false,
  can_mark_published boolean not null default false,
  notify_on_review   boolean not null default false,
  active             boolean not null default true,
  invited_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint memberships_email_lowercase check (email = lower(btrim(email)) and email <> ''),
  -- Admin/Editor son roles de Iris (client_id null); Aprobador/Lector son del
  -- lado del cliente (sección 2.1).
  constraint memberships_role_matches_side check (
    (client_id is null and role in ('admin', 'editor'))
    or (client_id is not null and role in ('approver', 'viewer'))
  ),
  -- Una sola invitación por mail y espacio (el equipo cuenta como un espacio).
  constraint memberships_email_client_key unique nulls not distinct (email, client_id)
);

create index memberships_user_id_idx on public.memberships (user_id) where active;
create index memberships_client_id_idx on public.memberships (client_id);

-- -----------------------------------------------------------------------------
-- 6. Perfiles
-- -----------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7. Planificación mensual
-- -----------------------------------------------------------------------------

create table public.monthly_plans (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id) on delete restrict,
  -- Día 1 del mes.
  month              date not null check (extract(day from month) = 1),
  status             public.plan_status not null default 'draft',
  sent_for_review_at timestamptz,
  reviewed_at        timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint monthly_plans_client_month_key unique (client_id, month),
  -- Permite que pieces verifique que la planificación es del mismo cliente.
  constraint monthly_plans_client_id_id_key unique (client_id, id)
);

-- -----------------------------------------------------------------------------
-- 8. Catálogos editables (client_id, name, description, active, position)
-- -----------------------------------------------------------------------------

create table public.pillars (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete restrict,
  name        text not null,
  description text,
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pillars_client_name_key unique (client_id, name),
  constraint pillars_client_id_id_key unique (client_id, id)
);

create table public.services (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete restrict,
  name        text not null,
  description text,
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint services_client_name_key unique (client_id, name),
  constraint services_client_id_id_key unique (client_id, id)
);

create table public.series (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete restrict,
  name        text not null,
  description text,
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint series_client_name_key unique (client_id, name),
  constraint series_client_id_id_key unique (client_id, id)
);

-- Obras.
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete restrict,
  name         text not null,
  description  text,
  active       boolean not null default true,
  position     integer not null default 0,
  kind         text,
  general_area text,
  year         integer check (year between 1900 and 2100),
  album_url    text,
  -- Las obras confidenciales nunca se envían a proveedores de IA (sección 7.8).
  confidential boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint projects_client_name_key unique (client_id, name),
  constraint projects_client_id_id_key unique (client_id, id)
);

-- -----------------------------------------------------------------------------
-- 9. Piezas
-- -----------------------------------------------------------------------------

create table public.pieces (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients (id) on delete restrict,
  -- null = Banco de ideas.
  monthly_plan_id        uuid,
  title                  text not null check (btrim(title) <> ''),
  format                 public.piece_format not null,
  platform               text not null default 'instagram',
  -- Fecha estimativa (D9): sin alertas de atraso.
  estimated_date         date,
  -- Estado de producción y revisión del cliente son campos separados (3.2).
  status                 public.piece_status not null default 'todo',
  review_status          public.review_status not null default 'pending',
  review_note            text,
  reviewed_by            uuid references auth.users (id) on delete set null,
  reviewed_at            timestamptz,
  pillar_id              uuid,
  service_id             uuid,
  series_id              uuid,
  project_id             uuid,
  objective              public.objective,
  interaction            public.interaction_type not null default 'none',
  needs_client_on_camera boolean not null default false,
  script                 text,
  publish_copy           text,
  canva_url              text,
  album_url              text,
  assignee_id            uuid references auth.users (id) on delete set null,
  times_carried_over     integer not null default 0 check (times_carried_over >= 0),
  published_at           timestamptz,
  origin                 public.piece_origin not null default 'manual',
  migration_notes        text,
  created_by             uuid default auth.uid() references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- "Esperando grabación" y "Grabado" solo existen para reels (sección 6.1).
  constraint pieces_recording_status_only_reels check (
    status not in ('awaiting_recording', 'recorded') or format = 'reel'
  ),
  -- Claves foráneas compuestas: la planificación y los catálogos tienen que ser
  -- del MISMO cliente que la pieza. Evita mezclar datos entre clientes aunque
  -- alguien manipule los ids. Si la columna es null, no se verifica (MATCH SIMPLE).
  constraint pieces_monthly_plan_fk foreign key (client_id, monthly_plan_id)
    references public.monthly_plans (client_id, id) on delete restrict,
  constraint pieces_pillar_fk foreign key (client_id, pillar_id)
    references public.pillars (client_id, id) on delete restrict,
  constraint pieces_service_fk foreign key (client_id, service_id)
    references public.services (client_id, id) on delete restrict,
  constraint pieces_series_fk foreign key (client_id, series_id)
    references public.series (client_id, id) on delete restrict,
  constraint pieces_project_fk foreign key (client_id, project_id)
    references public.projects (client_id, id) on delete restrict
);

create index pieces_client_plan_idx on public.pieces (client_id, monthly_plan_id);
create index pieces_monthly_plan_idx on public.pieces (monthly_plan_id, estimated_date);
create index pieces_client_status_idx on public.pieces (client_id, status, review_status);

-- -----------------------------------------------------------------------------
-- 10. Pantallas / láminas de cada pieza
-- -----------------------------------------------------------------------------

create table public.piece_frames (
  id               uuid primary key default gen_random_uuid(),
  -- CASCADE: una pantalla no existe sin su pieza.
  piece_id         uuid not null references public.pieces (id) on delete cascade,
  position         integer not null check (position > 0),
  label            text,
  headline         text,
  body             text,
  visual_direction text,
  -- {type, question, options[], correct_index}
  interaction      jsonb check (interaction is null or jsonb_typeof(interaction) = 'object'),
  closing          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index piece_frames_piece_position_idx on public.piece_frames (piece_id, position);

-- -----------------------------------------------------------------------------
-- 11. Ficha del cliente
-- -----------------------------------------------------------------------------

create table public.client_profiles (
  client_id                  uuid primary key references public.clients (id) on delete restrict,
  description                text,
  service_area               text,
  differentiators            text,
  tone                       text,
  ai_rules                   text[] not null default '{}',
  forbidden_topics           text[] not null default '{}',
  needs_technical_validation text,
  visual_rules               text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table public.audience_personas (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete restrict,
  name       text not null,
  -- edad, zona, ocupación, hábitos, miedos, deseos…
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audience_personas_client_idx on public.audience_personas (client_id);

-- -----------------------------------------------------------------------------
-- 12. Colaboración
-- -----------------------------------------------------------------------------

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  -- CASCADE: un comentario no tiene sentido sin su pieza.
  piece_id   uuid not null references public.pieces (id) on delete cascade,
  author_id  uuid default auth.uid() references auth.users (id) on delete set null,
  body       text not null check (btrim(body) <> '' and char_length(body) <= 5000),
  -- internal = solo lo ve el equipo de Iris.
  internal   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_piece_idx on public.comments (piece_id, created_at);

-- Historial. Solo lo escribe el trigger de pieces; nadie lo edita.
create table public.activity_log (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  -- SET NULL: el historial se conserva si una admin borra la pieza.
  piece_id  uuid references public.pieces (id) on delete set null,
  actor_id  uuid references auth.users (id) on delete set null,
  action    text not null,
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);

create index activity_log_client_at_idx on public.activity_log (client_id, at desc);
create index activity_log_piece_at_idx on public.activity_log (piece_id, at desc);

-- -----------------------------------------------------------------------------
-- 13. Informes de métricas
-- -----------------------------------------------------------------------------

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete restrict,
  period_start date not null,
  period_end   date not null,
  due_date     date,
  status       text not null default 'pending' check (status in ('pending', 'done')),
  link         text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reports_period_order check (period_end >= period_start)
);

create index reports_client_due_idx on public.reports (client_id, due_date);

-- -----------------------------------------------------------------------------
-- 14. Triggers de updated_at
-- -----------------------------------------------------------------------------

create trigger set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.monthly_plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pillars
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.series
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pieces
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.piece_frames
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.client_profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.audience_personas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.comments
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();
