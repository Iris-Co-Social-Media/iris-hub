-- Pruebas de permisos (sección 7.5): quién ve qué y quién puede cambiar qué.
--
-- Personas de prueba:
--   admin     Lucía (admin de Iris)
--   editor    colaborador de Iris (editor)
--   approver  Jonathan (aprobador de EIA)
--   viewer    padre de Jonathan (lector de EIA, sin permisos extra)
--   publisher Julieta (lectora de EIA con can_mark_published)
--   other     aprobador de OTRO cliente
--   outsider  usuario con sesión pero sin invitación
--   inactive  aprobador de EIA con acceso quitado (active = false)
begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001', 'lucia@iris.test'),
  ('11111111-0000-0000-0000-000000000002', 'editor@iris.test'),
  ('11111111-0000-0000-0000-000000000003', 'jonathan@eia.test'),
  ('11111111-0000-0000-0000-000000000004', 'padre@eia.test'),
  ('11111111-0000-0000-0000-000000000005', 'julieta@eia.test'),
  ('11111111-0000-0000-0000-000000000006', 'aprobador@otro.test'),
  ('11111111-0000-0000-0000-000000000007', 'nadie@test.test'),
  ('11111111-0000-0000-0000-000000000008', 'ex@eia.test');

insert into public.plans (id, name, quota_posts, quota_stories, monthly_price) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Silver', 8, 15, 1000);

insert into public.clients (id, name, slug, plan_id, quota_posts, quota_stories) values
  ('cccccccc-0000-0000-0000-000000000001', 'EIA Ingeniería', 'eia', 'bbbbbbbb-0000-0000-0000-000000000001', 8, 15),
  ('cccccccc-0000-0000-0000-000000000002', 'Otro Cliente', 'otro', null, 4, 4);

insert into public.memberships (email, user_id, client_id, role, can_mark_published, notify_on_review, active) values
  ('lucia@iris.test',     '11111111-0000-0000-0000-000000000001', null, 'admin', false, false, true),
  ('editor@iris.test',    '11111111-0000-0000-0000-000000000002', null, 'editor', false, false, true),
  ('jonathan@eia.test',   '11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', 'approver', false, true, true),
  ('padre@eia.test',      '11111111-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', 'viewer', false, false, true),
  ('julieta@eia.test',    '11111111-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001', 'viewer', true, true, true),
  ('aprobador@otro.test', '11111111-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000002', 'approver', false, false, true),
  ('ex@eia.test',         '11111111-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000001', 'approver', false, false, false);

insert into public.profiles (id, full_name) values
  ('11111111-0000-0000-0000-000000000001', 'Lucía'),
  ('11111111-0000-0000-0000-000000000003', 'Jonathan'),
  ('11111111-0000-0000-0000-000000000006', 'Aprobador Otro');

insert into public.monthly_plans (id, client_id, month, status) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '2026-10-01', 'in_review'),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', '2026-11-01', 'draft'),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', '2026-09-01', 'closed'),
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000002', '2026-10-01', 'in_review');

insert into public.pillars (id, client_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Educativo técnico'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', 'Pilar de otro');

insert into public.pieces (id, client_id, monthly_plan_id, title, format, status) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Octubre post', 'post', 'todo'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Octubre historia diseñada', 'story', 'done'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'Noviembre borrador', 'post', 'todo'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', null, 'Idea sin mes', 'carousel', 'todo'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', 'Pieza de otro cliente', 'post', 'done'),
  ('eeeeeeee-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Reel guion', 'reel', 'awaiting_recording'),
  ('eeeeeeee-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', 'Septiembre cerrado', 'post', 'done');

insert into public.piece_frames (piece_id, position, label, headline) values
  ('eeeeeeee-0000-0000-0000-000000000001', 1, 'Portada', 'Texto de octubre'),
  ('eeeeeeee-0000-0000-0000-000000000003', 1, 'Portada', 'Texto de borrador');

insert into public.comments (id, piece_id, author_id, body, internal) values
  ('99999999-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Comentario visible', false),
  ('99999999-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Comentario interno de Iris', true),
  ('99999999-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000006', 'Comentario de otro cliente', false);

-- Cambia el usuario "con sesión" (como hace Supabase con el JWT).
create function pg_temp.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Restricciones del modelo de datos
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.pieces (client_id, title, format, status)
     values ('cccccccc-0000-0000-0000-000000000001', 'Post grabado', 'post', 'recorded') $$,
  '23514', null,
  '"Grabado" solo es válido para reels'
);

select throws_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format)
     values ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004', 'Mezcla', 'post') $$,
  '23503', null,
  'una pieza no puede apuntar a la planificación de otro cliente'
);

select throws_ok(
  $$ insert into public.pieces (client_id, pillar_id, title, format)
     values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'Mezcla', 'post') $$,
  '23503', null,
  'una pieza no puede usar un pilar de otro cliente'
);

select throws_ok(
  $$ insert into public.monthly_plans (client_id, month) values ('cccccccc-0000-0000-0000-000000000001', '2026-10-01') $$,
  '23505', null,
  'una sola planificación por cliente y mes'
);

select throws_ok(
  $$ insert into public.memberships (email, client_id, role) values ('x@eia.test', 'cccccccc-0000-0000-0000-000000000001', 'admin') $$,
  '23514', null,
  'un usuario del cliente no puede tener rol admin'
);

select is(
  (select count(*)::int from public.activity_log where piece_id = 'eeeeeeee-0000-0000-0000-000000000001' and action = 'created'),
  1,
  'crear una pieza queda en el historial'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Admin de Iris
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-0000-0000-0000-000000000001');

select is((select count(*)::int from public.clients), 2, 'admin: ve todos los clientes');
select is((select count(*)::int from public.pieces), 7, 'admin: ve todas las piezas, incluidos borradores y Banco de ideas');
select is((select count(*)::int from public.comments), 3, 'admin: ve los comentarios internos');
select is((select count(*)::int from public.plans), 1, 'admin: ve planes y precios');
select ok((select count(*) > 0 from public.activity_log), 'admin: ve el historial');
select lives_ok(
  $$ delete from public.pieces where id = 'eeeeeeee-0000-0000-0000-000000000004' $$,
  'admin: puede borrar piezas'
);

-- ---------------------------------------------------------------------------
-- Editor de Iris
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-0000-0000-0000-000000000002');

select is((select count(*)::int from public.clients), 2, 'editor: ve todos los clientes');
select is((select count(*)::int from public.monthly_plans), 4, 'editor: ve todas las planificaciones, incluidos borradores');
select is((select count(*)::int from public.comments where internal), 1, 'editor: ve los comentarios internos');
select is((select count(*)::int from public.plans), 0, 'editor: NO ve planes ni precios');
select lives_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format)
     values ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'Nueva del editor', 'story') $$,
  'editor: puede crear piezas'
);
select results_eq(
  $$ with u as (update public.pieces set title = 'Editada' where id = 'eeeeeeee-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[1],
  'editor: puede editar piezas'
);
select results_eq(
  $$ with d as (delete from public.pieces where id = 'eeeeeeee-0000-0000-0000-000000000003' returning 1)
     select count(*)::int from d $$,
  array[0],
  'editor: NO puede borrar piezas'
);
select throws_ok(
  $$ insert into public.memberships (email, client_id, role) values ('nuevo@eia.test', 'cccccccc-0000-0000-0000-000000000001', 'viewer') $$,
  '42501', null,
  'editor: NO puede invitar usuarios'
);

-- ---------------------------------------------------------------------------
-- Aprobador de EIA (Jonathan)
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-0000-0000-0000-000000000003');

select results_eq(
  $$ select slug from public.clients $$,
  array['eia'],
  'aprobador: solo ve su propio cliente'
);
select results_eq(
  $$ select month::text from public.monthly_plans order by month $$,
  array['2026-09-01', '2026-10-01'],
  'aprobador: no ve planificaciones en borrador'
);
select results_eq(
  $$ select id::text from public.pieces order by id $$,
  array['eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002',
        'eeeeeeee-0000-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000007'],
  'aprobador: ve solo piezas de planificaciones enviadas (ni borradores, ni Banco de ideas, ni otro cliente)'
);
select is(
  (select count(*)::int from public.piece_frames),
  1,
  'aprobador: no ve las pantallas de piezas en borrador'
);
select results_eq(
  $$ select body from public.comments $$,
  array['Comentario visible'],
  'aprobador: no ve comentarios internos ni de otro cliente'
);
select is((select count(*)::int from public.plans), 0, 'aprobador: no ve planes ni precios');
select is((select count(*)::int from public.activity_log), 0, 'aprobador: no ve el historial');
select is((select count(*)::int from public.memberships), 1, 'aprobador: solo ve su propia membresía');
select results_eq(
  $$ select full_name from public.profiles order by full_name $$,
  array['Jonathan', 'Lucía'],
  'aprobador: ve perfiles de Iris y de su cliente, no de otros clientes'
);

-- Manipular client_id no da acceso a otro cliente.
select is_empty(
  $$ select 1 from public.pieces where client_id = 'cccccccc-0000-0000-0000-000000000002' $$,
  'aprobador: filtrar por el client_id de otro cliente no devuelve nada'
);
select is_empty(
  $$ select 1 from public.pillars where client_id = 'cccccccc-0000-0000-0000-000000000002' $$,
  'aprobador: no ve catálogos de otro cliente'
);
select throws_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format)
     values ('cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', 'Intrusa', 'post') $$,
  '42501', null,
  'aprobador: no puede crear piezas (ni en su cliente ni en otro)'
);
select results_eq(
  $$ with u as (update public.pieces set client_id = 'cccccccc-0000-0000-0000-000000000002' where id = 'eeeeeeee-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'aprobador: no puede mover una pieza a otro cliente'
);
select results_eq(
  $$ with u as (update public.pieces set review_status = 'approved' where id = 'eeeeeeee-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  array[0],
  'aprobador: no puede editar la tabla de piezas directamente'
);
select throws_ok(
  $$ insert into public.comments (piece_id, author_id, body) values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'directo') $$,
  '42501', null,
  'aprobador: no puede insertar comentarios directamente'
);

-- review_piece
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000001', 'changes_requested', '  ') $$,
  '22023', null,
  'review_piece: pedir cambios exige una nota'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000001', 'pending', null) $$,
  '22023', null,
  'review_piece: solo acepta Revisado o Cambios pedidos'
);
select lives_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000001', 'changes_requested', 'Simplificar el título') $$,
  'review_piece: el aprobador puede pedir cambios en su cliente'
);
select lives_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000002', 'approved', null) $$,
  'review_piece: el aprobador puede marcar Revisado'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000003', 'approved', null) $$,
  'P0002', null,
  'review_piece: no se puede revisar una pieza en borrador'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000005', 'approved', null) $$,
  'P0002', null,
  'review_piece: no se puede revisar una pieza de otro cliente'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000007', 'approved', null) $$,
  '22023', null,
  'review_piece: el cliente no revisa meses cerrados'
);

-- mark_published: el aprobador no tiene el permiso extra.
select throws_ok(
  $$ select public.mark_published('eeeeeeee-0000-0000-0000-000000000002') $$,
  '42501', null,
  'mark_published: el aprobador sin permiso extra no puede publicar'
);

-- add_comment
select lives_ok(
  $$ select public.add_comment('eeeeeeee-0000-0000-0000-000000000001', 'Me gusta la idea') $$,
  'add_comment: el aprobador puede comentar en su cliente'
);
select throws_ok(
  $$ select public.add_comment('eeeeeeee-0000-0000-0000-000000000005', 'Hola') $$,
  'P0002', null,
  'add_comment: no puede comentar piezas de otro cliente'
);
select throws_ok(
  $$ select public.add_comment('eeeeeeee-0000-0000-0000-000000000003', 'Hola') $$,
  'P0002', null,
  'add_comment: no puede comentar piezas en borrador'
);

-- ---------------------------------------------------------------------------
-- Lector de EIA sin permisos extra
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-0000-0000-0000-000000000004');

select is((select count(*)::int from public.pieces), 4, 'lector: ve las piezas enviadas de su cliente');
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000002', 'approved', null) $$,
  '42501', null,
  'review_piece: el lector sin permiso extra no puede revisar'
);
select throws_ok(
  $$ select public.mark_published('eeeeeeee-0000-0000-0000-000000000002') $$,
  '42501', null,
  'mark_published: el lector sin permiso extra no puede publicar'
);
select throws_ok(
  $$ select public.add_comment('eeeeeeee-0000-0000-0000-000000000001', 'Hola') $$,
  '42501', null,
  'add_comment: el lector sin permiso extra no puede comentar'
);
select results_eq(
  $$ with u as (update public.pieces set status = 'published' where id = 'eeeeeeee-0000-0000-0000-000000000002' returning 1)
     select count(*)::int from u $$,
  array[0],
  'lector: no puede cambiar el estado de una pieza directamente'
);
select throws_ok(
  $$ insert into public.pillars (client_id, name) values ('cccccccc-0000-0000-0000-000000000001', 'Nuevo') $$,
  '42501', null,
  'lector: no puede editar catálogos'
);

-- ---------------------------------------------------------------------------
-- Lectora de EIA con can_mark_published (Julieta)
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-0000-0000-0000-000000000005');

select throws_ok(
  $$ select public.mark_published('eeeeeeee-0000-0000-0000-000000000001') $$,
  '22023', null,
  'mark_published: solo se publica una pieza Diseñada/Editada'
);
select lives_ok(
  $$ select public.mark_published('eeeeeeee-0000-0000-0000-000000000002') $$,
  'mark_published: con el permiso extra se puede publicar'
);
select throws_ok(
  $$ select public.mark_published('eeeeeeee-0000-0000-0000-000000000005') $$,
  'P0002', null,
  'mark_published: no se puede publicar una pieza de otro cliente'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000006', 'approved', null) $$,
  '42501', null,
  'review_piece: el permiso de publicar no da permiso de revisar'
);

-- ---------------------------------------------------------------------------
-- Aprobador de OTRO cliente
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-0000-0000-0000-000000000006');

select results_eq($$ select slug from public.clients $$, array['otro'], 'otro cliente: solo ve su cliente');
select is_empty(
  $$ select 1 from public.pieces where client_id = 'cccccccc-0000-0000-0000-000000000001' $$,
  'otro cliente: no ve piezas de EIA'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000001', 'approved', null) $$,
  'P0002', null,
  'review_piece: el aprobador de otro cliente no puede revisar piezas de EIA'
);

-- ---------------------------------------------------------------------------
-- Usuario sin invitación y usuario con acceso quitado
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-0000-0000-0000-000000000007');

select is((select count(*)::int from public.clients), 0, 'sin invitación: no ve clientes');
select is((select count(*)::int from public.pieces), 0, 'sin invitación: no ve piezas');
select throws_ok(
  $$ select public.add_comment('eeeeeeee-0000-0000-0000-000000000001', 'Hola') $$,
  'P0002', null,
  'add_comment: un usuario sin invitación no puede comentar'
);

select pg_temp.login_as('11111111-0000-0000-0000-000000000008');

select is((select count(*)::int from public.pieces), 0, 'acceso quitado: no ve piezas');
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000001', 'approved', null) $$,
  'P0002', null,
  'review_piece: un aprobador con acceso quitado no puede revisar'
);

-- ---------------------------------------------------------------------------
-- Sin sesión (anon)
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$ select 1 from public.pieces $$,
  '42501', null,
  'anon: no puede leer piezas'
);
select throws_ok(
  $$ select public.review_piece('eeeeeeee-0000-0000-0000-000000000001', 'approved', null) $$,
  '42501', null,
  'anon: no puede ejecutar review_piece'
);

-- ---------------------------------------------------------------------------
-- Resultado de las acciones (verificado como postgres)
-- ---------------------------------------------------------------------------
reset role;

select results_eq(
  $$ select review_status::text, review_note, reviewed_by::text from public.pieces where id = 'eeeeeeee-0000-0000-0000-000000000001' $$,
  $$ values ('changes_requested', 'Simplificar el título', '11111111-0000-0000-0000-000000000003') $$,
  'review_piece guarda la decisión, la nota y quién revisó'
);
select results_eq(
  $$ select status::text, review_status::text, published_at is not null from public.pieces where id = 'eeeeeeee-0000-0000-0000-000000000002' $$,
  $$ values ('published', 'approved', true) $$,
  'mark_published cambia el estado y la fecha, y conserva la revisión'
);
select results_eq(
  $$ select internal, author_id::text from public.comments where body = 'Me gusta la idea' $$,
  $$ values (false, '11111111-0000-0000-0000-000000000003') $$,
  'add_comment crea un comentario visible a nombre de quien comenta'
);
select results_eq(
  $$ select action, actor_id::text, after ->> 'review_note' from public.activity_log
     where piece_id = 'eeeeeeee-0000-0000-0000-000000000001' and action = 'review_changed' $$,
  $$ values ('review_changed', '11111111-0000-0000-0000-000000000003', 'Simplificar el título') $$,
  'la revisión queda en el historial con su autor'
);
select results_eq(
  $$ select piece_id is null, before ->> 'id' from public.activity_log where action = 'deleted' $$,
  $$ values (true, 'eeeeeeee-0000-0000-0000-000000000004') $$,
  'borrar una pieza queda en el historial'
);

select * from finish();
rollback;
