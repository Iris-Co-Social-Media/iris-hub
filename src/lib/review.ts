// Revisión del cliente (docs/ARQUITECTURA.md §3.2):
//   Sin revisar ──► Revisado
//               └─► Cambios pedidos (con nota) ──► (Iris corrige) ──► Sin revisar
// Es independiente del estado de producción.

import type { PieceStatus, PlanStatus, ReviewStatus } from './pieces'

type Reviewable = { status: PieceStatus; review_status: ReviewStatus }

// Se revisan las ideas que todavía están en juego: ni publicadas ni
// archivadas (la base rechaza revisar esas).
export function isReviewable(piece: Pick<Reviewable, 'status'>): boolean {
  return piece.status !== 'published' && piece.status !== 'archived'
}

// Avance "14/23": cuántas ideas ya tienen decisión sobre el total revisable.
export function reviewProgress(pieces: Reviewable[]): { done: number; total: number } {
  const reviewable = pieces.filter(isReviewable)
  return {
    done: reviewable.filter((piece) => piece.review_status !== 'pending').length,
    total: reviewable.length,
  }
}

export type ReviewGroups<T> = { pending: T[]; changes: T[]; approved: T[]; closed: T[] }

// Primero lo que falta revisar, después lo que espera corrección de Iris y
// al final lo ya revisado. Las publicadas/archivadas quedan aparte.
export function groupForReview<T extends Reviewable>(pieces: T[]): ReviewGroups<T> {
  const groups: ReviewGroups<T> = { pending: [], changes: [], approved: [], closed: [] }
  for (const piece of pieces) {
    if (!isReviewable(piece)) groups.closed.push(piece)
    else if (piece.review_status === 'pending') groups.pending.push(piece)
    else if (piece.review_status === 'changes_requested') groups.changes.push(piece)
    else groups.approved.push(piece)
  }
  return groups
}

// Quién puede decidir en esta planificación. La base vuelve a validar todo
// (review_piece); esto solo evita mostrar botones que no van a funcionar.
export function canDecide(options: { isTeam: boolean; canReview: boolean; planStatus: PlanStatus }): boolean {
  if (!options.canReview) return false
  if (options.isTeam) return true
  return options.planStatus === 'in_review' || options.planStatus === 'reviewed'
}

export function normalizeNote(note: string): string | null {
  const trimmed = note.trim()
  return trimmed === '' ? null : trimmed
}
