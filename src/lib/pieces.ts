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

// ---------------------------------------------------------------------------
// Detalle de una pieza (§6.2)
// ---------------------------------------------------------------------------

export type Objective = 'educate' | 'leads' | 'experience' | 'engagement' | 'brand'
export type InteractionType = 'none' | 'poll' | 'quiz' | 'question' | 'slider'

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  educate: 'Educar',
  leads: 'Generar consultas',
  experience: 'Mostrar experiencia',
  engagement: 'Interacción',
  brand: 'Marca',
}

export const INTERACTION_LABELS: Record<InteractionType, string> = {
  none: 'Sin interacción',
  poll: 'Encuesta',
  quiz: 'Quiz',
  question: 'Pregunta',
  slider: 'Deslizador',
}

export type PieceDetail = PieceSummary & {
  client_id: string
  monthly_plan_id: string | null
  platform: string
  review_note: string | null
  service_id: string | null
  series_id: string | null
  project_id: string | null
  objective: Objective | null
  interaction: InteractionType
  script: string | null
  publish_copy: string | null
  canva_url: string | null
  album_url: string | null
  published_at: string | null
  updated_at: string
}

// Interacción de una pantalla: {type, question, options[], correct_index}.
export type FrameInteraction = {
  type?: string
  question?: string
  options?: unknown[]
  correct_index?: number
}

export type PieceFrame = {
  id: string
  position: number
  label: string | null
  headline: string | null
  body: string | null
  visual_direction: string | null
  interaction: FrameInteraction | null
  closing: string | null
  updated_at?: string
}

const clean = (text: string | null | undefined) => (text ?? '').trim()

// Texto de la interacción listo para leer o copiar. Devuelve '' si no hay.
export function interactionText(interaction: FrameInteraction | null): string {
  if (!interaction) return ''
  const lines: string[] = []
  const type = interaction.type && interaction.type in INTERACTION_LABELS
    ? INTERACTION_LABELS[interaction.type as InteractionType]
    : clean(interaction.type)
  const question = clean(interaction.question)
  if (type || question) lines.push([type, question].filter(Boolean).join(': '))
  const options = Array.isArray(interaction.options) ? interaction.options.map((o) => clean(String(o))).filter(Boolean) : []
  options.forEach((option, index) => {
    const correct = interaction.correct_index === index ? ' ✓' : ''
    lines.push(`- ${option}${correct}`)
  })
  return lines.join('\n')
}

// Lo que se pega en Canva o Instagram: solo los textos que se publican
// (principal, secundario, interacción y cierre), sin "Qué mostrar".
export function frameCopyText(frame: PieceFrame): string {
  return [clean(frame.headline), clean(frame.body), interactionText(frame.interaction), clean(frame.closing)]
    .filter(Boolean)
    .join('\n\n')
}

// Todas las pantallas, cada una con su nombre.
export function allFramesCopyText(frames: PieceFrame[]): string {
  return [...frames]
    .sort((a, b) => a.position - b.position)
    .map((frame) => {
      const text = frameCopyText(frame)
      if (!text) return ''
      const title = clean(frame.label) || `Pantalla ${frame.position}`
      return `${title}\n${text}`
    })
    .filter(Boolean)
    .join('\n\n———\n\n')
}
