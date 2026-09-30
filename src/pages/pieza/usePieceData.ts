import { useQuery } from '@tanstack/react-query'
import type { MonthlyPlan, PieceDetail, PieceFrame } from '../../lib/pieces'
import { supabase } from '../../lib/supabase'

// Lecturas de la pantalla Pieza. Todas pasan por RLS con la sesión de la
// persona: si alguien no puede ver la pieza (otro cliente, borrador, Banco de
// ideas), la base no la devuelve y la pantalla muestra "no encontrada".

const PIECE_COLUMNS = [
  'id', 'client_id', 'monthly_plan_id', 'title', 'description', 'format', 'platform', 'estimated_date',
  'status', 'review_status', 'review_note', 'pillar_id', 'service_id', 'series_id',
  'project_id', 'objective', 'interaction', 'needs_client_on_camera', 'script',
  'publish_copy', 'canva_url', 'album_url', 'times_carried_over', 'published_at', 'updated_at',
].join(', ')

export type PieceBundle = {
  piece: PieceDetail
  frames: PieceFrame[]
  plan: Pick<MonthlyPlan, 'id' | 'month' | 'status'> | null
  names: { service: string | null; series: string | null; project: string | null }
}

async function nameOf(table: 'services' | 'series' | 'projects', id: string | null): Promise<string | null> {
  if (!id) return null
  const { data } = await supabase().from(table).select('name').eq('id', id).maybeSingle<{ name: string }>()
  return data?.name ?? null
}

export function usePiece(clientId: string | undefined, pieceId: string) {
  return useQuery({
    queryKey: ['piece', clientId, pieceId],
    enabled: Boolean(clientId) && /^[0-9a-f-]{36}$/i.test(pieceId),
    queryFn: async (): Promise<PieceBundle | null> => {
      const { data: piece, error } = await supabase()
        .from('pieces')
        .select(PIECE_COLUMNS)
        .eq('id', pieceId)
        .eq('client_id', clientId!)
        .maybeSingle<PieceDetail>()
      if (error) throw error
      if (!piece) return null

      const [frames, plan, service, series, project] = await Promise.all([
        supabase()
          .from('piece_frames')
          .select('id, position, label, headline, body, visual_direction, interaction, closing, updated_at')
          .eq('piece_id', piece.id)
          .order('position')
          .returns<PieceFrame[]>(),
        piece.monthly_plan_id
          ? supabase()
              .from('monthly_plans')
              .select('id, month, status')
              .eq('id', piece.monthly_plan_id)
              .maybeSingle<PieceBundle['plan']>()
          : Promise.resolve({ data: null, error: null }),
        nameOf('services', piece.service_id),
        nameOf('series', piece.series_id),
        nameOf('projects', piece.project_id),
      ])
      if (frames.error) throw frames.error
      if (plan.error) throw plan.error

      return {
        piece,
        frames: frames.data ?? [],
        plan: plan.data ?? null,
        names: { service, series, project },
      }
    },
  })
}
