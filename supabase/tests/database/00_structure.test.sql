-- Pruebas de estructura: tablas, tipos, RLS en todo, sin acceso anónimo y
-- funciones security definer con search_path fijo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Tablas del núcleo V1 -------------------------------------------------------
select has_table('public', t, 'existe la tabla ' || t)
from unnest(array[
  'clients', 'plans', 'memberships', 'profiles', 'monthly_plans', 'pieces',
  'piece_frames', 'pillars', 'services', 'series', 'projects',
  'client_profiles', 'audience_personas', 'comments', 'activity_log', 'reports'
]) as t;

-- Tipos fijos ---------------------------------------------------------------
select enum_has_labels('public', 'member_role', array['admin', 'editor', 'approver', 'viewer']);
select enum_has_labels('public', 'piece_format', array['story', 'post', 'carousel', 'reel']);
select enum_has_labels('public', 'piece_status',
  array['todo', 'awaiting_recording', 'recorded', 'done', 'published', 'archived']);
select enum_has_labels('public', 'review_status', array['pending', 'approved', 'changes_requested']);
select enum_has_labels('public', 'plan_status', array['draft', 'in_review', 'reviewed', 'closed']);
select enum_has_labels('public', 'objective', array['educate', 'leads', 'experience', 'engagement', 'brand']);
select enum_has_labels('public', 'interaction_type', array['none', 'poll', 'quiz', 'question', 'slider']);
select enum_has_labels('public', 'piece_origin', array['manual', 'ai', 'notion_import']);

-- Seguridad -----------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'todas las tablas de public tienen RLS activado'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  'todas las tablas de public tienen al menos una política'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and (has_table_privilege('anon', c.oid, 'SELECT')
         or has_table_privilege('anon', c.oid, 'INSERT')
         or has_table_privilege('anon', c.oid, 'UPDATE')
         or has_table_privilege('anon', c.oid, 'DELETE')) $$,
  'anon no tiene privilegios sobre ninguna tabla'
);

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon no puede ejecutar ninguna función de public'
);

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'toda función security definer fija search_path vacío'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'activity_log'
       and (has_table_privilege('authenticated', c.oid, 'INSERT')
         or has_table_privilege('authenticated', c.oid, 'UPDATE')
         or has_table_privilege('authenticated', c.oid, 'DELETE')) $$,
  'activity_log es de solo lectura para authenticated'
);

select * from finish();
rollback;
