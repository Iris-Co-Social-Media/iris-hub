-- =============================================================================
-- V1-alpha · Paso 3 · Ingreso por invitación
-- Fuente de verdad: docs/ARQUITECTURA.md (secciones 2.3 y 5.5).
--
-- Solo AGREGA funciones y un trigger. No modifica ni recrea ninguna de las 16
-- tablas del núcleo, ni sus GRANT, ni sus políticas RLS.
--
--   * before_user_created_hook: hook "Before User Created" de Supabase Auth.
--     Rechaza crear cuentas para mails sin invitación activa en memberships.
--     Funciona igual para el código por mail y para Google.
--   * handle_new_auth_user: al crearse la cuenta, vincula las invitaciones de
--     ese mail (memberships.user_id) y crea su perfil.
--   * claim_invitations: vincula invitaciones hechas DESPUÉS de crear la cuenta
--     (por ejemplo, una persona que ya entró y luego es invitada a otro
--     cliente). El sitio la llama después de cada ingreso.
--
-- Por qué security definer en el hook: así Supabase Auth
-- (rol supabase_auth_admin) no necesita permisos ni políticas nuevas sobre
-- memberships. La función solo lee mail + active, tiene search_path vacío y
-- únicamente supabase_auth_admin puede ejecutarla.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Hook "Before User Created"
--    Entrada: { metadata, user: { email, ... } }. Salida: {} para permitir, o
--    { error: { http_code, message } } para rechazar. El mensaje es neutro:
--    no dice si el mail está invitado.
-- -----------------------------------------------------------------------------

create function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
begin
  if v_email is not null and v_email <> '' and exists (
    select 1
    from public.memberships m
    where m.email = v_email
      and m.active
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'No se pudo completar el ingreso.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;

revoke execute on function public.before_user_created_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;

-- -----------------------------------------------------------------------------
-- 2. Al crearse una cuenta: vincular invitaciones y crear el perfil
--    Si esto fallara, bloquearía el ingreso: por eso es simple y está probado.
-- -----------------------------------------------------------------------------

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null then
    update public.memberships
    set user_id = new.id
    where email = lower(btrim(new.email))
      and user_id is null;
  end if;

  -- Google manda full_name/name y avatar_url; con el código por mail quedan vacíos.
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_created_link_invitations
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 3. Vincular invitaciones posteriores a la creación de la cuenta
--    Solo las del mail de quien llama, y solo si ese mail ya está verificado.
--    Devuelve cuántas invitaciones vinculó.
-- -----------------------------------------------------------------------------

create function public.claim_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.' using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into v_email
  from auth.users u
  where u.id = v_uid
    and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  update public.memberships
  set user_id = v_uid
  where email = v_email
    and user_id is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.claim_invitations() from public, anon;
grant execute on function public.claim_invitations() to authenticated;
