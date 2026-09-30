// Marcar como Publicada (paso 6, §3.2): Diseñada/Editada ──► Publicada.
// Lo hace la función mark_published() de la base, que valida permiso
// (has_perm 'can_mark_published': el equipo de Iris o quien tenga el permiso
// extra, como Julieta) y que la pieza esté Diseñada/Editada. Solo cambia
// status y published_at.

import type { PieceStatus } from './pieces'

export function canShowPublish(status: PieceStatus, canMarkPublished: boolean): boolean {
  return canMarkPublished && status === 'done'
}

// Mensajes para los errores de mark_published (códigos de la función).
export function publishErrorMessage(error: { code?: string } | null | undefined): string {
  switch (error?.code) {
    case '42501':
      return 'No tenés permiso para marcar piezas como publicadas.'
    case 'P0002':
      return 'No encontramos esta pieza o no tenés acceso.'
    case '22023':
      return 'No se pudo publicar: la pieza ya no está Diseñada/Editada (puede que otra persona la haya publicado o cambiado). Recargamos la pieza.'
    default:
      return 'No se pudo marcar como publicada. Revisá tu conexión e intentá de nuevo.'
  }
}
