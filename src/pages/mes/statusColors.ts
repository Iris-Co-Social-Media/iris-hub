import type { PieceStatus } from '../../lib/pieces'

// Punto de color para el calendario en el celular.
export const STATUS_DOT: Record<PieceStatus, string> = {
  todo: 'bg-iris-lavender',
  awaiting_recording: 'bg-iris-lavender',
  recorded: 'bg-iris-lavender',
  done: 'bg-iris-lime ring-1 ring-iris-violet/30',
  published: 'bg-iris-violet',
  archived: 'bg-iris-lilac',
}
