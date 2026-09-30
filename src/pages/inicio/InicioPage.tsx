import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../lib/auth-context'
import { currentMonthKey } from '../../lib/dates'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS, type MyMembership } from '../../lib/types'

type ClientLink = { id: string; name: string; slug: string; brand_colors: { primary?: string } }

// Inicio provisorio: tus accesos y los clientes que podés ver (RLS decide
// cuáles), con acceso directo al mes actual. El resumen de todos los clientes
// (§4) llega más adelante.
export function InicioPage() {
  const { session } = useAuth()
  const userId = session?.user.id

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

  const clients = useQuery({
    queryKey: ['clients', userId],
    enabled: memberships.isSuccess,
    queryFn: async (): Promise<ClientLink[]> => {
      const { data, error } = await supabase()
        .from('clients')
        .select('id, name, slug, brand_colors')
        .eq('active', true)
        .order('name')
        .returns<ClientLink[]>()
      if (error) throw error
      return data ?? []
    },
  })

  return (
    <AppLayout>
      <h1 className="text-2xl font-extrabold">Inicio</h1>

      {memberships.isPending && <p className="mt-4 text-sm">Cargando tus accesos…</p>}
      {memberships.isError && (
        <p className="mt-4 text-sm">No pudimos cargar tus accesos. Probá recargar la página.</p>
      )}
      {memberships.data && memberships.data.length === 0 && (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm ring-1 ring-iris-lilac">
          Tu cuenta todavía no tiene acceso activo. Si creés que es un error, escribile a Iris &amp; Co.
        </p>
      )}
      {memberships.data && memberships.data.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {memberships.data.map((membership) => (
            <li key={membership.id} className="rounded-full bg-white px-3 py-1 ring-1 ring-iris-lilac">
              {membership.client_id ? (membership.clients?.name ?? 'Cliente') : 'Equipo de Iris & Co'} ·{' '}
              <strong>{ROLE_LABELS[membership.role]}</strong>
            </li>
          ))}
        </ul>
      )}

      {clients.data && clients.data.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-extrabold">Clientes</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clients.data.map((client) => (
              <li key={client.id}>
                <Link
                  to={`/${client.slug}/mes/${currentMonthKey()}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac hover:ring-iris-violet"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
                    style={{ backgroundColor: client.brand_colors?.primary ?? '#421869' }}
                  >
                    {client.name.slice(0, 3).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-bold">{client.name}</span>
                    <span className="block text-sm text-iris-violet/70">Ver planificación del mes ›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppLayout>
  )
}
