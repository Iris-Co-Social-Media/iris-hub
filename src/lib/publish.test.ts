import { describe, expect, it } from 'vitest'
import { canShowPublish, publishErrorMessage } from './publish'

describe('cuándo se muestra "Marcar como publicada"', () => {
  it('solo con permiso y con la pieza Diseñada/Editada', () => {
    expect(canShowPublish('done', true)).toBe(true)
    expect(canShowPublish('done', false)).toBe(false)
  })

  it('nunca en otros estados, ni si ya está publicada', () => {
    for (const status of ['todo', 'awaiting_recording', 'recorded', 'published', 'archived'] as const) {
      expect(canShowPublish(status, true)).toBe(false)
    }
  })
})

describe('errores de mark_published', () => {
  it('traduce cada caso', () => {
    expect(publishErrorMessage({ code: '42501' })).toMatch(/permiso/)
    expect(publishErrorMessage({ code: 'P0002' })).toMatch(/No encontramos/)
    expect(publishErrorMessage({ code: '22023' })).toMatch(/otra persona la haya publicado/)
    expect(publishErrorMessage(null)).toMatch(/conexión/)
  })
})
