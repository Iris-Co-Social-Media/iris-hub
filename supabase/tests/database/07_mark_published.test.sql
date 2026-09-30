-- Paso 6: marcar como Publicada con mark_published() (la misma llamada que
-- hace la pantalla). Permisos, estados, datos intactos y doble publicación.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('55555555-0000-0000-0000-000000000001', 'editor@iris.test'),
  ('55555555-0000-0000-0000-000000000002', 'jonathan@eia.test'),
  ('55555555-0000-0000-0000-000000000003', 'julieta@eia.test'),
  ('55555555-0000-0000-0000-000000000004', 'padre@eia.test'),
  ('55555555-0000-0000-0000-000000000005', 'ex@eia.test'),
  ('55555555-0000-0000-0000-000000000006', 'otro@otro.test');
insert into public.clients (id, name, slug) values
  ('cccccccc-5555-0000-0000-000000000001', 'EIA', 'eia-pub'),
  ('cccccccc-5555-0000-0000-000000000002', 'Otro', 'otro-pub');
insert into public.memberships (email, user_id, client_id, role, can_mark_published, active) values
  ('editor@iris.test', '55555555-0000-0000-0000-000000000001', null, 'editor', false, true),
  ('jonathan@eia.test', '55555555-0000-0000-0000-000000000002', 'cccccccc-5555-0000-0000-000000000001', 'approver', false, true),
  ('julieta@eia.test', '55555555-0000-0000-0000-000000000003', 'cccccccc-5555-0000-0000-000000000001', 'viewer', true, true),
  ('padre@eia.test', '55555555-0000-0000-0000-000000000004', 'cccccccc-5555-0000-0000-000000000001', 'viewer', false, true),
  ('ex@eia.test', '55555555-0000-0000-0000-000000000005', 'cccccccc-5555-0000-0000-000000000001', 'viewer', true, false),
  ('otro@otro.test', '55555555-0000-0000-0000-000000000006', 'cccccccc-5555-0000-0000-000000000002', 'viewer', true, true);
insert into public.monthly_plans (id, client_id, month, status) values
  ('dddddddd-5555-0000-0000-000000000001', 'cccccccc-5555-0000-0000-000000000001', '2026-10-01', 'in_review'),
  ('dddddddd-5555-0000-0000-000000000002', 'cccccccc-5555-0000-0000-000000000001', '2026-11-01', 'draft');
insert into public.pieces (id, client_id, monthly_plan_id, title, format, status, review_status, review_note,
                           canva_url, script, times_carried_over, estimated_date) values
  ('eeeeeeee-5555-0000-0000-000000000001', 'cccccccc-5555-0000-0000-000000000001', 'dddddddd-5555-0000-0000-000000000001',
   'Post diseñado', 'post', 'done', 'changes_requested', 'Nota de revisión', 'https://canva.com/x', null, 1, '2026-10-06'),
  ('eeeeeeee-5555-0000-0000-000000000002', 'cccccccc-5555-0000-0000-000000000001', 'dddddddd-5555-0000-0000-000000000001',
   'Reel editado', 'reel', 'done', 'approved', null, null, 'Guion', 0, '2026-10-10'),
  ('eeeeeeee-5555-0000-0000-000000000003', 'cccccccc-5555-0000-0000-000000000001', 'dddddddd-5555-0000-0000-000000000001',
   'Todavía por hacer', 'story', 'todo', 'pending', null, null, null, 0, null),
  ('eeeeeeee-5555-0000-0000-000000000004', 'cccccccc-5555-0000-0000-000000000001', 'dddddddd-5555-0000-0000-000000000002',
   'En borrador', 'post', 'done', 'pending', null, null, null, 0, null);
insert into public.piece_frames (piece_id, position, headline) values
  ('eeeeeeee-5555-0000-0000-000000000001', 1, 'Texto de la portada');

-- Foto de los datos antes de publicar (sin status, published_at ni updated_at).
create temp table before_pub as
select id, title, format, review_status, review_note, canva_url, script, times_carried_over, estimated_date, monthly_plan_id
from public.pieces;
create temp table plan_before as select id, status, sent_for_review_at from public.monthly_plans;
grant select on before_pub, plan_before to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Sin permiso
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "55555555-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000001') $$, '42501', null,
  'aprobador sin can_mark_published: no puede publicar');
select set_config('request.jwt.claims', '{"sub": "55555555-0000-0000-0000-000000000004", "role": "authenticated"}', true);
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000001') $$, '42501', null,
  'lector sin can_mark_published: no puede publicar');
select set_config('request.jwt.claims', '{"sub": "55555555-0000-0000-0000-000000000005", "role": "authenticated"}', true);
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000001') $$, 'P0002', null,
  'con el permiso pero con el acceso quitado: no puede');
select set_config('request.jwt.claims', '{"sub": "55555555-0000-0000-0000-000000000006", "role": "authenticated"}', true);
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000001') $$, 'P0002', null,
  'con el permiso en OTRO cliente: no puede');
select set_config('request.jwt.claims', '{"sub": "55555555-0000-0000-0000-000000000003", "role": "authenticated"}', true);
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000004') $$, 'P0002', null,
  'con el permiso pero la pieza está en un borrador: no la ve ni la publica');
select results_eq(
  $$ with u as (update public.pieces set status = 'published' where id = 'eeeeeeee-5555-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'Julieta no puede publicar editando la tabla directamente (solo por la función)'
);

-- ---------------------------------------------------------------------------
-- Julieta (lectora con can_mark_published) publica
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000003') $$, '22023', null,
  'no se publica una pieza que no está Diseñada/Editada');
select lives_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000001') $$,
  'Julieta: marca como publicada una pieza Diseñada');

reset role;
select results_eq(
  $$ select status::text, published_at is not null from public.pieces where id = 'eeeeeeee-5555-0000-0000-000000000001' $$,
  $$ values ('published', true) $$,
  'publicada: estado Publicada y fecha de publicación'
);
select is_empty(
  $$ select id, title, format, review_status, review_note, canva_url, script, times_carried_over, estimated_date, monthly_plan_id
     from public.pieces where id = 'eeeeeeee-5555-0000-0000-000000000001'
     except select * from before_pub $$,
  'publicar no cambia revisión, nota, textos, enlaces, fecha, traslados ni planificación'
);
select is((select headline from public.piece_frames where piece_id = 'eeeeeeee-5555-0000-0000-000000000001'), 'Texto de la portada',
  'publicar no cambia las pantallas');
select is_empty(
  $$ select id, title, format, review_status, review_note, canva_url, script, times_carried_over, estimated_date, monthly_plan_id
     from public.pieces where id <> 'eeeeeeee-5555-0000-0000-000000000001'
     except select * from before_pub $$,
  'publicar no cambia las otras piezas'
);
select is(
  (select count(*)::int from public.pieces where status = 'published'),
  1,
  'solo esa pieza quedó publicada'
);
select is_empty($$ select id, status, sent_for_review_at from public.monthly_plans except select * from plan_before $$,
  'publicar no cambia la planificación');
select results_eq(
  $$ select action, actor_id::text from public.activity_log
     where piece_id = 'eeeeeeee-5555-0000-0000-000000000001' and action = 'published' $$,
  $$ values ('published', '55555555-0000-0000-0000-000000000003') $$,
  'el historial registra la publicación y quién la hizo'
);

-- ---------------------------------------------------------------------------
-- Publicar dos veces
-- ---------------------------------------------------------------------------
create temp table first_pub as select published_at from public.pieces where id = 'eeeeeeee-5555-0000-0000-000000000001';
grant select on first_pub to authenticated;
set local role authenticated;
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000001') $$, '22023', null,
  'publicar de nuevo: la base lo rechaza (ya no está Diseñada)');
reset role;
select is(
  (select published_at from public.pieces where id = 'eeeeeeee-5555-0000-0000-000000000001'),
  (select published_at from first_pub),
  'la fecha de publicación no cambia al intentar de nuevo'
);
select is(
  (select count(*)::int from public.activity_log where piece_id = 'eeeeeeee-5555-0000-0000-000000000001' and action = 'published'),
  1,
  'no queda una segunda publicación en el historial'
);

-- ---------------------------------------------------------------------------
-- Equipo de Iris (§2.2: admin/editor pueden publicar)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "55555555-0000-0000-0000-000000000001", "role": "authenticated"}', true);
select lives_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000002') $$,
  'editor: publica un reel Editado');
select is(
  (select review_status::text from public.pieces where id = 'eeeeeeee-5555-0000-0000-000000000002'),
  'approved',
  'publicar un reel no cambia su revisión'
);

-- ---------------------------------------------------------------------------
-- Sin sesión / pieza inexistente
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000099') $$, 'P0002', null,
  'pieza inexistente');
reset role;
set local role anon;
select throws_ok($$ select public.mark_published('eeeeeeee-5555-0000-0000-000000000002') $$, '42501', null,
  'sin sesión: no puede ni ejecutar la función');

select * from finish();
rollback;
