import { useState } from 'react'
import { productionMoves } from '../../lib/pieceForm'
import { statusLabel, type PieceDetail } from '../../lib/pieces'
import { useSetProductionStatus } from './usePieceMutations'

// Cambiar el estado de producción "en un toque" (§4). Solo el equipo de
// Iris; RLS lo vuelve a validar. No toca la revisión del cliente.
// "Publicada" queda para el paso 6 (mark_published).
export function ProductionControls({ piece }: { piece: PieceDetail }) {
  const change = useSetProductionStatus()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const moves = productionMoves(piece.format, piece.status)
  if (moves.length === 0) return null

  const steps = moves.filter((move) => move.kind === 'step')
  const archive = moves.find((move) => move.kind === 'archive')
  const restore = moves.find((move) => move.kind === 'restore')

  return (
    <section aria-label="Estado de producción" className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
      <h2 className="text-sm font-extrabold">
        Estado de producción: <span className="font-bold">{statusLabel(piece.status, piece.format)}</span>
      </h2>
      <p className="text-xs text-iris-violet/70">No cambia la revisión del cliente.</p>

      {steps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {steps.map((move) => (
            <button
              key={move.to}
              type="button"
              disabled={change.isPending}
              onClick={() => change.mutate({ pieceId: piece.id, from: piece.status, to: move.to })}
              className="min-h-11 rounded-xl border border-iris-violet bg-white px-3 py-2 text-sm font-bold disabled:opacity-60"
            >
              → {statusLabel(move.to, piece.format)}
            </button>
          ))}
        </div>
      )}

      {restore && (
        <button
          type="button"
          disabled={change.isPending}
          onClick={() => change.mutate({ pieceId: piece.id, from: piece.status, to: restore.to })}
          className="mt-3 min-h-11 rounded-xl border border-iris-violet bg-white px-3 py-2 text-sm font-bold disabled:opacity-60"
        >
          Desarchivar (vuelve a {statusLabel(restore.to, piece.format)})
        </button>
      )}

      {archive &&
        (confirmArchive ? (
          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-iris-cream p-3 sm:flex-row sm:items-center">
            <span className="text-sm font-bold">¿Archivar esta pieza? Deja de contar en la cuota.</span>
            <button
              type="button"
              disabled={change.isPending}
              onClick={() =>
                change.mutate(
                  { pieceId: piece.id, from: piece.status, to: 'archived' },
                  { onSettled: () => setConfirmArchive(false) },
                )
              }
              className="rounded-lg bg-iris-violet px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              Sí, archivar
            </button>
            <button type="button" onClick={() => setConfirmArchive(false)} className="rounded-lg bg-white px-3 py-2 text-sm font-bold ring-1 ring-iris-lavender">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            className="mt-3 text-sm font-bold underline"
          >
            Archivar pieza
          </button>
        ))}

      {change.isPending && <p className="mt-2 text-xs">Guardando…</p>}
      {change.error && (
        <p role="alert" className="mt-3 rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {change.error.message}
        </p>
      )}
    </section>
  )
}
