-- Crear y editar piezas y pantallas (paso 5b.2), con las mismas escrituras
-- que hace la pantalla: insert/update/delete directos protegidos por RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email) values
  ('44444444-0000-0000-0000-000000000001', 'editor@iris.test'),
  ('44444444-0000-0000-0000-000000000002', 'jonathan@eia.test'),
  ('44444444-0000-0000-0000-000000000003', 'julieta@eia.test');
insert into public.clients (id, name, slug) values
  ('cccccccc-4444-0000-0000-000000000001', 'EIA', 'eia-edit'),
  ('cccccccc-4444-0000-0000-000000000002', 'Otro', 'otro-edit');
insert into public.memberships (email, user_id, client_id, role, can_review, can_comment, can_mark_published) values
  ('editor@iris.test', '44444444-0000-0000-0000-000000000001', null, 'editor', false, false, false),
  ('jonathan@eia.test', '44444444-0000-0000-0000-000000000002', 'cccccccc-4444-0000-0000-000000000001', 'approver', false, false, false),
  ('julieta@eia.test', '44444444-0000-0000-0000-000000000003', 'cccccccc-4444-0000-0000-000000000001', 'viewer', true, true, true);
insert into public.monthly_plans (id, client_id, month, status) values
  ('dddddddd-4444-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000001', '2026-10-01', 'in_review');
insert into public.pillars (id, client_id, name) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000001', 'Educativo técnico'),
  ('aaaaaaaa-4444-0000-0000-000000000002', 'cccccccc-4444-0000-0000-000000000002', 'Pilar de otro');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Crear (equipo): valores por defecto de la base
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-0000-0000-0000-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$ insert into public.pieces (id, client_id, monthly_plan_id, title, format)
     values ('eeeeeeee-4444-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000001', 'dddddddd-4444-0000-0000-000000000001', 'Reel de obra', 'reel') $$,
  'editor: crea una pieza con título y formato'
);
select results_eq(
  $$ select status::text, review_status::text, interaction::text, needs_client_on_camera, origin::text, created_by::text, platform
     from public.pieces where id = 'eeeeeeee-4444-0000-0000-000000000001' $$,
  $$ values ('todo', 'pending', 'none', false, 'manual', '44444444-0000-0000-0000-000000000001', 'instagram') $$,
  'nueva pieza: Por hacer, Sin revisar y demás valores por defecto; created_by es quien la crea'
);
select throws_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format)
     values ('cccccccc-4444-0000-0000-000000000001', 'dddddddd-4444-0000-0000-000000000001', '  ', 'post') $$,
  '23514', null,
  'no se puede crear sin título'
);
select throws_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format, pillar_id)
     values ('cccccccc-4444-0000-0000-000000000001', 'dddddddd-4444-0000-0000-000000000001', 'Mezcla', 'post', 'aaaaaaaa-4444-0000-0000-000000000002') $$,
  '23503', null,
  'no se puede usar un pilar de otro cliente'
);

-- ---------------------------------------------------------------------------
-- Editar datos: no toca la revisión; update condicionado a updated_at
-- ---------------------------------------------------------------------------
reset role;
update public.pieces set review_status = 'changes_requested', review_note = 'Cambiar la toma'
where id = 'eeeeeeee-4444-0000-0000-000000000001';
create temp table loaded as select updated_at from public.pieces where id = 'eeeeeeee-4444-0000-0000-000000000001';
grant select on loaded to authenticated;
set local role authenticated;

select results_eq(
  $$ with u as (update public.pieces
                set title = 'Reel: puente rural', estimated_date = '2026-10-14', pillar_id = 'aaaaaaaa-4444-0000-0000-000000000001',
                    objective = 'experience', needs_client_on_camera = true, script = 'Toma 1', canva_url = 'https://canva.com/x'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and updated_at = (select updated_at from loaded)
                returning 1)
     select count(*)::int from u $$,
  array[1],
  'editor: guarda los datos (con la updated_at que cargó)'
);
select results_eq(
  $$ select title, pillar_id::text, needs_client_on_camera, review_status::text, review_note
     from public.pieces where id = 'eeeeeeee-4444-0000-0000-000000000001' $$,
  $$ values ('Reel: puente rural', 'aaaaaaaa-4444-0000-0000-000000000001', true, 'changes_requested', 'Cambiar la toma') $$,
  'editar datos no cambia review_status ni review_note'
);
-- Otra persona guarda la pieza. (En la base real cada pedido es una
-- transacción y now() cambia; acá, dentro de una sola transacción de prueba,
-- se simula avanzando updated_at con el trigger apagado.)
reset role;
alter table public.pieces disable trigger set_updated_at;
update public.pieces set updated_at = updated_at + interval '1 second' where id = 'eeeeeeee-4444-0000-0000-000000000001';
alter table public.pieces enable trigger set_updated_at;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "44444444-0000-0000-0000-000000000001", "role": "authenticated"}', true);

select results_eq(
  $$ with u as (update public.pieces set title = 'Pisada'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and updated_at = (select updated_at from loaded)
                returning 1)
     select count(*)::int from u $$,
  array[0],
  'guardar con una versión vieja no pisa nada (cambio concurrente)'
);

-- ---------------------------------------------------------------------------
-- Estado de producción (reel): Por hacer → Esperando grabación → Grabado → Editada
-- ---------------------------------------------------------------------------
select results_eq(
  $$ with u as (update public.pieces set status = 'awaiting_recording'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and status = 'todo' returning 1)
     select count(*)::int from u $$,
  array[1],
  'reel: Por hacer → Esperando grabación'
);
select throws_ok(
  $$ update public.pieces set format = 'post' where id = 'eeeeeeee-4444-0000-0000-000000000001' $$,
  '23514', null,
  'no puede dejar de ser reel mientras espera grabación'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'recorded'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and status = 'awaiting_recording' returning 1)
     select count(*)::int from u $$,
  array[1],
  'reel: Esperando grabación → Grabado'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'done'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and status = 'recorded' returning 1)
     select count(*)::int from u $$,
  array[1],
  'reel: Grabado → Editada'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'todo'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and status = 'recorded' returning 1)
     select count(*)::int from u $$,
  array[0],
  'cambiar desde un estado que ya no es el actual no hace nada'
);
select is(
  (select review_status::text from public.pieces where id = 'eeeeeeee-4444-0000-0000-000000000001'),
  'changes_requested',
  'los cambios de producción no tocan la revisión'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'archived'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and status = 'done' returning 1)
     select count(*)::int from u $$,
  array[1],
  'archivar'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'todo'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' and status = 'archived' returning 1)
     select count(*)::int from u $$,
  array[1],
  'desarchivar (vuelve a Por hacer)'
);
select is(
  (select count(*)::int from public.activity_log where piece_id = 'eeeeeeee-4444-0000-0000-000000000001' and action = 'status_changed'),
  5,
  'el historial registra cada cambio de estado'
);

-- ---------------------------------------------------------------------------
-- Pantallas (equipo)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.piece_frames (id, piece_id, position, label, headline) values
       ('ffffffff-4444-0000-0000-000000000001', 'eeeeeeee-4444-0000-0000-000000000001', 1, 'Portada', 'Hola'),
       ('ffffffff-4444-0000-0000-000000000002', 'eeeeeeee-4444-0000-0000-000000000001', 2, null, 'Segunda'),
       ('ffffffff-4444-0000-0000-000000000003', 'eeeeeeee-4444-0000-0000-000000000001', 3, null, 'Tercera') $$,
  'editor: agrega pantallas'
);
select throws_ok(
  $$ insert into public.piece_frames (piece_id, position) values ('eeeeeeee-4444-0000-0000-000000000001', 0) $$,
  '23514', null,
  'la posición tiene que ser 1 o más'
);
select throws_ok(
  $$ update public.piece_frames set interaction = '"texto"'::jsonb where id = 'ffffffff-4444-0000-0000-000000000001' $$,
  '23514', null,
  'la interacción de una pantalla tiene que ser un objeto'
);
select lives_ok(
  $$ update public.piece_frames set interaction = '{"type": "quiz", "question": "¿Cuál?", "options": ["A", "B"], "correct_index": 1}'::jsonb,
                                  body = 'Texto'
     where id = 'ffffffff-4444-0000-0000-000000000001' $$,
  'editor: edita una pantalla con interacción'
);
select lives_ok(
  $$ delete from public.piece_frames where id = 'ffffffff-4444-0000-0000-000000000002';
     update public.piece_frames set position = 2 where id = 'ffffffff-4444-0000-0000-000000000003' $$,
  'editor: quita una pantalla y renumera la siguiente'
);
select results_eq(
  $$ select position, headline from public.piece_frames where piece_id = 'eeeeeeee-4444-0000-0000-000000000001' order by position $$,
  $$ values (1, 'Hola'), (2, 'Tercera') $$,
  'las pantallas quedan 1, 2 sin huecos'
);
select results_eq(
  $$ with d as (delete from public.pieces where id = 'eeeeeeee-4444-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  array[0],
  'editor: no puede borrar piezas (solo admin; se archiva)'
);

-- ---------------------------------------------------------------------------
-- El cliente no puede crear ni editar, aunque tenga permisos extra
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format)
     values ('cccccccc-4444-0000-0000-000000000001', 'dddddddd-4444-0000-0000-000000000001', 'Intrusa', 'post') $$,
  '42501', null,
  'aprobador: no puede crear piezas'
);
select results_eq(
  $$ with u as (update public.pieces set title = 'Cambio del cliente'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'aprobador: no puede editar datos'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'done'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'aprobador: no puede cambiar el estado de producción'
);
select throws_ok(
  $$ insert into public.piece_frames (piece_id, position) values ('eeeeeeee-4444-0000-0000-000000000001', 9) $$,
  '42501', null,
  'aprobador: no puede agregar pantallas'
);
select set_config('request.jwt.claims', '{"sub": "44444444-0000-0000-0000-000000000003", "role": "authenticated"}', true);
select results_eq(
  $$ with u as (update public.piece_frames set headline = 'Cambio del cliente'
                where id = 'ffffffff-4444-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'lectora con permisos extra: no puede editar pantallas'
);
select results_eq(
  $$ with d as (delete from public.piece_frames where id = 'ffffffff-4444-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  array[0],
  'lectora con permisos extra: no puede quitar pantallas'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'archived'
                where id = 'eeeeeeee-4444-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'lectora con permisos extra: no puede archivar'
);

reset role;
select results_eq(
  $$ select title, status::text from public.pieces where id = 'eeeeeeee-4444-0000-0000-000000000001' $$,
  $$ values ('Reel: puente rural', 'todo') $$,
  'al final, la pieza quedó solo con los cambios del equipo'
);

select * from finish();
rollback;
