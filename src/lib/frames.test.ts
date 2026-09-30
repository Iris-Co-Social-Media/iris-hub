import { describe, expect, it } from 'vitest'
import { frameForm, framePayload, moveFrame, nextPosition, renumber } from './frames'

describe('formulario de pantalla', () => {
  it('ida y vuelta de una interacción de quiz', () => {
    const values = frameForm({
      label: 'Portada',
      headline: 'Hola',
      body: null,
      visual_direction: null,
      closing: null,
      interaction: { type: 'quiz', question: '¿Cuál?', options: ['A', 'B'], correct_index: 1 },
    })
    expect(values.interaction_options).toBe('A\nB')
    expect(framePayload(values)).toEqual({
      label: 'Portada',
      headline: 'Hola',
      body: null,
      visual_direction: null,
      closing: null,
      interaction: { type: 'quiz', question: '¿Cuál?', options: ['A', 'B'], correct_index: 1 },
    })
  })

  it('sin interacción guarda null', () => {
    expect(framePayload(frameForm()).interaction).toBeNull()
  })

  it('la respuesta correcta solo aplica a quiz y si existe la opción', () => {
    const poll = { ...frameForm(), interaction_type: 'poll' as const, interaction_options: 'Sí\nNo', interaction_correct: '0' }
    expect(framePayload(poll).interaction).toEqual({ type: 'poll', options: ['Sí', 'No'] })
    const quiz = { ...poll, interaction_type: 'quiz' as const, interaction_correct: '5' }
    expect(framePayload(quiz).interaction).toEqual({ type: 'quiz', options: ['Sí', 'No'] })
  })
})

describe('orden de las pantallas', () => {
  const frames = [
    { id: 'a', position: 1 },
    { id: 'b', position: 2 },
    { id: 'c', position: 3 },
  ]

  it('la nueva va al final', () => {
    expect(nextPosition(frames)).toBe(4)
    expect(nextPosition([])).toBe(1)
  })

  it('subir y bajar intercambian posiciones', () => {
    expect(moveFrame(frames, 'b', -1)).toEqual([
      { id: 'b', position: 1 },
      { id: 'a', position: 2 },
    ])
    expect(moveFrame(frames, 'c', 1)).toEqual([])
    expect(moveFrame(frames, 'a', -1)).toEqual([])
  })

  it('al quitar una, las siguientes se renumeran sin huecos', () => {
    expect(renumber([{ id: 'a', position: 1 }, { id: 'c', position: 3 }])).toEqual([{ id: 'c', position: 2 }])
  })
})
