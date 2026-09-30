# Pruebas de permisos (RLS)

Se corren antes de cada cambio en la base de datos. Ver `docs/ARQUITECTURA.md` (sección 7.5).

Están escritas en [pgTAP](https://pgtap.org/), el formato que usa Supabase.

- **En la compu o en Claude Code:** `npm run test:db`. Levanta un Postgres local descartable,
  aplica las migraciones y corre las pruebas. No toca ningún proyecto de Supabase.
  Requiere PostgreSQL, pgTAP y `pg_prove` instalados (ver `scripts/db-local/test.sh`).
- **Con Supabase CLI y Docker:** `supabase test db`.

Archivos:

- `database/00_structure.test.sql` — tablas, enums, RLS en todas las tablas, sin acceso anónimo.
- `database/01_permissions.test.sql` — qué ve y qué puede hacer cada rol (admin, editor,
  aprobador, lector, otro cliente, sin invitación, acceso quitado, sin sesión).
- `database/02_auth.test.sql` — hook de invitación, vinculación de invitaciones y perfiles.
