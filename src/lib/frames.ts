// Pantallas / láminas de una pieza (piece_frames, §6.2).
// La interacción se guarda como {type, question, options[], correct_index}.

import type { FrameInteraction, InteractionType } from './pieces'

export type FrameFormValues = {
  label: string
  headline: string
  body: string
  visual_direction: string
  closing: string
  interaction_type: InteractionType
  interaction_question: string
  interaction_options: string // una opción por línea
  interaction_correct: string // índice (0, 1, …) o ''
}

export function frameForm(frame?: {
  label: string | null
  headline: string | null
  body: string | null
  visual_direction: string | null
  closing: string | null
  interaction: FrameInteraction | null
}): FrameFormValues {
  const interaction = frame?.interaction ?? null
  const type = (interaction?.type as InteractionType | undefined) ?? 'none'
  return {
    label: frame?.label ?? '',
    headline: frame?.headline ?? '',
    body: frame?.body ?? '',
    visual_direction: frame?.visual_direction ?? '',
    closing: frame?.closing ?? '',
    interaction_type: ['poll', 'quiz', 'question', 'slider'].includes(type) ? type : 'none',
    interaction_question: interaction?.question ?? '',
    interaction_options: Array.isArray(interaction?.options) ? interaction.options.map(String).join('\n') : '',
    interaction_correct:
      typeof interaction?.correct_index === 'number' ? String(interaction.correct_index) : '',
  }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

export function interactionFromForm(values: FrameFormValues): FrameInteraction | null {
  if (values.interaction_type === 'none') return null
  const options = values.interaction_options
    .split('\n')
    .map((option) => option.trim())
    .filter(Boolean)
  const result: FrameInteraction = { type: values.interaction_type }
  if (values.interaction_question.trim()) result.question = values.interaction_question.trim()
  if (options.length) result.options = options
  const correct = Number.parseInt(values.interaction_correct, 10)
  if (values.interaction_type === 'quiz' && Number.isInteger(correct) && correct >= 0 && correct < options.length) {
    result.correct_index = correct
  }
  return result
}

export function framePayload(values: FrameFormValues) {
  return {
    label: orNull(values.label),
    headline: orNull(values.headline),
    body: orNull(values.body),
    visual_direction: orNull(values.visual_direction),
    closing: orNull(values.closing),
    interaction: interactionFromForm(values),
  }
}

type Positioned = { id: string; position: number }

export function nextPosition(frames: Positioned[]): number {
  return frames.reduce((max, frame) => Math.max(max, frame.position), 0) + 1
}

// Cambios de posición para que queden 1, 2, 3… sin huecos, en el orden actual.
export function renumber(frames: Positioned[]): { id: string; position: number }[] {
  return [...frames]
    .sort((a, b) => a.position - b.position)
    .map((frame, index) => ({ id: frame.id, position: index + 1 }))
    .filter((change) => frames.find((frame) => frame.id === change.id)!.position !== change.position)
}

// Cambios de posición para subir (-1) o bajar (+1) una pantalla.
export function moveFrame(frames: Positioned[], id: string, direction: -1 | 1): { id: string; position: number }[] {
  const ordered = [...frames].sort((a, b) => a.position - b.position)
  const index = ordered.findIndex((frame) => frame.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ordered.length) return []
  const swapped = [...ordered]
  ;[swapped[index], swapped[target]] = [swapped[target], swapped[index]]
  return swapped
    .map((frame, i) => ({ id: frame.id, position: i + 1 }))
    .filter((change) => ordered.find((frame) => frame.id === change.id)!.position !== change.position)
}
