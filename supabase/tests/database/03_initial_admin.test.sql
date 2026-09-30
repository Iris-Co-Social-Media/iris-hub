-- Pruebas de la invitación inicial de administradora
-- (migración 20260930140000_v1_initial_admin_invitation.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------------------------------------------------------------------------
-- La invitación existe con los datos pedidos
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select role::text, client_id is null, can_review, can_comment, can_mark_published,
            notify_on_review, active, user_id is null
     from public.memberships where email = 'oliveraluciasoledad@gmail.com' $$,
  $$ values ('admin', true, true, true, true, true, true, true) $$,
  'invitación inicial: admin del equipo de Iris, activa, con todos los permisos extra y sin cuenta vinculada todavía'
);
select is(
  (select count(*)::int from public.memberships where email = 'oliveraluciasoledad@gmail.com'),
  1,
  'invitación inicial: hay una sola fila para ese mail'
);
select is(
  (select count(*)::int from public.memberships where role = 'admin'),
  1,
  'invitación inicial: no se agregó ninguna otra admin'
);

-- Volver a correr la migración no duplica ni falla.
select lives_ok(
  $$ insert into public.memberships (email, client_id, role, can_review, can_comment,
       can_mark_published, notify_on_review, active)
     values ('oliveraluciasoledad@gmail.com', null, 'admin', true, true, true, true, true)
     on conflict on constraint memberships_email_client_key do nothing $$,
  'invitación inicial: la migración se puede repetir sin error'
);
select is(
  (select count(*)::int from public.memberships where email = 'oliveraluciasoledad@gmail.com'),
  1,
  'invitación inicial: repetirla no duplica la fila'
);

-- ---------------------------------------------------------------------------
-- El hook deja crear la cuenta (código por mail o Google)
-- ---------------------------------------------------------------------------
select is(
  public.before_user_created_hook(jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created'),
    'user', jsonb_build_object('email', 'OliveraLuciaSoledad@gmail.com')
  ))::text,
  '{}',
  'hook: permite crear la cuenta para el mail invitado (sin importar mayúsculas)'
);

-- ---------------------------------------------------------------------------
-- Primer ingreso: la cuenta nueva reclama la invitación automáticamente
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('aaaaaaaa-1111-1111-1111-000000000001', 'oliveraluciasoledad@gmail.com', now(),
   '{"full_name": "Lucía Olivera"}');

select is(
  (select user_id::text from public.memberships where email = 'oliveraluciasoledad@gmail.com'),
  'aaaaaaaa-1111-1111-1111-000000000001',
  'primer ingreso: la invitación queda vinculada a la cuenta nueva'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-1111-1111-1111-000000000001", "role": "authenticated"}', true);

select ok(public.is_admin(), 'primer ingreso: es admin');
select ok(public.is_team(), 'primer ingreso: es parte del equipo de Iris');
select results_eq(
  $$ select role::text from public.memberships where user_id = 'aaaaaaaa-1111-1111-1111-000000000001' $$,
  array['admin'],
  'primer ingreso: ve su propia membresía de admin (como la muestra la pantalla de inicio)'
);
select lives_ok(
  $$ insert into public.plans (name) values ('Plan de prueba') $$,
  'primer ingreso: como admin puede escribir en tablas solo de admin (plans)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Cuenta que ya existía antes de la invitación: reclama al entrar
-- ---------------------------------------------------------------------------
update public.memberships set user_id = null where email = 'oliveraluciasoledad@gmail.com';

set local role authenticated;
select is(public.claim_invitations(), 1, 'cuenta ya existente: claim_invitations vincula la invitación');
select ok(public.is_admin(), 'cuenta ya existente: después de reclamar es admin');

-- Otra persona con sesión no puede quedarse con la invitación.
reset role;
update public.memberships set user_id = null where email = 'oliveraluciasoledad@gmail.com';
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-1111-1111-1111-000000000002', 'otra@test.test', now());
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-1111-1111-1111-000000000002", "role": "authenticated"}', true);
select is(public.claim_invitations(), 0, 'otra cuenta: no puede reclamar la invitación de otro mail');

select * from finish();
rollback;
