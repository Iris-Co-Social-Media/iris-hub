import { describe, expect, it } from 'vitest'
import {
  emptyForm,
  friendlyDbError,
  piecePayload,
  productionMoves,
  productionSteps,
  validatePieceForm,
} from './pieceForm'

describe('validación del formulario de pieza', () => {
  it('pide título', () => {
    expect(validatePieceForm({ ...emptyForm(), title: '   ' }).title).toBe('El título es obligatorio.')
  })

  it('con título y formato alcanza', () => {
    expect(validatePieceForm({ ...emptyForm(), title: 'Idea' })).toEqual({})
  })

  it('los enlaces tienen que ser http(s)', () => {
    const errors = validatePieceForm({ ...emptyForm(), title: 'Idea', canva_url: 'javascript:alert(1)' })
    expect(errors.canva_url).toBeDefined()
    expect(validatePieceForm({ ...emptyForm(), title: 'Idea', canva_url: 'https://canva.com/x' })).toEqual({})
  })

  it('no deja sacar el formato reel si está en un estado de grabación', () => {
    const values = { ...emptyForm(), title: 'Reel', format: 'post' as const }
    expect(validatePieceForm(values, 'awaiting_recording').format).toBeDefined()
    expect(validatePieceForm(values, 'recorded').format).toBeDefined()
    expect(validatePieceForm(values, 'done')).toEqual({})
  })
})

describe('lo que se guarda', () => {
  it('convierte vacíos en null y nunca incluye estados', () => {
    const payload = piecePayload({ ...emptyForm(), title: '  Idea  ', objective: 'leads' })
    expect(payload.title).toBe('Idea')
    expect(payload.estimated_date).toBeNull()
    expect(payload.pillar_id).toBeNull()
    expect(payload.objective).toBe('leads')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('review_status')
    expect(payload).not.toHaveProperty('review_note')
  })
})

describe('estado de producción', () => {
  it('reels tienen los pasos de grabación; el resto no', () => {
    expect(productionSteps('reel')).toEqual(['todo', 'awaiting_recording', 'recorded', 'done'])
    expect(productionSteps('carousel')).toEqual(['todo', 'done'])
  })

  it('ofrece los otros pasos y archivar; nunca Publicada', () => {
    const moves = productionMoves('post', 'todo')
    expect(moves).toEqual([
      { to: 'done', kind: 'step' },
      { to: 'archived', kind: 'archive' },
    ])
    expect(productionMoves('reel', 'recorded').map((m) => m.to)).toEqual(['todo', 'awaiting_recording', 'done', 'archived'])
    expect(productionMoves('reel', 'todo').some((m) => m.to === 'published')).toBe(false)
  })

  it('una archivada solo se puede desarchivar (vuelve a Por hacer)', () => {
    expect(productionMoves('post', 'archived')).toEqual([{ to: 'todo', kind: 'restore' }])
  })

  it('una publicada no se toca acá (paso 6)', () => {
    expect(productionMoves('post', 'published')).toEqual([])
  })
})

describe('errores de la base', () => {
  it('traduce los códigos más comunes', () => {
    expect(friendlyDbError({ code: '42501' })).toMatch(/permiso/)
    expect(friendlyDbError({ code: '23503' })).toMatch(/no corresponde a este cliente/)
    expect(friendlyDbError(null)).toMatch(/conexión/)
  })
})
