-- Pruebas del seed (supabase/seed.sql). Corren en una base con las migraciones
-- y el seed ya aplicados UNA vez (ver scripts/db-local/test.sh). Acá se aplica
-- el seed una segunda vez para comprobar que no duplica ni pisa datos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ---------------------------------------------------------------------------
-- Contenido después del primer seed
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select name, slug, signature, instagram_handle, quota_posts, quota_stories,
            publish_copy_enabled, report_every_months, active
     from public.clients $$,
  $$ values ('EIA Ingeniería', 'eia', '| EIA Ingeniería', '@eia.ingenieria', 8, 15, false, 3, true) $$,
  'seed: un solo cliente, EIA, con firma, Instagram y cuota 8 + 15'
);
select is(
  (select brand_colors from public.clients where slug = 'eia'),
  '{"primary": "#2C3D42", "secondary": "#ED5824", "background": "#F1E7DD"}'::jsonb,
  'seed: colores de EIA (Anexo C)'
);
select results_eq(
  $$ select p.name, p.quota_posts, p.quota_stories, p.monthly_price is null
     from public.plans p join public.clients c on c.plan_id = p.id where c.slug = 'eia' $$,
  $$ values ('Silver', 8, 15, true) $$,
  'seed: EIA tiene el plan Silver, sin precio cargado'
);
select results_eq(
  $$ select name from public.pillars order by position $$,
  array['Educativo técnico', 'Servicios', 'Obra real', 'Series/cultura', 'Actualidad', 'Marca'],
  'seed: los 6 pilares, en orden'
);
select is((select count(*)::int from public.services), 9, 'seed: los 9 servicios de EIA');
select results_eq(
  $$ select name from public.services order by position limit 1 $$,
  array['Cálculo y diseño estructural'],
  'seed: el primer servicio es Cálculo y diseño estructural'
);
select results_eq(
  $$ select name from public.series $$,
  array['Arquitectura alrededor del mundo'],
  'seed: la serie activa'
);
select is(
  (select count(*)::int from public.pillars p join public.clients c on c.id = p.client_id where c.slug <> 'eia')
  + (select count(*)::int from public.services s join public.clients c on c.id = s.client_id where c.slug <> 'eia'),
  0,
  'seed: todos los catálogos pertenecen a EIA'
);
select ok(
  (select tone like 'Claro, cercano y profesional%' and cardinality(ai_rules) = 2
   from public.client_profiles cp join public.clients c on c.id = cp.client_id where c.slug = 'eia'),
  'seed: ficha de EIA con tono y reglas'
);
select is(
  (select data ->> 'miedos' from public.audience_personas where name = 'Juan'),
  'Ser estafado',
  'seed: perfil de público Juan'
);
select is((select count(*)::int from public.projects), 0, 'seed: no inventa obras');
select is((select count(*)::int from public.monthly_plans), 0, 'seed: no crea planificaciones');
select is((select count(*)::int from public.pieces), 0, 'seed: no crea piezas');
select results_eq(
  $$ select email, role::text from public.memberships $$,
  $$ values ('oliveraluciasoledad@gmail.com', 'admin') $$,
  'seed: no agrega invitaciones (solo existe la admin de la migración)'
);

-- ---------------------------------------------------------------------------
-- RLS sobre los datos sembrados
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('bbbbbbbb-2222-2222-2222-000000000001', 'oliveraluciasoledad@gmail.com', now()),
  ('bbbbbbbb-2222-2222-2222-000000000002', 'sin-invitacion@test.test', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-2222-2222-2222-000000000001", "role": "authenticated"}', true);
select is((select count(*)::int from public.pillars), 6, 'RLS: la admin ve los pilares de EIA');
select is((select count(*)::int from public.plans), 1, 'RLS: la admin ve el plan');

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-2222-2222-2222-000000000002", "role": "authenticated"}', true);
select is((select count(*)::int from public.clients), 0, 'RLS: sin invitación no ve a EIA');
select is((select count(*)::int from public.services), 0, 'RLS: sin invitación no ve los servicios');
reset role;

-- ---------------------------------------------------------------------------
-- Segunda ejecución: no duplica ni pisa ediciones hechas desde el panel
-- ---------------------------------------------------------------------------
update public.pillars set description = 'Editado desde el panel' where name = 'Marca';
update public.clients set quota_stories = 12 where slug = 'eia';
update public.plans set monthly_price = 1234 where name = 'Silver';

\ir ../../seed.sql

select is((select count(*)::int from public.clients), 1, 'segunda vez: sigue habiendo un cliente');
select is((select count(*)::int from public.plans), 1, 'segunda vez: sigue habiendo un plan');
select is((select count(*)::int from public.pillars), 6, 'segunda vez: siguen siendo 6 pilares');
select is((select count(*)::int from public.services), 9, 'segunda vez: siguen siendo 9 servicios');
select is((select count(*)::int from public.series), 1, 'segunda vez: sigue habiendo una serie');
select is((select count(*)::int from public.client_profiles), 1, 'segunda vez: sigue habiendo una ficha');
select is((select count(*)::int from public.audience_personas), 1, 'segunda vez: sigue habiendo un perfil de público');
select is(
  (select description from public.pillars where name = 'Marca'),
  'Editado desde el panel',
  'segunda vez: no pisa la edición de un pilar'
);
select is(
  (select quota_stories from public.clients where slug = 'eia'),
  12,
  'segunda vez: no pisa la cuota editada'
);
select is(
  (select monthly_price from public.plans where name = 'Silver'),
  1234.00,
  'segunda vez: no borra el precio cargado desde el panel'
);

select * from finish();
rollback;
