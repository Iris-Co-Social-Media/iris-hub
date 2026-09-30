-- Campo "Descripción / idea" de la pieza (pieces.description): opcional, el
-- equipo lo crea y edita, el cliente solo lo lee, y no toca la revisión.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('88888888-0000-0000-0000-000000000001', 'editor@iris.test'),
  ('88888888-0000-0000-0000-000000000002', 'jonathan@eia.test');
insert into public.clients (id, name, slug) values
  ('cccccccc-8888-0000-0000-000000000001', 'EIA', 'eia-desc');
insert into public.memberships (email, user_id, client_id, role, can_review, can_comment, can_mark_published) values
  ('editor@iris.test', '88888888-0000-0000-0000-000000000001', null, 'editor', false, false, false),
  ('jonathan@eia.test', '88888888-0000-0000-0000-000000000002', 'cccccccc-8888-0000-0000-000000000001', 'approver', false, false, false);
insert into public.monthly_plans (id, client_id, month, status) values
  ('dddddddd-8888-0000-0000-000000000001', 'cccccccc-8888-0000-0000-000000000001', '2026-10-01', 'in_review');

select has_column('public', 'pieces', 'description', 'pieces tiene la columna description');
select col_is_null('public', 'pieces', 'description', 'description es opcional (acepta null)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "88888888-0000-0000-0000-000000000001", "role": "authenticated"}', true);

-- Crear
select lives_ok(
  $$ insert into public.pieces (id, client_id, monthly_plan_id, title, format)
     values ('eeeeeeee-8888-0000-0000-000000000001', 'cccccccc-8888-0000-0000-000000000001', 'dddddddd-8888-0000-0000-000000000001', 'Sin descripción', 'post') $$,
  'editor: crea una pieza sin descripción'
);
select lives_ok(
  $$ insert into public.pieces (id, client_id, monthly_plan_id, title, format, description)
     values ('eeeeeeee-8888-0000-0000-000000000002', 'cccccccc-8888-0000-0000-000000000001', 'dddddddd-8888-0000-0000-000000000001', 'Con descripción', 'reel', E'Mostrar la obra terminada.\nCerrar con la familia.') $$,
  'editor: crea una pieza con descripción'
);
select results_eq(
  $$ select description from public.pieces where id in ('eeeeeeee-8888-0000-0000-000000000001', 'eeeeeeee-8888-0000-0000-000000000002') order by title $$,
  $$ values (E'Mostrar la obra terminada.\nCerrar con la familia.'), (null::text) $$,
  'la descripción se guarda tal cual (y queda vacía si no se carga)'
);

-- Editar (no toca la revisión ni los otros textos)
reset role;
update public.pieces set review_status = 'approved', script = 'Guion', objective = 'leads'
where id = 'eeeeeeee-8888-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "88888888-0000-0000-0000-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$ update public.pieces set description = 'Idea nueva' where id = 'eeeeeeee-8888-0000-0000-000000000002' $$,
  'editor: edita la descripción'
);
select results_eq(
  $$ select description, review_status::text, script, objective::text from public.pieces where id = 'eeeeeeee-8888-0000-0000-000000000002' $$,
  $$ values ('Idea nueva'::text, 'approved'::text, 'Guion'::text, 'leads'::text) $$,
  'editar la descripción no cambia la revisión, el guion ni el objetivo'
);

-- Cliente: la lee pero no la puede cambiar
select set_config('request.jwt.claims', '{"sub": "88888888-0000-0000-0000-000000000002", "role": "authenticated"}', true);
select results_eq(
  $$ select description from public.pieces where id = 'eeeeeeee-8888-0000-0000-000000000002' $$,
  $$ values ('Idea nueva'::text) $$,
  'cliente: ve la descripción'
);
update public.pieces set description = 'Cambio del cliente' where id = 'eeeeeeee-8888-0000-0000-000000000002';
reset role;
select results_eq(
  $$ select description from public.pieces where id = 'eeeeeeee-8888-0000-0000-000000000002' $$,
  $$ values ('Idea nueva'::text) $$,
  'cliente: no puede editar la descripción'
);

-- Historial
select ok(
  exists (
    select 1 from public.activity_log
    where piece_id = 'eeeeeeee-8888-0000-0000-000000000002'
      and after ->> 'description' = 'Idea nueva'
  ),
  'el cambio de descripción queda en el historial'
);

select * from finish();
rollback;
