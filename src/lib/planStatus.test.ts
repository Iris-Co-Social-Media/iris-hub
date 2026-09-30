import { describe, expect, it } from 'vitest'
import { availablePlanActions, canCreatePlan, planUpdate } from './planStatus'

const keys = (status: Parameters<typeof availablePlanActions>[0], isTeam = true) =>
  availablePlanActions(status, isTeam).map((action) => action.key)

describe('acciones sobre la planificación', () => {
  it('en borrador, el equipo puede enviarla a revisión', () => {
    expect(keys('draft')).toEqual(['send_for_review'])
  })

  it('enviada a revisión, el equipo puede volverla a borrador', () => {
    expect(keys('in_review')).toEqual(['back_to_draft'])
  })

  it('con revisión completa también puede volver a borrador', () => {
    expect(keys('reviewed')).toEqual(['back_to_draft'])
  })

  it('cerrada no tiene acciones en la V1-alpha', () => {
    expect(keys('closed')).toEqual([])
  })

  it('un usuario del cliente nunca tiene acciones', () => {
    for (const status of ['draft', 'in_review', 'reviewed', 'closed'] as const) {
      expect(keys(status, false)).toEqual([])
    }
  })
})

describe('crear planificación', () => {
  it('solo el equipo y solo si el mes todavía no tiene', () => {
    expect(canCreatePlan(true, false)).toBe(true)
    expect(canCreatePlan(true, true)).toBe(false)
    expect(canCreatePlan(false, false)).toBe(false)
  })
})

describe('qué se guarda', () => {
  it('enviar a revisión completa la fecha de envío', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    expect(planUpdate('send_for_review', now)).toEqual({
      status: 'in_review',
      sent_for_review_at: '2026-10-01T12:00:00.000Z',
    })
  })

  it('volver a borrador limpia la fecha de envío', () => {
    expect(planUpdate('back_to_draft')).toEqual({ status: 'draft', sent_for_review_at: null })
  })
})
