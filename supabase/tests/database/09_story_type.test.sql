-- Tipo de historia (pieces.story_type): opcional, solo para historias, el
-- equipo lo crea y edita, el cliente solo lo lee. La cantidad de imágenes de
-- una serie son las pantallas (piece_frames).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('99999999-0000-0000-0000-000000000001', 'editor@iris.test'),
  ('99999999-0000-0000-0000-000000000002', 'jonathan@eia.test');
insert into public.clients (id, name, slug) values
  ('cccccccc-9999-0000-0000-000000000001', 'EIA', 'eia-story');
insert into public.memberships (email, user_id, client_id, role, can_review, can_comment, can_mark_published) values
  ('editor@iris.test', '99999999-0000-0000-0000-000000000001', null, 'editor', false, false, false),
  ('jonathan@eia.test', '99999999-0000-0000-0000-000000000002', 'cccccccc-9999-0000-0000-000000000001', 'approver', false, false, false);
insert into public.monthly_plans (id, client_id, month, status) values
  ('dddddddd-9999-0000-0000-000000000001', 'cccccccc-9999-0000-0000-000000000001', '2026-10-01', 'in_review');

select enum_has_labels('public', 'story_type', array['image', 'image_series', 'video']);
select col_is_null('public', 'pieces', 'story_type', 'story_type es opcional');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "99999999-0000-0000-0000-000000000001", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.pieces (id, client_id, monthly_plan_id, title, format)
     values ('eeeeeeee-9999-0000-0000-000000000001', 'cccccccc-9999-0000-0000-000000000001', 'dddddddd-9999-0000-0000-000000000001', 'Historia anterior', 'story') $$,
  'una historia sin tipo (como las que ya existen) sigue siendo válida'
);
select lives_ok(
  $$ insert into public.pieces (id, client_id, monthly_plan_id, title, format, story_type, interaction)
     values ('eeeeeeee-9999-0000-0000-000000000002', 'cccccccc-9999-0000-0000-000000000001', 'dddddddd-9999-0000-0000-000000000001', 'Serie', 'story', 'image_series', 'poll') $$,
  'editor: crea una historia de tipo Serie de imágenes con interacción'
);
select lives_ok(
  $$ insert into public.piece_frames (piece_id, position)
     select 'eeeeeeee-9999-0000-0000-000000000002', n from generate_series(1, 5) as n $$,
  'editor: la cantidad de imágenes se representa con pantallas'
);
select is(
  (select count(*)::int from public.piece_frames where piece_id = 'eeeeeeee-9999-0000-0000-000000000002'),
  5, 'la serie tiene 5 pantallas'
);
select lives_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format, story_type)
     values ('cccccccc-9999-0000-0000-000000000001', 'dddddddd-9999-0000-0000-000000000001', 'Video', 'story', 'video') $$,
  'editor: crea una historia de tipo Video'
);
select throws_ok(
  $$ insert into public.pieces (client_id, monthly_plan_id, title, format, story_type)
     values ('cccccccc-9999-0000-0000-000000000001', 'dddddddd-9999-0000-0000-000000000001', 'Post raro', 'post', 'image') $$,
  '23514', null,
  'una publicación no puede tener tipo de historia'
);
select throws_ok(
  $$ update public.pieces set format = 'carousel' where id = 'eeeeeeee-9999-0000-0000-000000000002' $$,
  '23514', null,
  'pasar a publicación sin limpiar el tipo de historia se rechaza'
);
select lives_ok(
  $$ update public.pieces set format = 'carousel', story_type = null, interaction = 'none'
     where id = 'eeeeeeee-9999-0000-0000-000000000002' $$,
  'pasar a publicación limpiando el tipo de historia funciona'
);
-- "8 o más"
select is(
  (select story_images_open from public.pieces where id = 'eeeeeeee-9999-0000-0000-000000000001'),
  false, 'por defecto una pieza no es "8 o más"'
);
select lives_ok(
  $$ insert into public.pieces (id, client_id, monthly_plan_id, title, format, story_type, story_images_open)
     values ('eeeeeeee-9999-0000-0000-000000000003', 'cccccccc-9999-0000-0000-000000000001', 'dddddddd-9999-0000-0000-000000000001', 'Serie larga', 'story', 'image_series', true) $$,
  'editor: crea una serie "8 o más"'
);
select throws_ok(
  $$ update public.pieces set story_type = 'video' where id = 'eeeeeeee-9999-0000-0000-000000000003' $$,
  '23514', null,
  '"8 o más" solo vale para series de imágenes'
);
select lives_ok(
  $$ insert into public.piece_frames (piece_id, position)
     select 'eeeeeeee-9999-0000-0000-000000000003', n from generate_series(1, 10) as n $$,
  'una serie "8 o más" puede tener más de 8 pantallas'
);
select lives_ok(
  $$ update public.pieces set format = 'story', story_type = 'image' where id = 'eeeeeeee-9999-0000-0000-000000000001' $$,
  'editor: edita el tipo de una historia existente'
);

-- Cliente: lo ve pero no lo puede cambiar
select set_config('request.jwt.claims', '{"sub": "99999999-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select results_eq(
  $$ select story_type::text from public.pieces where id = 'eeeeeeee-9999-0000-0000-000000000001' $$,
  $$ values ('image'::text) $$,
  'cliente: ve el tipo de historia'
);
update public.pieces set story_type = 'video' where id = 'eeeeeeee-9999-0000-0000-000000000001';
reset role;
select results_eq(
  $$ select story_type::text from public.pieces where id = 'eeeeeeee-9999-0000-0000-000000000001' $$,
  $$ values ('image'::text) $$,
  'cliente: no puede cambiar el tipo de historia'
);

select * from finish();
rollback;
