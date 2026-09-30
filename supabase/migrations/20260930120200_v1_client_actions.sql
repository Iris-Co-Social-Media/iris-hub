-- =============================================================================
-- V1-alpha · Paso 2 · Historial automático y acciones controladas
-- Fuente de verdad: docs/ARQUITECTURA.md (secciones 3.2, 6.2 y 7.4).
--
--   * log_piece_activity: trigger que llena activity_log con cada cambio de
--     una pieza (solo las columnas que cambiaron).
--   * review_piece, mark_published, add_comment: la ÚNICA forma en que un
--     usuario del cliente modifica datos. Son security definer: validan quién
--     llama (auth.uid()), su cliente, su rol/permiso y la transición, y tocan
--     solo los campos permitidos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Historial de piezas
-- -----------------------------------------------------------------------------

create function public.log_piece_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (client_id, piece_id, actor_id, action, before, after)
    values (new.client_id, new.id, auth.uid(), 'created', null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- piece_id queda null: la pieza ya no existe. Su id queda en "before".
    insert into public.activity_log (client_id, piece_id, actor_id, action, before, after)
    values (old.client_id, null, auth.uid(), 'deleted', to_jsonb(old), null);
    return old;
  end if;

  -- UPDATE: guardar solo lo que cambió (sin updated_at).
  select
    jsonb_object_agg(o.key, o.value),
    jsonb_object_agg(o.key, to_jsonb(new) -> o.key)
  into v_before, v_after
  from jsonb_each(to_jsonb(old)) as o
  where o.key <> 'updated_at'
    and o.value is distinct from (to_jsonb(new) -> o.key);

  if v_after is null then
    return new;
  end if;

  v_action := case
    when v_after ? 'monthly_plan_id' then 'moved'
    when v_after ? 'review_status'   then 'review_changed'
    when v_after ? 'status' and new.status = 'published' then 'published'
    when v_after ? 'status'          then 'status_changed'
    else 'updated'
  end;

  insert into public.activity_log (client_id, piece_id, actor_id, action, before, after)
  values (new.client_id, new.id, auth.uid(), v_action, v_before, v_after);

  return new;
end;
$$;

create trigger log_piece_activity
  after insert or update or delete on public.pieces
  for each row execute function public.log_piece_activity();

revoke execute on function public.log_piece_activity() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Acciones controladas (sección 7.4)
--    Los mensajes de error se muestran en la interfaz, por eso van en español.
--    Una pieza que no existe y una pieza que el usuario no puede ver dan el
--    mismo error, para no revelar datos de otros clientes.
-- -----------------------------------------------------------------------------

-- Revisar una idea: Revisado o Cambios pedidos (con nota).
create function public.review_piece(
  p_piece_id uuid,
  p_decision public.review_status,
  p_note     text default null
)
returns public.pieces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_piece       public.pieces;
  v_plan_status public.plan_status;
  v_note        text := nullif(btrim(p_note), '');
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approved', 'changes_requested') then
    raise exception 'La revisión tiene que ser "Revisado" o "Cambios pedidos".' using errcode = '22023';
  end if;

  if not public.can_read_piece(p_piece_id) then
    raise exception 'Pieza no encontrada.' using errcode = 'P0002';
  end if;

  select * into v_piece from public.pieces where id = p_piece_id for update;

  if not public.has_perm(v_piece.client_id, 'can_review') then
    raise exception 'No tenés permiso para revisar piezas.' using errcode = '42501';
  end if;

  -- El cliente revisa solo planificaciones enviadas a revisión o en revisión
  -- completa (no borradores, no meses cerrados).
  if not public.is_team() then
    select mp.status into v_plan_status
    from public.monthly_plans mp
    where mp.id = v_piece.monthly_plan_id;

    if v_plan_status not in ('in_review', 'reviewed') then
      raise exception 'Esta planificación no está abierta para revisión.' using errcode = '22023';
    end if;
  end if;

  if v_piece.status in ('published', 'archived') then
    raise exception 'No se puede revisar una pieza publicada o archivada.' using errcode = '22023';
  end if;

  if p_decision = 'changes_requested' and v_note is null then
    raise exception 'Para pedir cambios hace falta una nota.' using errcode = '22023';
  end if;

  -- Al aprobar, la nota anterior se reemplaza (o se borra); queda guardada en
  -- activity_log.
  update public.pieces
  set review_status = p_decision,
      review_note   = v_note,
      reviewed_by   = v_uid,
      reviewed_at   = now()
  where id = p_piece_id
  returning * into v_piece;

  return v_piece;
end;
$$;

-- Marcar como Publicada (cuando se sube a Instagram).
create function public.mark_published(p_piece_id uuid)
returns public.pieces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_piece public.pieces;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.' using errcode = '42501';
  end if;

  if not public.can_read_piece(p_piece_id) then
    raise exception 'Pieza no encontrada.' using errcode = 'P0002';
  end if;

  select * into v_piece from public.pieces where id = p_piece_id for update;

  if not public.has_perm(v_piece.client_id, 'can_mark_published') then
    raise exception 'No tenés permiso para marcar piezas como publicadas.' using errcode = '42501';
  end if;

  -- Sección 3.2: Diseñada/Editada ──► Publicada.
  if v_piece.status <> 'done' then
    raise exception 'Solo se puede publicar una pieza Diseñada o Editada.' using errcode = '22023';
  end if;

  update public.pieces
  set status       = 'published',
      published_at = now()
  where id = p_piece_id
  returning * into v_piece;

  return v_piece;
end;
$$;

-- Comentar una pieza. Siempre crea comentarios visibles para el cliente
-- (internal = false). Los comentarios internos los crea el equipo directo en
-- la tabla.
create function public.add_comment(p_piece_id uuid, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_client_id uuid;
  v_body      text := btrim(p_body);
  v_comment   public.comments;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.' using errcode = '42501';
  end if;

  if not public.can_read_piece(p_piece_id) then
    raise exception 'Pieza no encontrada.' using errcode = 'P0002';
  end if;

  select p.client_id into v_client_id from public.pieces p where p.id = p_piece_id;

  if not public.has_perm(v_client_id, 'can_comment') then
    raise exception 'No tenés permiso para comentar.' using errcode = '42501';
  end if;

  if v_body is null or v_body = '' then
    raise exception 'El comentario está vacío.' using errcode = '22023';
  end if;

  if char_length(v_body) > 5000 then
    raise exception 'El comentario es demasiado largo (máximo 5000 caracteres).' using errcode = '22023';
  end if;

  insert into public.comments (piece_id, author_id, body, internal)
  values (p_piece_id, v_uid, v_body, false)
  returning * into v_comment;

  return v_comment;
end;
$$;

revoke execute on function
  public.review_piece(uuid, public.review_status, text),
  public.mark_published(uuid),
  public.add_comment(uuid, text)
from public, anon;

grant execute on function
  public.review_piece(uuid, public.review_status, text),
  public.mark_published(uuid),
  public.add_comment(uuid, text)
to authenticated;
