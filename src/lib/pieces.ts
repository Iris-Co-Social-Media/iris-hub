// Piezas, planificaciones y cuota (docs/ARQUITECTURA.md §3 y §6.1).
// Los valores vienen de la base (en inglés); las etiquetas, en español.

export type PieceFormat = 'story' | 'post' | 'carousel' | 'reel'
export type PieceStatus = 'todo' | 'awaiting_recording' | 'recorded' | 'done' | 'published' | 'archived'
export type ReviewStatus = 'pending' | 'approved' | 'changes_requested'
export type PlanStatus = 'draft' | 'in_review' | 'reviewed' | 'closed'

export const FORMAT_LABELS: Record<PieceFormat, string> = {
  story: 'Historia',
  post: 'Post',
  carousel: 'Carrusel',
  reel: 'Reel',
}

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: 'Sin revisar',
  approved: 'Revisado',
  changes_requested: 'Cambios pedidos',
}

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: 'Borrador',
  in_review: 'Enviada a revisión',
  reviewed: 'Revisión completa',
  closed: 'Cerrada',
}

// "done" se llama Diseñada, salvo en los reels, donde es Editada (§3.2).
export function statusLabel(status: PieceStatus, format: PieceFormat): string {
  switch (status) {
    case 'todo':
      return format === 'reel' ? 'Por hacer (guion)' : 'Por hacer'
    case 'awaiting_recording':
      return 'Esperando grabación'
    case 'recorded':
      return 'Grabado'
    case 'done':
      return format === 'reel' ? 'Editada' : 'Diseñada'
    case 'published':
      return 'Publicada'
    case 'archived':
      return 'Archivada'
  }
}

export type MonthlyPlan = {
  id: string
  month: string
  status: PlanStatus
  sent_for_review_at: string | null
  notes: string | null
}

export type PieceSummary = {
  id: string
  title: string
  format: PieceFormat
  status: PieceStatus
  review_status: ReviewStatus
  estimated_date: string | null
  times_carried_over: number
  pillar_id: string | null
  needs_client_on_camera: boolean
}

// Historias van a la cuota de historias; posts, carruseles y reels, a la de
// posteos (§3.1: "1 reel trasladado → faltan 7 posteos").
export function quotaBucket(format: PieceFormat): 'stories' | 'posts' {
  return format === 'story' ? 'stories' : 'posts'
}

export type QuotaLine = {
  quota: number
  planned: number // piezas del mes (sin archivadas), incluidas las trasladadas
  carried: number // de esas, cuántas vinieron de otro mes
  missing: number // cuántas faltan planificar
}

export type QuotaSummary = { posts: QuotaLine; stories: QuotaLine }

// Cuota del mes (§3.1): cuota del plan − piezas trasladadas = lo nuevo a
// planificar. Las archivadas no cuentan.
export function computeQuota(
  pieces: Pick<PieceSummary, 'format' | 'status' | 'times_carried_over'>[],
  quotaPosts: number,
  quotaStories: number,
): QuotaSummary {
  const line = (quota: number): QuotaLine => ({ quota, planned: 0, carried: 0, missing: 0 })
  const result: QuotaSummary = { posts: line(quotaPosts), stories: line(quotaStories) }
  for (const piece of pieces) {
    if (piece.status === 'archived') continue
    const bucket = result[quotaBucket(piece.format)]
    bucket.planned += 1
    if (piece.times_carried_over > 0) bucket.carried += 1
  }
  for (const bucket of [result.posts, result.stories]) {
    bucket.missing = Math.max(0, bucket.quota - bucket.planned)
  }
  return result
}

// Orden de la lista: por fecha estimativa (las sin fecha al final) y título.
export function sortPieces<T extends Pick<PieceSummary, 'estimated_date' | 'title'>>(pieces: T[]): T[] {
  return [...pieces].sort((a, b) => {
    if (a.estimated_date !== b.estimated_date) {
      if (!a.estimated_date) return 1
      if (!b.estimated_date) return -1
      return a.estimated_date < b.estimated_date ? -1 : 1
    }
    return a.title.localeCompare(b.title, 'es')
  })
}
