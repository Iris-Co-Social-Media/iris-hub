import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { monthStartIso, type MonthKey } from '../../lib/dates'
import type { MonthlyPlan, PieceSummary } from '../../lib/pieces'
import { PLAN_ACTIONS, planUpdate, type PlanActionKey } from '../../lib/planStatus'
import { supabase } from '../../lib/supabase'

// Lecturas de la pantalla Mes. Todas pasan por RLS con la sesión de la
// persona: el equipo de Iris ve todo; un usuario del cliente ve solo su
// cliente y nunca planificaciones en borrador (docs/ARQUITECTURA.md §7).

export type ClientSummary = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  brand_colors: { primary?: string; secondary?: string; background?: string }
  quota_posts: number
  quota_stories: number
}

export type Pillar = { id: string; name: string }

export function useIsTeam() {
  return useQuery({
    queryKey: ['is-team'],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase().rpc('is_team')
      if (error) throw error
      return Boolean(data)
    },
    staleTime: 5 * 60_000,
  })
}

export function useClient(slug: string) {
  return useQuery({
    queryKey: ['client', slug],
    queryFn: async (): Promise<ClientSummary | null> => {
      const { data, error } = await supabase()
        .from('clients')
        .select('id, name, slug, logo_url, brand_colors, quota_posts, quota_stories')
        .eq('slug', slug)
        .maybeSingle<ClientSummary>()
      if (error) throw error
      return data
    },
  })
}

export function usePillars(clientId: string | undefined) {
  return useQuery({
    queryKey: ['pillars', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<Pillar[]> => {
      const { data, error } = await supabase()
        .from('pillars')
        .select('id, name')
        .eq('client_id', clientId!)
        .order('position')
        .returns<Pillar[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

export type MonthData = { plan: MonthlyPlan | null; pieces: PieceSummary[] }

export function useMonth(clientId: string | undefined, month: MonthKey) {
  return useQuery({
    queryKey: ['month', clientId, month],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<MonthData> => {
      const { data: plan, error: planError } = await supabase()
        .from('monthly_plans')
        .select('id, month, status, sent_for_review_at, notes')
        .eq('client_id', clientId!)
        .eq('month', monthStartIso(month))
        .maybeSingle<MonthlyPlan>()
      if (planError) throw planError
      if (!plan) return { plan: null, pieces: [] }

      const { data: pieces, error: piecesError } = await supabase()
        .from('pieces')
        .select(
          'id, title, format, status, review_status, estimated_date, times_carried_over, pillar_id, needs_client_on_camera',
        )
        .eq('monthly_plan_id', plan.id)
        .returns<PieceSummary[]>()
      if (piecesError) throw piecesError
      return { plan, pieces: pieces ?? [] }
    },
  })
}

// ---------------------------------------------------------------------------
// Gestión de la planificación (paso 5b). Escritura directa protegida por RLS:
// solo el equipo de Iris puede crear y editar monthly_plans (§7).
// ---------------------------------------------------------------------------

function useInvalidateMonth() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['month'] }),
      queryClient.invalidateQueries({ queryKey: ['review'] }),
      queryClient.invalidateQueries({ queryKey: ['piece'] }),
    ])
}

export function useCreatePlan() {
  const invalidate = useInvalidateMonth()
  return useMutation({
    mutationFn: async ({ clientId, month }: { clientId: string; month: MonthKey }) => {
      // status queda en 'draft' por defecto en la base.
      const { error } = await supabase()
        .from('monthly_plans')
        .insert({ client_id: clientId, month: monthStartIso(month) })
      if (error) {
        if (error.code === '23505') throw new Error('Este mes ya tiene una planificación. Recargamos la pantalla.')
        if (error.code === '42501') throw new Error('No tenés permiso para crear planificaciones.')
        throw new Error('No se pudo crear la planificación. Revisá tu conexión e intentá de nuevo.')
      }
    },
    onSettled: invalidate,
  })
}

export function useChangePlanStatus() {
  const invalidate = useInvalidateMonth()
  return useMutation({
    mutationFn: async ({ plan, action }: { plan: MonthlyPlan; action: PlanActionKey }) => {
      const allowedFrom = PLAN_ACTIONS[action].from
      if (!allowedFrom.includes(plan.status)) {
        throw new Error('Esta acción no corresponde al estado actual de la planificación.')
      }
      // Solo cambia si sigue en el estado que se ve en pantalla: si alguien la
      // cambió mientras tanto, no se pisa.
      const { data, error } = await supabase()
        .from('monthly_plans')
        .update(planUpdate(action))
        .eq('id', plan.id)
        .eq('status', plan.status)
        .select('id')
      if (error) throw new Error('No se pudo cambiar el estado. Revisá tu conexión e intentá de nuevo.')
      if (!data || data.length === 0) {
        throw new Error('No se pudo cambiar: puede que el estado ya haya cambiado o que no tengas permiso. Recargamos la pantalla.')
      }
    },
    onSettled: invalidate,
  })
}
