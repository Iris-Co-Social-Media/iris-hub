import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../lib/auth-context'
import { supabase } from '../lib/supabase'

// Marco de las pantallas internas: barra superior con la identidad de Iris &
// Co (Anexo B), acceso a Inicio y botón Salir. Pensado primero para el celular.
export function AppLayout({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [leaving, setLeaving] = useState(false)

  async function handleSignOut() {
    setLeaving(true)
    await supabase().auth.signOut()
  }

  return (
    <div className="min-h-svh">
      <header className="border-b border-iris-lilac bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="leading-tight">
            <span className="block text-xs font-semibold uppercase tracking-widest text-iris-violet/70">
              Iris &amp; Co
            </span>
            <span className="block text-lg font-extrabold">Planificación</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-iris-violet/70 sm:block">
              {session?.user.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={leaving}
              className="rounded-xl border border-iris-lavender px-3 py-2 text-sm font-bold disabled:opacity-60"
            >
              {leaving ? 'Saliendo…' : 'Salir'}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-8">{children}</main>
    </div>
  )
}
