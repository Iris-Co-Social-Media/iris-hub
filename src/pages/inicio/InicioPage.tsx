import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { AuthLayout } from '../../components/AuthLayout'
import { useAuth } from '../../lib/auth-context'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS, type MyMembership } from '../../lib/types'

// Pantalla provisoria del paso 3: confirma que el ingreso funciona y muestra
// con qué rol entró la persona. Se reemplaza en el paso 5 por las pantallas reales.
export function InicioPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [leaving, setLeaving] = useState(false)

  const memberships = useQuery({
    queryKey: ['my-memberships', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyMembership[]> => {
      // Vincula invitaciones hechas después de crear la cuenta (es seguro
      // llamarla siempre). Si falla, igual se muestran las que ya estaban.
      await supabase().rpc('claim_invitations')
      const { data, error } = await supabase()
        .from('memberships')
        .select('id, role, client_id, clients(name)')
        .eq('user_id', userId!)
        .eq('active', true)
        .order('client_id', { nullsFirst: true })
        .returns<MyMembership[]>()
      if (error) throw error
      return data ?? []
    },
  })

  async function handleSignOut() {
    setLeaving(true)
    await supabase().auth.signOut()
  }

  return (
    <AuthLayout>
      <h2 className="text-lg font-bold">¡Estás adentro!</h2>
      <p className="mt-2 text-sm">
        Entraste como <strong className="break-all">{session?.user.email}</strong>.
      </p>

      <div className="mt-4 rounded-2xl bg-iris-cream p-4 ring-1 ring-iris-lilac">
        {memberships.isPending && <p className="text-sm">Cargando tus accesos…</p>}
        {memberships.isError && (
          <p className="text-sm">No pudimos cargar tus accesos. Probá recargar la página.</p>
        )}
        {memberships.data && memberships.data.length === 0 && (
          <p className="text-sm">
            Tu cuenta todavía no tiene acceso activo. Si creés que es un error, escribile a Iris &amp; Co.
          </p>
        )}
        {memberships.data && memberships.data.length > 0 && (
          <ul className="space-y-2 text-sm">
            {memberships.data.map((membership) => (
              <li key={membership.id} className="flex flex-wrap justify-between gap-2">
                <span>{membership.client_id ? (membership.clients?.name ?? 'Cliente') : 'Equipo de Iris & Co'}</span>
                <span className="rounded-full bg-iris-lavender px-3 py-0.5 font-semibold">
                  {ROLE_LABELS[membership.role]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={handleSignOut}
        disabled={leaving}
        className="mt-6 w-full rounded-xl border border-iris-lavender bg-white px-4 py-3 text-base font-bold disabled:opacity-60"
      >
        {leaving ? 'Saliendo…' : 'Salir'}
      </button>
    </AuthLayout>
  )
}
