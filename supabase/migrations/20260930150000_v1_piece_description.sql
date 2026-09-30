-- =============================================================================
-- V1-alpha · Pieza: campo "Descripción / idea"
-- Fuente de verdad: docs/ARQUITECTURA.md (sección 6.2, tabla `pieces`).
--
-- Agrega una columna de texto libre y opcional para que el equipo describa la
-- idea o el contenido que quiere desarrollar. No reemplaza objetivo, guion ni
-- copy para publicar.
--
-- Solo agrega una columna. No cambia permisos (GRANT) ni políticas (RLS): los
-- permisos de `pieces` son sobre toda la tabla, así que la nueva columna queda
-- con las mismas reglas que el resto (el equipo crea y edita; el cliente solo
-- lee). El historial (log_piece_activity) registra sus cambios solo.
--
-- Se puede correr más de una vez sin error.
-- =============================================================================

alter table public.pieces add column if not exists description text;

comment on column public.pieces.description is
  'Descripción / idea: texto libre y opcional del equipo sobre qué se quiere contar.';
