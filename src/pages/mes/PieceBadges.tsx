import {
  FORMAT_LABELS,
  REVIEW_LABELS,
  statusLabel,
  type PieceFormat,
  type PieceStatus,
  type ReviewStatus,
} from '../../lib/pieces'

// Colores de estado con la paleta de Iris & Co (Anexo B). Siempre llevan
// texto: el color nunca es la única señal.
const STATUS_CLASSES: Record<PieceStatus, string> = {
  todo: 'bg-iris-lilac text-iris-violet',
  awaiting_recording: 'bg-iris-lavender text-iris-violet',
  recorded: 'bg-iris-lavender text-iris-violet',
  done: 'bg-iris-lime text-iris-violet',
  published: 'bg-iris-violet text-white',
  archived: 'bg-white text-iris-violet/60 line-through ring-1 ring-iris-lilac',
}

const REVIEW_CLASSES: Record<ReviewStatus, string> = {
  pending: 'bg-white text-iris-violet ring-1 ring-iris-lavender',
  approved: 'bg-iris-lime text-iris-violet',
  changes_requested: 'bg-iris-violet/10 text-iris-violet ring-1 ring-iris-violet',
}

const badge = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap'

export function FormatBadge({ format }: { format: PieceFormat }) {
  return <span className={`${badge} bg-iris-cream ring-1 ring-iris-lilac`}>{FORMAT_LABELS[format]}</span>
}

export function StatusBadge({ status, format }: { status: PieceStatus; format: PieceFormat }) {
  return <span className={`${badge} ${STATUS_CLASSES[status]}`}>{statusLabel(status, format)}</span>
}

export function ReviewBadge({ review }: { review: ReviewStatus }) {
  const icon = review === 'approved' ? '✓ ' : review === 'changes_requested' ? '! ' : ''
  return (
    <span className={`${badge} ${REVIEW_CLASSES[review]}`}>
      {icon}
      {REVIEW_LABELS[review]}
    </span>
  )
}
