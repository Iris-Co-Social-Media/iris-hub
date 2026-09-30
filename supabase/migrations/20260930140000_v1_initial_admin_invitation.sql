-- =============================================================================
-- V1-alpha · Invitación inicial: primera administradora de Iris & Co
-- Fuente de verdad: docs/ARQUITECTURA.md (secciones 2.1 y 2.3).
--
-- Solo agrega DATOS (una fila en memberships). No cambia tablas, funciones,
-- permisos ni políticas. Es una migración (y no seed.sql) para que la
-- invitación también exista al aplicar las migraciones en iris-prod.
--
-- No crea ninguna cuenta ni contraseña: la cuenta se crea sola la primera vez
-- que la persona entra (código por mail o Google). En ese momento el hook
-- before_user_created_hook la deja pasar y handle_new_auth_user vincula esta
-- invitación (user_id). Si la cuenta ya existía, se vincula con
-- claim_invitations() al entrar.
--
-- Se puede correr más de una vez sin duplicar nada.
-- =============================================================================

insert into public.memberships (
  email,
  client_id,
  role,
  can_review,
  can_comment,
  can_mark_published,
  notify_on_review,
  active
)
values (
  'oliveraluciasoledad@gmail.com',
  null,      -- null = equipo de Iris
  'admin',
  true,
  true,
  true,
  true,
  true
)
on conflict on constraint memberships_email_client_key do nothing;
