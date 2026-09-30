-- Gestión de la planificación mensual (paso 5b.1), con las mismas escrituras
-- que hace la pantalla Mes: insert/update directos protegidos por RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('33333333-0000-0000-0000-000000000001', 'editor@iris.test'),
  ('33333333-0000-0000-0000-000000000002', 'jonathan@eia.test'),
  ('33333333-0000-0000-0000-000000000003', 'julieta@eia.test');
insert into public.clients (id, name, slug) values ('cccccccc-3333-0000-0000-000000000001', 'EIA', 'eia-plan');
insert into public.memberships (email, user_id, client_id, role, can_mark_published) values
  ('editor@iris.test', '33333333-0000-0000-0000-000000000001', null, 'editor', false),
  ('jonathan@eia.test', '33333333-0000-0000-0000-000000000002', 'cccccccc-3333-0000-0000-000000000001', 'approver', false),
  ('julieta@eia.test', '33333333-0000-0000-0000-000000000003', 'cccccccc-3333-0000-0000-000000000001', 'viewer', true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- El cliente no puede crear
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into public.monthly_plans (client_id, month) values ('cccccccc-3333-0000-0000-000000000001', '2026-10-01') $$,
  '42501', null,
  'aprobador: no puede crear planificaciones'
);
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000003", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into public.monthly_plans (client_id, month) values ('cccccccc-3333-0000-0000-000000000001', '2026-10-01') $$,
  '42501', null,
  'lectora con permisos extra: no puede crear planificaciones'
);

-- ---------------------------------------------------------------------------
-- El equipo crea: queda en borrador; una sola por cliente y mes
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$ insert into public.monthly_plans (client_id, month) values ('cccccccc-3333-0000-0000-000000000001', '2026-10-01') $$,
  'editor: crea la planificación de octubre'
);
select results_eq(
  $$ select status::text, sent_for_review_at is null from public.monthly_plans
     where client_id = 'cccccccc-3333-0000-0000-000000000001' and month = '2026-10-01' $$,
  $$ values ('draft', true) $$,
  'nueva planificación: queda en Borrador, sin fecha de envío'
);
select throws_ok(
  $$ insert into public.monthly_plans (client_id, month) values ('cccccccc-3333-0000-0000-000000000001', '2026-10-01') $$,
  '23505', null,
  'no se puede crear otra planificación del mismo mes'
);
select throws_ok(
  $$ insert into public.monthly_plans (client_id, month) values ('cccccccc-3333-0000-0000-000000000001', '2026-11-15') $$,
  '23514', null,
  'month tiene que ser el día 1'
);

-- Una pieza para comprobar que el estado de la planificación no toca su revisión.
insert into public.pieces (client_id, monthly_plan_id, title, format)
select 'cccccccc-3333-0000-0000-000000000001', id, 'Idea', 'post'
from public.monthly_plans where client_id = 'cccccccc-3333-0000-0000-000000000001';

-- El cliente todavía no la ve (borrador).
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select is((select count(*)::int from public.monthly_plans), 0, 'borrador: el cliente no la ve');

-- ---------------------------------------------------------------------------
-- Enviar a revisión (update condicionado al estado actual)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000001", "role": "authenticated"}', true);
select results_eq(
  $$ with u as (update public.monthly_plans set status = 'in_review', sent_for_review_at = now()
                where client_id = 'cccccccc-3333-0000-0000-000000000001' and status = 'draft' returning 1)
     select count(*)::int from u $$,
  array[1],
  'editor: envía a revisión'
);
select results_eq(
  $$ select status::text, sent_for_review_at is not null from public.monthly_plans
     where client_id = 'cccccccc-3333-0000-0000-000000000001' $$,
  $$ values ('in_review', true) $$,
  'enviada: estado y fecha de envío guardados'
);
select results_eq(
  $$ with u as (update public.monthly_plans set status = 'in_review', sent_for_review_at = now()
                where client_id = 'cccccccc-3333-0000-0000-000000000001' and status = 'draft' returning 1)
     select count(*)::int from u $$,
  array[0],
  'enviar otra vez no hace nada: ya no está en borrador'
);
select is(
  (select review_status::text from public.pieces where title = 'Idea'),
  'pending',
  'enviar a revisión no cambia la revisión de las piezas'
);

-- El cliente ahora la ve, pero no puede modificarla ni borrarla.
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select is((select count(*)::int from public.monthly_plans), 1, 'enviada: el cliente la ve');
select results_eq(
  $$ with u as (update public.monthly_plans set status = 'draft'
                where client_id = 'cccccccc-3333-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'aprobador: no puede cambiar el estado'
);
select results_eq(
  $$ with d as (delete from public.monthly_plans where client_id = 'cccccccc-3333-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  array[0],
  'aprobador: no puede borrar la planificación'
);
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000003", "role": "authenticated"}', true);
select results_eq(
  $$ with u as (update public.monthly_plans set status = 'closed'
                where client_id = 'cccccccc-3333-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'lectora con permisos extra: no puede cambiar el estado'
);

-- ---------------------------------------------------------------------------
-- Volver a borrador
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000001", "role": "authenticated"}', true);
select results_eq(
  $$ with u as (update public.monthly_plans set status = 'draft', sent_for_review_at = null
                where client_id = 'cccccccc-3333-0000-0000-000000000001' and status = 'in_review' returning 1)
     select count(*)::int from u $$,
  array[1],
  'editor: vuelve a borrador'
);
select results_eq(
  $$ select status::text, sent_for_review_at is null from public.monthly_plans
     where client_id = 'cccccccc-3333-0000-0000-000000000001' $$,
  $$ values ('draft', true) $$,
  'borrador otra vez: sin fecha de envío'
);
select results_eq(
  $$ with d as (delete from public.monthly_plans where client_id = 'cccccccc-3333-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  array[0],
  'editor: no puede borrar la planificación (solo admin)'
);

select set_config('request.jwt.claims', '{"sub": "33333333-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select is((select count(*)::int from public.monthly_plans), 0, 'de vuelta en borrador: el cliente deja de verla');

select * from finish();
rollback;
