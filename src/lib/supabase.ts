import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './env'

let client: SupabaseClient | null = null

export function initSupabase(env: Env): SupabaseClient {
  client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      // La sesión queda guardada en el navegador y se renueva sola
      // (sección 2.3: la sesión dura varias semanas).
      persistSession: true,
      autoRefreshToken: true,
      // Al volver de Google, toma el código de la dirección y abre la sesión.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  return client
}

export function supabase(): SupabaseClient {
  if (!client) throw new Error('Supabase no está inicializado')
  return client
}
