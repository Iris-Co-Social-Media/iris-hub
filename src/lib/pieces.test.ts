import { describe, expect, it } from 'vitest'
import { computeQuota, sortPieces, statusLabel, type PieceSummary } from './pieces'

type QuotaPiece = Pick<PieceSummary, 'format' | 'status' | 'times_carried_over'>
const piece = (format: QuotaPiece['format'], extra: Partial<QuotaPiece> = {}): QuotaPiece => ({
  format,
  status: 'todo',
  times_carried_over: 0,
  ...extra,
})

describe('cuota del mes', () => {
  it('sin piezas falta toda la cuota', () => {
    expect(computeQuota([], 8, 15)).toEqual({
      posts: { quota: 8, planned: 0, carried: 0, missing: 8 },
      stories: { quota: 15, planned: 0, carried: 0, missing: 15 },
    })
  })

  it('un reel trasladado descuenta un posteo (ejemplo de §3.1)', () => {
    const quota = computeQuota([piece('reel', { times_carried_over: 1 })], 8, 15)
    expect(quota.posts).toEqual({ quota: 8, planned: 1, carried: 1, missing: 7 })
    expect(quota.stories.missing).toBe(15)
  })

  it('historias van a su cuota; posts, carruseles y reels a posteos', () => {
    const quota = computeQuota([piece('story'), piece('post'), piece('carousel'), piece('reel')], 8, 15)
    expect(quota.posts.planned).toBe(3)
    expect(quota.stories.planned).toBe(1)
  })

  it('las archivadas no cuentan', () => {
    const quota = computeQuota([piece('post', { status: 'archived' })], 8, 15)
    expect(quota.posts.planned).toBe(0)
  })

  it('si se pasa de la cuota, no falta nada (nunca negativo)', () => {
    const quota = computeQuota(Array.from({ length: 10 }, () => piece('post')), 8, 15)
    expect(quota.posts.missing).toBe(0)
    expect(quota.posts.planned).toBe(10)
  })
})

describe('etiquetas y orden', () => {
  it('Diseñada para posts, Editada para reels', () => {
    expect(statusLabel('done', 'post')).toBe('Diseñada')
    expect(statusLabel('done', 'reel')).toBe('Editada')
    expect(statusLabel('awaiting_recording', 'reel')).toBe('Esperando grabación')
  })

  it('ordena por fecha y deja las sin fecha al final', () => {
    const sorted = sortPieces([
      { title: 'B', estimated_date: null },
      { title: 'C', estimated_date: '2026-10-05' },
      { title: 'A', estimated_date: '2026-10-02' },
      { title: 'A2', estimated_date: '2026-10-05' },
    ])
    expect(sorted.map((p) => p.title)).toEqual(['A', 'A2', 'C', 'B'])
  })
})

import { allFramesCopyText, frameCopyText, interactionText, type PieceFrame } from './pieces'

const frame = (extra: Partial<PieceFrame>): PieceFrame => ({
  id: 'f',
  position: 1,
  label: null,
  headline: null,
  body: null,
  visual_direction: null,
  interaction: null,
  closing: null,
  ...extra,
})

describe('textos para copiar', () => {
  it('copia principal, secundario y cierre, sin "Qué mostrar"', () => {
    const text = frameCopyText(
      frame({ headline: 'Título ', body: 'Cuerpo', closing: 'Escribinos', visual_direction: 'Foto de obra' }),
    )
    expect(text).toBe('Título\n\nCuerpo\n\nEscribinos')
  })

  it('una pantalla vacía no copia nada', () => {
    expect(frameCopyText(frame({ headline: '  ' }))).toBe('')
  })

  it('arma la interacción con opciones y la correcta', () => {
    expect(
      interactionText({ type: 'quiz', question: '¿Qué pesa más?', options: ['Hormigón', 'Acero'], correct_index: 1 }),
    ).toBe('Elegí la respuesta correcta: ¿Qué pesa más?\n- Hormigón\n- Acero ✓')
    expect(interactionText(null)).toBe('')
  })

  it('copia todas las pantallas en orden, con su nombre', () => {
    const text = allFramesCopyText([
      frame({ id: 'b', position: 2, headline: 'Segunda' }),
      frame({ id: 'a', position: 1, label: 'Portada', headline: 'Primera' }),
      frame({ id: 'c', position: 3 }),
    ])
    expect(text).toBe('Portada\nPrimera\n\n———\n\nPantalla 2\nSegunda')
  })
})
