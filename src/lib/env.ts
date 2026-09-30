import { z } from 'zod'

// Variables públicas que Vite inserta en el sitio al compilar.
// Solo pueden ir acá datos que el navegador puede ver: la dirección del
// proyecto de Supabase y su clave PÚBLICA (publishable / anon). Nunca claves
// secretas: la seguridad real la da RLS en la base de datos.
const envSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL tiene que ser una dirección https://…' }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string({ message: 'Falta VITE_SUPABASE_PUBLISHABLE_KEY' })
    .min(20, { message: 'VITE_SUPABASE_PUBLISHABLE_KEY parece incompleta' })
    .refine((key) => !isSecretKey(key), {
      message: 'VITE_SUPABASE_PUBLISHABLE_KEY es una clave SECRETA. Usá la clave pública (publishable o anon).',
    }),
})

export type Env = z.infer<typeof envSchema>

// Detecta claves secretas: el formato nuevo (sb_secret_…) y la clave
// service_role del formato viejo (un JWT con role = service_role).
function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

export type EnvResult = { ok: true; env: Env } | { ok: false; problems: string[] }

export function readEnv(): EnvResult {
  const parsed = envSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
  if (parsed.success) return { ok: true, env: parsed.data }
  return { ok: false, problems: parsed.error.issues.map((issue) => issue.message) }
}
