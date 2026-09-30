-- Pruebas del ingreso por invitación (paso 3): hook "Before User Created",
-- vinculación de invitaciones y creación de perfiles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.clients (id, name, slug) values
  ('cccccccc-0000-0000-0000-000000000001', 'EIA Ingeniería', 'eia');

insert into public.memberships (email, client_id, role, active) values
  ('invitada@iris.test', null, 'admin', true),
  ('jonathan@eia.test', 'cccccccc-0000-0000-0000-000000000001', 'approver', true),
  ('quitada@eia.test', 'cccccccc-0000-0000-0000-000000000001', 'viewer', false);

-- Evento de ejemplo, con la forma que manda Supabase Auth.
create function pg_temp.hook_event(p_email text) returns jsonb language sql as $$
  select jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created', 'ip_address', '127.0.0.1'),
    'user', jsonb_build_object('id', gen_random_uuid(), 'email', p_email,
      'app_metadata', jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')))
  )
$$;

-- ---------------------------------------------------------------------------
-- Permisos del hook
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('supabase_auth_admin', 'public.before_user_created_hook(jsonb)', 'EXECUTE'),
  'Supabase Auth puede ejecutar el hook'
);
select ok(
  not has_function_privilege('anon', 'public.before_user_created_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.before_user_created_hook(jsonb)', 'EXECUTE'),
  'nadie desde el sitio puede ejecutar el hook (no sirve para averiguar invitaciones)'
);
select ok(
  not has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE'),
  'nadie desde el sitio puede ejecutar el trigger de cuentas nuevas'
);
select ok(
  not has_function_privilege('anon', 'public.claim_invitations()', 'EXECUTE'),
  'sin sesión no se puede ejecutar claim_invitations'
);
select ok(
  not has_table_privilege('supabase_auth_admin', 'public.memberships', 'SELECT'),
  'Supabase Auth no recibe acceso directo a memberships'
);

-- ---------------------------------------------------------------------------
-- Hook, ejecutado como lo hace Supabase Auth
-- ---------------------------------------------------------------------------
-- Se ejecuta como supabase_auth_admin (igual que Supabase Auth) y los
-- resultados se verifican después como postgres.
create temp table hook_results (label text primary key, result jsonb);
grant insert on hook_results to supabase_auth_admin;

-- El evento se arma antes de cambiar de rol.
create temp table hook_inputs as
select * from (values
  ('invitada', pg_temp.hook_event('invitada@iris.test')),
  ('mayusculas', pg_temp.hook_event('  Jonathan@EIA.test ')),
  ('no_invitada', pg_temp.hook_event('nadie@test.test')),
  ('desactivada', pg_temp.hook_event('quitada@eia.test')),
  ('vacio', pg_temp.hook_event('')),
  ('sin_mail', '{"metadata": {}, "user": {"phone": "123"}}'::jsonb)
) as v(label, event);
grant select on hook_inputs to supabase_auth_admin;

set local role supabase_auth_admin;
insert into hook_results
select label, public.before_user_created_hook(event) from hook_inputs;
reset role;

select is((select result::text from hook_results where label = 'invitada'), '{}',
  'hook: permite un mail invitado');
select is((select result::text from hook_results where label = 'mayusculas'), '{}',
  'hook: no distingue mayúsculas ni espacios');
select is((select result -> 'error' ->> 'http_code' from hook_results where label = 'no_invitada'), '403',
  'hook: rechaza un mail no invitado');
select is((select result -> 'error' ->> 'http_code' from hook_results where label = 'desactivada'), '403',
  'hook: rechaza una invitación desactivada');
select is((select result -> 'error' ->> 'http_code' from hook_results where label = 'vacio'), '403',
  'hook: rechaza un mail vacío');
select is((select result -> 'error' ->> 'http_code' from hook_results where label = 'sin_mail'), '403',
  'hook: rechaza una cuenta sin mail');
select is((select result -> 'error' ->> 'message' from hook_results where label = 'no_invitada'),
  'No se pudo completar el ingreso.',
  'hook: el mensaje de rechazo es neutro (no menciona invitaciones ni el mail)');

-- ---------------------------------------------------------------------------
-- Cuenta nueva: vincula invitaciones y crea el perfil
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000003', 'Jonathan@eia.test', null,
   '{"full_name": "Jonathan Pérez", "avatar_url": "https://example.test/a.png"}'),
  ('11111111-0000-0000-0000-000000000009', 'sininvitacion@test.test', now(), null);

select is(
  (select user_id::text from public.memberships where email = 'jonathan@eia.test'),
  '11111111-0000-0000-0000-000000000003',
  'cuenta nueva: se vincula su invitación'
);
select results_eq(
  $$ select full_name, avatar_url from public.profiles where id = '11111111-0000-0000-0000-000000000003' $$,
  $$ values ('Jonathan Pérez', 'https://example.test/a.png') $$,
  'cuenta nueva: se crea su perfil con los datos de Google'
);
select is(
  (select count(*)::int from public.memberships where user_id = '11111111-0000-0000-0000-000000000009'),
  0,
  'cuenta sin invitación (creada a mano): no se vincula nada'
);
select is(
  (select count(*)::int from public.profiles where id = '11111111-0000-0000-0000-000000000009'),
  1,
  'cuenta sin invitación: igual se crea su perfil (sin acceso a datos)'
);
select is(
  (select count(*)::int from public.memberships where user_id is not null and email <> 'jonathan@eia.test'),
  0,
  'cuenta nueva: no toca invitaciones de otros mails'
);

-- ---------------------------------------------------------------------------
-- claim_invitations: invitaciones hechas después de crear la cuenta
-- ---------------------------------------------------------------------------
insert into public.memberships (email, client_id, role) values
  ('sininvitacion@test.test', 'cccccccc-0000-0000-0000-000000000001', 'viewer');

-- Jonathan todavía no verificó su mail: no puede reclamar nada.
with c as (
  insert into public.clients (name, slug) values ('Otro', 'otro') returning id
)
insert into public.memberships (email, client_id, role)
select 'jonathan@eia.test', id, 'viewer' from c;

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "11111111-0000-0000-0000-000000000003", "role": "authenticated"}', true);
select is(public.claim_invitations(), 0, 'claim_invitations: con el mail sin verificar no vincula nada');

select set_config('request.jwt.claims', '{"sub": "11111111-0000-0000-0000-000000000009", "role": "authenticated"}', true);
select is(public.claim_invitations(), 1, 'claim_invitations: vincula la invitación nueva de su mail');
select is(public.claim_invitations(), 0, 'claim_invitations: es seguro llamarla varias veces');

select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.claim_invitations() $$,
  '42501', null,
  'claim_invitations: exige sesión'
);

reset role;

select is(
  (select count(*)::int from public.memberships where email = 'jonathan@eia.test' and user_id is null),
  1,
  'claim_invitations: no vincula invitaciones de otros mails'
);

select * from finish();
rollback;
