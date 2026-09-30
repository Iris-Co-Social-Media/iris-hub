-- =============================================================================
-- V1-alpha · Paso 2 · Seguridad: funciones de ayuda, GRANT y RLS
-- Fuente de verdad: docs/ARQUITECTURA.md (secciones 2.2, 5.5 y 7).
--
-- Modelo:
--   * Equipo de Iris (membresía activa con client_id null, rol admin/editor):
--     ve todo. Editor crea y edita; solo admin borra, invita, ve precios y
--     edita la configuración del cliente (panel).
--   * Usuarios del cliente (aprobador/lector): solo leen filas de SU client_id,
--     nunca planificaciones en 'draft' ni sus piezas, nunca el Banco de ideas,
--     nunca comentarios internos, planes ni historial. No escriben tablas
--     directamente: usan review_piece, mark_published y add_comment.
--   * anon (sin sesión) no tiene ningún acceso.
--
-- El proyecto tiene desactivado "Automatically expose new tables", por eso cada
-- tabla recibe GRANT explícitos. Igual se revoca todo primero, para que el
-- resultado no dependa de esa configuración.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Funciones de ayuda (sección 7.2)
--    security definer: leen memberships sin pasar por RLS (evita recursión).
--    Solo informan sobre el usuario que llama (auth.uid()).
-- -----------------------------------------------------------------------------

-- El usuario es admin o editor de Iris.
create function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.client_id is null
      and m.active
      and m.role in ('admin', 'editor')
  );
$$;

-- El usuario es admin de Iris.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.client_id is null
      and m.active
      and m.role = 'admin'
  );
$$;

-- El usuario tiene una membresía activa en ESE cliente (aprobador o lector).
-- No incluye al equipo de Iris: para eso está is_team().
create function public.is_client_member(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.client_id = p_client_id
      and m.active
  );
$$;

-- Rol efectivo del usuario en un cliente: su rol de Iris (admin/editor) si es
-- del equipo; si no, su rol en ese cliente (approver/viewer); si no, null.
create function public.client_role(p_client_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select m.role
      from public.memberships m
      where m.user_id = (select auth.uid())
        and m.client_id is null
        and m.active
      order by m.role
      limit 1
    ),
    (
      select m.role
      from public.memberships m
      where m.user_id = (select auth.uid())
        and m.client_id = p_client_id
        and m.active
      limit 1
    )
  );
$$;

-- Permiso efectivo del usuario en un cliente (sección 2.2):
--   can_review / can_comment: equipo, rol approver, o permiso extra.
--   can_mark_published:       equipo, o permiso extra.
--   notify_on_review:         solo el permiso extra (es un aviso, no un poder).
create function public.has_perm(p_client_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.memberships;
begin
  if p_permission not in ('can_review', 'can_comment', 'can_mark_published', 'notify_on_review') then
    raise exception 'Permiso desconocido: %', p_permission using errcode = '22023';
  end if;

  if (select auth.uid()) is null then
    return false;
  end if;

  if p_permission <> 'notify_on_review' and public.is_team() then
    return true;
  end if;

  select m.* into v_member
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.client_id = p_client_id
    and m.active
  limit 1;

  if not found then
    return false;
  end if;

  return case p_permission
    when 'can_review'         then v_member.can_review or v_member.role = 'approver'
    when 'can_comment'        then v_member.can_comment or v_member.role = 'approver'
    when 'can_mark_published' then v_member.can_mark_published
    when 'notify_on_review'   then v_member.notify_on_review
  end;
end;
$$;

-- El usuario puede ver la pieza: equipo, o miembro del cliente cuando la pieza
-- está en una planificación que ya no es borrador. El Banco de ideas
-- (monthly_plan_id null) es solo del equipo.
create function public.can_read_piece(p_piece_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pieces p
    where p.id = p_piece_id
      and (
        public.is_team()
        or (
          p.monthly_plan_id is not null
          and public.is_client_member(p.client_id)
          and exists (
            select 1
            from public.monthly_plans mp
            where mp.id = p.monthly_plan_id
              and mp.status <> 'draft'
          )
        )
      )
  );
$$;

-- El usuario puede ver el perfil (nombre y foto) de otra persona: el propio,
-- cualquiera si es del equipo, los del equipo de Iris, y los de su mismo
-- cliente. Nunca los de otros clientes.
create function public.can_see_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = (select auth.uid())
    or public.is_team()
    or exists (
      select 1
      from public.memberships target
      where target.user_id = p_user_id
        and target.active
        and (
          target.client_id is null
          or public.is_client_member(target.client_id)
        )
    );
$$;

-- Solo usuarios con sesión pueden ejecutar las funciones de ayuda.
revoke execute on function
  public.is_team(),
  public.is_admin(),
  public.is_client_member(uuid),
  public.client_role(uuid),
  public.has_perm(uuid, text),
  public.can_read_piece(uuid),
  public.can_see_profile(uuid),
  public.set_updated_at()
from public, anon;

grant execute on function
  public.is_team(),
  public.is_admin(),
  public.is_client_member(uuid),
  public.client_role(uuid),
  public.has_perm(uuid, text),
  public.can_read_piece(uuid),
  public.can_see_profile(uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. GRANT explícitos (sección 5.5)
--    Primero se revoca todo; después se da solo lo necesario. RLS decide qué
--    filas. service_role es solo para Edge Functions (nunca en el navegador).
-- -----------------------------------------------------------------------------

revoke all on table
  public.plans, public.clients, public.memberships, public.profiles,
  public.monthly_plans, public.pieces, public.piece_frames,
  public.pillars, public.services, public.series, public.projects,
  public.client_profiles, public.audience_personas,
  public.comments, public.activity_log, public.reports
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.plans, public.clients, public.memberships,
  public.monthly_plans, public.pieces, public.piece_frames,
  public.pillars, public.services, public.series, public.projects,
  public.client_profiles, public.audience_personas,
  public.comments, public.reports
to authenticated;

-- Perfiles: cada uno crea y edita el suyo; no se borran desde la app.
grant select, insert, update on table public.profiles to authenticated;

-- Historial: solo lectura. Lo escribe un trigger.
grant select on table public.activity_log to authenticated;

grant select, insert, update, delete on table
  public.plans, public.clients, public.memberships, public.profiles,
  public.monthly_plans, public.pieces, public.piece_frames,
  public.pillars, public.services, public.series, public.projects,
  public.client_profiles, public.audience_personas,
  public.comments, public.activity_log, public.reports
to service_role;

-- -----------------------------------------------------------------------------
-- 3. RLS en TODAS las tablas
-- -----------------------------------------------------------------------------

alter table public.plans             enable row level security;
alter table public.clients           enable row level security;
alter table public.memberships       enable row level security;
alter table public.profiles          enable row level security;
alter table public.monthly_plans     enable row level security;
alter table public.pieces            enable row level security;
alter table public.piece_frames      enable row level security;
alter table public.pillars           enable row level security;
alter table public.services          enable row level security;
alter table public.series            enable row level security;
alter table public.projects          enable row level security;
alter table public.client_profiles   enable row level security;
alter table public.audience_personas enable row level security;
alter table public.comments          enable row level security;
alter table public.activity_log      enable row level security;
alter table public.reports           enable row level security;

-- plans: solo admin (contiene precios).
create policy plans_admin_all on public.plans
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- clients: el equipo ve todos; cada usuario del cliente ve el suyo.
-- Solo admin crea, edita o borra (plan, cuota y avisos son del panel).
create policy clients_select on public.clients
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(id));
create policy clients_admin_insert on public.clients
  for insert to authenticated
  with check ((select public.is_admin()));
create policy clients_admin_update on public.clients
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy clients_admin_delete on public.clients
  for delete to authenticated
  using ((select public.is_admin()));

-- memberships: el equipo ve todas; cada persona ve la suya.
-- Solo admin invita y cambia permisos.
create policy memberships_select on public.memberships
  for select to authenticated
  using ((select public.is_team()) or user_id = (select auth.uid()));
create policy memberships_admin_insert on public.memberships
  for insert to authenticated
  with check ((select public.is_admin()));
create policy memberships_admin_update on public.memberships
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy memberships_admin_delete on public.memberships
  for delete to authenticated
  using ((select public.is_admin()));

-- profiles: ver según can_see_profile; cada uno crea y edita solo el suyo.
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.can_see_profile(id));
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- monthly_plans: el cliente no ve borradores. Equipo crea y edita; admin borra.
create policy monthly_plans_select on public.monthly_plans
  for select to authenticated
  using (
    (select public.is_team())
    or (status <> 'draft' and public.is_client_member(client_id))
  );
create policy monthly_plans_team_insert on public.monthly_plans
  for insert to authenticated
  with check ((select public.is_team()));
create policy monthly_plans_team_update on public.monthly_plans
  for update to authenticated
  using ((select public.is_team()))
  with check ((select public.is_team()));
create policy monthly_plans_admin_delete on public.monthly_plans
  for delete to authenticated
  using ((select public.is_admin()));

-- pieces: lectura según can_read_piece. Equipo crea y edita; solo admin borra.
create policy pieces_select on public.pieces
  for select to authenticated
  using ((select public.is_team()) or public.can_read_piece(id));
create policy pieces_team_insert on public.pieces
  for insert to authenticated
  with check ((select public.is_team()));
create policy pieces_team_update on public.pieces
  for update to authenticated
  using ((select public.is_team()))
  with check ((select public.is_team()));
create policy pieces_admin_delete on public.pieces
  for delete to authenticated
  using ((select public.is_admin()));

-- piece_frames: se ven si se ve la pieza. Editarlas es editar la pieza (equipo).
create policy piece_frames_select on public.piece_frames
  for select to authenticated
  using ((select public.is_team()) or public.can_read_piece(piece_id));
create policy piece_frames_team_insert on public.piece_frames
  for insert to authenticated
  with check ((select public.is_team()));
create policy piece_frames_team_update on public.piece_frames
  for update to authenticated
  using ((select public.is_team()))
  with check ((select public.is_team()));
create policy piece_frames_team_delete on public.piece_frames
  for delete to authenticated
  using ((select public.is_team()));

-- Catálogos, ficha, perfiles de público e informes: el cliente lee lo suyo;
-- el equipo crea y edita; solo admin borra (para ocultar se usa active=false).
create policy pillars_select on public.pillars
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(client_id));
create policy pillars_team_insert on public.pillars
  for insert to authenticated with check ((select public.is_team()));
create policy pillars_team_update on public.pillars
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy pillars_admin_delete on public.pillars
  for delete to authenticated using ((select public.is_admin()));

create policy services_select on public.services
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(client_id));
create policy services_team_insert on public.services
  for insert to authenticated with check ((select public.is_team()));
create policy services_team_update on public.services
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy services_admin_delete on public.services
  for delete to authenticated using ((select public.is_admin()));

create policy series_select on public.series
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(client_id));
create policy series_team_insert on public.series
  for insert to authenticated with check ((select public.is_team()));
create policy series_team_update on public.series
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy series_admin_delete on public.series
  for delete to authenticated using ((select public.is_admin()));

create policy projects_select on public.projects
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(client_id));
create policy projects_team_insert on public.projects
  for insert to authenticated with check ((select public.is_team()));
create policy projects_team_update on public.projects
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy projects_admin_delete on public.projects
  for delete to authenticated using ((select public.is_admin()));

create policy client_profiles_select on public.client_profiles
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(client_id));
create policy client_profiles_team_insert on public.client_profiles
  for insert to authenticated with check ((select public.is_team()));
create policy client_profiles_team_update on public.client_profiles
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy client_profiles_admin_delete on public.client_profiles
  for delete to authenticated using ((select public.is_admin()));

create policy audience_personas_select on public.audience_personas
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(client_id));
create policy audience_personas_team_insert on public.audience_personas
  for insert to authenticated with check ((select public.is_team()));
create policy audience_personas_team_update on public.audience_personas
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy audience_personas_admin_delete on public.audience_personas
  for delete to authenticated using ((select public.is_admin()));

create policy reports_select on public.reports
  for select to authenticated
  using ((select public.is_team()) or public.is_client_member(client_id));
create policy reports_team_insert on public.reports
  for insert to authenticated with check ((select public.is_team()));
create policy reports_team_update on public.reports
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy reports_admin_delete on public.reports
  for delete to authenticated using ((select public.is_admin()));

-- comments: los internos solo los ve el equipo. El cliente comenta solo con
-- add_comment(). El equipo escribe directo, siempre a su nombre; edita solo
-- los suyos; borra los suyos (admin, cualquiera).
create policy comments_select on public.comments
  for select to authenticated
  using (
    (select public.is_team())
    or (not internal and public.can_read_piece(piece_id))
  );
create policy comments_team_insert on public.comments
  for insert to authenticated
  with check ((select public.is_team()) and author_id = (select auth.uid()));
create policy comments_team_update_own on public.comments
  for update to authenticated
  using ((select public.is_team()) and author_id = (select auth.uid()))
  with check ((select public.is_team()) and author_id = (select auth.uid()));
create policy comments_team_delete on public.comments
  for delete to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_team()) and author_id = (select auth.uid()))
  );

-- activity_log: solo el equipo lo lee. Sin políticas de escritura.
create policy activity_log_team_select on public.activity_log
  for select to authenticated
  using ((select public.is_team()));
