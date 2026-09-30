import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthState = {
  session: Session | null
  // true mientras se lee la sesión guardada o se completa el ingreso con Google.
  loading: boolean
}

export const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
