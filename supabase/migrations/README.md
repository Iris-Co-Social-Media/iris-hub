# Migraciones

Todo cambio de base de datos va acá como archivo SQL, con el formato de Supabase CLI:
`AAAAMMDDHHMMSS_descripcion.sql` (el número es la fecha y hora; define el orden).

Reglas (ver `docs/ARQUITECTURA.md`, secciones 5.5 y 7):

- Nunca editar una migración que ya se aplicó en un proyecto: se agrega una nueva.
- Cada tabla nueva lleva `enable row level security`, sus políticas y sus `GRANT`
  explícitos a `authenticated` (nunca a `anon` salvo que haga falta).
- Toda función `security definer` fija `set search_path = ''` y revoca `execute` a `public` y `anon`.
- Antes de aplicar: `npm run test:db` (pruebas de permisos) y después en **iris-pruebas**.
  Recién entonces en **iris-prod**.

## Migraciones actuales

| Archivo | Contenido |
|---|---|
| `20260930120000_v1_core_schema.sql` | Enums, tablas del núcleo V1, claves foráneas, restricciones, índices, `updated_at` |
| `20260930120100_v1_rls.sql` | Funciones de ayuda (`is_team`, `is_admin`, `client_role`, `has_perm`…), `GRANT` y políticas RLS |
| `20260930120200_v1_client_actions.sql` | Historial automático de piezas y acciones controladas (`review_piece`, `mark_published`, `add_comment`) |
