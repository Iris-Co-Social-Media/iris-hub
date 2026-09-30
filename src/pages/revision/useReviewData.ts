import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { monthStartIso, type MonthKey } from '../../lib/dates'
import type { MonthlyPlan, PieceFrame, PieceSummary } from '../../lib/pieces'
import { supabase } from '../../lib/supabase'

// Lecturas y acciones de la pantalla Revisión. Todo pasa por la base con la
// sesión de la persona:
//   * decidir (Revisado / Cambios pedidos) usa review_piece(), que valida
//     permiso, estado de la planificación y nota (docs/ARQUITECTURA.md §7.4);
//   * volver a "Sin revisar" después de corregir lo hace el equipo de Iris
//     editando la pieza (RLS solo se lo permite al equipo).

export type ReviewPiece = PieceSummary & {
  review_note: string | null
  reviewed_at: string | null
}

export type ReviewData = {
  plan: MonthlyPlan | null
  pieces: ReviewPiece[]
  frames: Map<string, PieceFrame[]>
  canReview: boolean
}

export function useReview(clientId: string | undefined, month: MonthKey) {
  return useQuery({
    queryKey: ['review', clientId, month],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ReviewData> => {
      const [planResult, permResult] = await Promise.all([
        supabase()
          .from('monthly_plans')
          .select('id, month, status, sent_for_review_at, notes')
          .eq('client_id', clientId!)
          .eq('month', monthStartIso(month))
          .maybeSingle<MonthlyPlan>(),
        supabase().rpc('has_perm', { p_client_id: clientId, p_permission: 'can_review' }),
      ])
      if (planResult.error) throw planResult.error
      if (permResult.error) throw permResult.error
      const plan = planResult.data
      const canReview = Boolean(permResult.data)
      if (!plan) return { plan: null, pieces: [], frames: new Map(), canReview }

      const { data: pieces, error } = await supabase()
        .from('pieces')
        .select(
          'id, title, format, status, review_status, review_note, reviewed_at, estimated_date, times_carried_over, pillar_id, needs_client_on_camera',
        )
        .eq('monthly_plan_id', plan.id)
        .returns<ReviewPiece[]>()
      if (error) throw error

      const frames = new Map<string, PieceFrame[]>()
      const ids = (pieces ?? []).map((piece) => piece.id)
      if (ids.length > 0) {
        const { data: frameRows, error: framesError } = await supabase()
          .from('piece_frames')
          .select('id, piece_id, position, label, headline, body, visual_direction, interaction, closing')
          .in('piece_id', ids)
          .order('position')
          .returns<(PieceFrame & { piece_id: string })[]>()
        if (framesError) throw framesError
        for (const frame of frameRows ?? []) {
          frames.set(frame.piece_id, [...(frames.get(frame.piece_id) ?? []), frame])
        }
      }
      return { plan, pieces: pieces ?? [], frames, canReview }
    },
  })
}

type Decision = { pieceId: string; decision: 'approved' | 'changes_requested'; note: string | null }

// Los mensajes de error de la base ya están en español y son claros.
function friendly(error: { message?: string } | null): Error {
  return new Error(error?.message || 'No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['review'] }),
      queryClient.invalidateQueries({ queryKey: ['month'] }),
      queryClient.invalidateQueries({ queryKey: ['piece'] }),
    ])
}

export function useDecide() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ pieceId, decision, note }: Decision) => {
      const { error } = await supabase().rpc('review_piece', {
        p_piece_id: pieceId,
        p_decision: decision,
        p_note: note,
      })
      if (error) throw friendly(error)
    },
    onSettled: invalidate,
  })
}

// "Iris corrige → Sin revisar". Solo cambia review_status: la nota queda
// como referencia de lo que se pidió (y el historial guarda el cambio).
export function useMarkCorrected() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (pieceId: string) => {
      const { data, error } = await supabase()
        .from('pieces')
        .update({ review_status: 'pending' })
        .eq('id', pieceId)
        .eq('review_status', 'changes_requested')
        .select('id')
      if (error) throw friendly(error)
      if (!data || data.length === 0) {
        throw new Error('No se pudo marcar como corregida. Puede que ya haya cambiado o que no tengas permiso.')
      }
    },
    onSettled: invalidate,
  })
}
