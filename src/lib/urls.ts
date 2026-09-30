// Dirección a la que Supabase devuelve a la persona después de Google o de un
// link de mail. Se toma del sitio donde está abierta la app (vista previa,
// producción o la compu), así no hay que escribir ninguna dirección a mano.
// Esa dirección tiene que estar permitida en Supabase → Authentication →
// URL Configuration → Redirect URLs (ver docs/INGRESO.md, B5); si no lo está,
// Supabase usa el "Site URL".
export function authRedirectUrl(): string {
  return `${window.location.origin}/`
}
