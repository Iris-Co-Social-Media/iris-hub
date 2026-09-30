import { dayLabel } from '../../lib/dates'
import type { PieceSummary } from '../../lib/pieces'
import { FormatBadge, ReviewBadge, StatusBadge } from './PieceBadges'

// Lista de piezas: una tarjeta por pieza, cómoda en el celular.
export function PieceList({
  pieces,
  pillarNames,
  showDate = true,
}: {
  pieces: PieceSummary[]
  pillarNames: Map<string, string>
  showDate?: boolean
}) {
  return (
    <ul className="space-y-2">
      {pieces.map((piece) => (
        <li key={piece.id} className="rounded-2xl bg-white p-3 ring-1 ring-iris-lilac sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-bold">{piece.title}</p>
            {showDate && (
              <p className="text-xs font-semibold text-iris-violet/70">
                {piece.estimated_date ? dayLabel(piece.estimated_date) : 'Sin fecha'}
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <FormatBadge format={piece.format} />
            <StatusBadge status={piece.status} format={piece.format} />
            <ReviewBadge review={piece.review_status} />
            {piece.pillar_id && pillarNames.get(piece.pillar_id) && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-iris-violet/80 ring-1 ring-iris-lilac">
                {pillarNames.get(piece.pillar_id)}
              </span>
            )}
            {piece.times_carried_over > 0 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-iris-violet/80 ring-1 ring-iris-lilac">
                Trasladada
              </span>
            )}
            {piece.needs_client_on_camera && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-iris-violet/80 ring-1 ring-iris-lilac">
                Graba el cliente
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
