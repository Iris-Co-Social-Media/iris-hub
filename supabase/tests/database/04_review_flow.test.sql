-- Ciclo de revisión que usa la pantalla Revisión (docs/ARQUITECTURA.md §3.2):
-- Sin revisar → Cambios pedidos (con nota) → Iris corrige → Sin revisar → Revisado.
-- Usa solo lo que ya existe: review_piece() y la edición del equipo (RLS).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-000000000001', 'editor@iris.test'),
  ('22222222-0000-0000-0000-000000000002', 'jonathan@eia.test'),
  ('22222222-0000-0000-0000-000000000003', 'padre@eia.test');
insert into public.clients (id, name, slug) values ('cccccccc-2222-0000-0000-000000000001', 'EIA', 'eia-test');
insert into public.memberships (email, user_id, client_id, role) values
  ('editor@iris.test', '22222222-0000-0000-0000-000000000001', null, 'editor'),
  ('jonathan@eia.test', '22222222-0000-0000-0000-000000000002', 'cccccccc-2222-0000-0000-000000000001', 'approver'),
  ('padre@eia.test', '22222222-0000-0000-0000-000000000003', 'cccccccc-2222-0000-0000-000000000001', 'viewer');
insert into public.monthly_plans (id, client_id, month, status) values
  ('dddddddd-2222-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000001', '2026-10-01', 'in_review');
insert into public.pieces (id, client_id, monthly_plan_id, title, format, status) values
  ('eeeeeeee-2222-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000001', 'Idea', 'post', 'todo');

set local role authenticated;

-- 1. Jonathan pide cambios con nota. El estado de producción no cambia.
select set_config('request.jwt.claims', '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select lives_ok(
  $$ select public.review_piece('eeeeeeee-2222-0000-0000-000000000001', 'changes_requested', 'Cambiar la foto') $$,
  'aprobador: pide cambios con nota'
);
select results_eq(
  $$ select review_status::text, review_note, status::text from public.pieces where id = 'eeeeeeee-2222-0000-0000-000000000001' $$,
  $$ values ('changes_requested', 'Cambiar la foto', 'todo') $$,
  'cambios pedidos: guarda la nota y no toca el estado de producción'
);

-- 2. El cliente no puede marcar la corrección (volver a Sin revisar).
select results_eq(
  $$ with u as (update public.pieces set review_status = 'pending'
                where id = 'eeeeeeee-2222-0000-0000-000000000001' and review_status = 'changes_requested' returning 1)
     select count(*)::int from u $$,
  array[0],
  'aprobador: no puede volver la pieza a Sin revisar'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-2222-0000-0000-000000000001', 'pending', null) $$,
  '22023', null,
  'nadie vuelve a Sin revisar con review_piece'
);

-- 3. El lector sin permiso no puede revisar.
select set_config('request.jwt.claims', '{"sub": "22222222-0000-0000-0000-000000000003", "role": "authenticated"}', true);
select ok(not public.has_perm('cccccccc-2222-0000-0000-000000000001', 'can_review'), 'lector: has_perm(can_review) es falso');
select throws_ok(
  $$ select public.review_piece('eeeeeeee-2222-0000-0000-000000000001', 'approved', null) $$,
  '42501', null,
  'lector: no puede revisar'
);

-- 4. Iris corrige: el equipo la vuelve a Sin revisar. La nota queda como referencia.
select set_config('request.jwt.claims', '{"sub": "22222222-0000-0000-0000-000000000001", "role": "authenticated"}', true);
select results_eq(
  $$ with u as (update public.pieces set review_status = 'pending'
                where id = 'eeeeeeee-2222-0000-0000-000000000001' and review_status = 'changes_requested' returning 1)
     select count(*)::int from u $$,
  array[1],
  'equipo: marca la corrección (vuelve a Sin revisar)'
);
select results_eq(
  $$ select review_status::text, review_note from public.pieces where id = 'eeeeeeee-2222-0000-0000-000000000001' $$,
  $$ values ('pending', 'Cambiar la foto') $$,
  'corregida: Sin revisar, conserva la nota de lo que se pidió'
);
select is(
  (select count(*)::int from public.activity_log
   where piece_id = 'eeeeeeee-2222-0000-0000-000000000001' and action = 'review_changed'),
  2,
  'historial: registra el pedido de cambios y la corrección'
);

-- 5. Jonathan vuelve a revisar y aprueba: la nota vieja se reemplaza.
select set_config('request.jwt.claims', '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select ok(public.has_perm('cccccccc-2222-0000-0000-000000000001', 'can_review'), 'aprobador: has_perm(can_review) es verdadero');
select lives_ok(
  $$ select public.review_piece('eeeeeeee-2222-0000-0000-000000000001', 'approved', null) $$,
  'aprobador: marca Revisado después de la corrección'
);
select results_eq(
  $$ select review_status::text, review_note is null, reviewed_by::text from public.pieces where id = 'eeeeeeee-2222-0000-0000-000000000001' $$,
  $$ values ('approved', true, '22222222-0000-0000-0000-000000000002') $$,
  'revisado: sin nota y con quién revisó'
);

-- 6. Con la planificación cerrada, el cliente ya no puede decidir.
reset role;
update public.monthly_plans set status = 'closed' where id = 'dddddddd-2222-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.review_piece('eeeeeeee-2222-0000-0000-000000000001', 'changes_requested', 'Tarde') $$,
  '22023', null,
  'planificación cerrada: el cliente no puede revisar'
);

select * from finish();
rollback;
