-- =============================================================================
-- SOLO PARA PRUEBAS LOCALES. NUNCA se aplica en Supabase.
--
-- Imita lo mínimo de un proyecto Supabase para poder correr las migraciones y
-- las pruebas en un Postgres común: roles (anon, authenticated, service_role),
-- esquema auth con auth.users y auth.uid(), y el esquema extensions.
--
-- Además imita el peor caso de privilegios por defecto (tablas y funciones
-- nuevas expuestas a anon/authenticated), para comprobar que las migraciones
-- revocan todo explícitamente.
-- =============================================================================

-- Los roles son de todo el servidor: se crean solo si no existen (el runner
-- usa dos bases en el mismo servidor).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- Rol con el que Supabase Auth llama a los hooks.
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$$;

create schema auth;
create schema extensions;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key,
  email              text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb
);

-- Igual que en Supabase: el usuario sale del JWT de la request.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
