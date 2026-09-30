# Instrucciones para Claude Code

**Antes de cualquier cambio, leé completo `docs/ARQUITECTURA.md`.** Es la fuente de verdad del proyecto.
Si una decisión cambia, primero se actualiza ese documento y después el código.

## Reglas obligatorias (resumen de la sección 0 del documento)

- No agregar servicios pagos.
- No cambiar el stack: React + Vite + TypeScript + Tailwind, Supabase, Cloudflare Workers.
- No desactivar la seguridad (RLS) para "hacer que funcione".
- Todo cambio en la base de datos va como archivo de migración numerado en `supabase/migrations/`,
  con sus `GRANT` explícitos y sus políticas RLS (ver sección 5.5).
- Nunca poner claves ni secretos en el código ni en GitHub (ver sección 7.6).
- La interfaz va en español; tablas y columnas, en inglés (ver sección 6).
- Las personas que mantienen el proyecto no saben programar: explicá en lenguaje simple
  cualquier paso que tengan que hacer a mano, y ante un error, **explicá el problema antes de cambiar código**.
- Seguí el orden de construcción de la sección 13 y no avances de paso sin confirmación.

## Comandos

- `npm install` — instala dependencias.
- `npm run dev` — sitio local en http://localhost:5173.
- `npm run build` — verifica tipos y genera `dist/` (lo que publica Cloudflare Workers).
- `npm run lint` — revisa el código.
- `npm test` — pruebas de la lógica del sitio (fechas, cuota).
- `npm run test:db` — aplica las migraciones en un Postgres local descartable y corre las pruebas de permisos.
