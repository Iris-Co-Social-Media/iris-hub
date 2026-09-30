import { describe, expect, it } from 'vitest'
import { canDecide, groupForReview, normalizeNote, reviewProgress } from './review'
import type { PieceStatus, ReviewStatus } from './pieces'

const p = (status: PieceStatus, review_status: ReviewStatus, id = '') => ({ id, status, review_status })

describe('avance de la revisión', () => {
  it('cuenta revisadas y con cambios pedidos sobre el total revisable', () => {
    const pieces = [p('todo', 'approved'), p('todo', 'changes_requested'), p('done', 'pending'), p('todo', 'pending')]
    expect(reviewProgress(pieces)).toEqual({ done: 2, total: 4 })
  })

  it('no cuenta publicadas ni archivadas', () => {
    expect(reviewProgress([p('published', 'pending'), p('archived', 'approved'), p('todo', 'pending')])).toEqual({
      done: 0,
      total: 1,
    })
  })
})

describe('grupos de revisión', () => {
  it('separa pendientes, cambios pedidos, revisadas y cerradas', () => {
    const groups = groupForReview([
      p('todo', 'pending', 'a'),
      p('todo', 'changes_requested', 'b'),
      p('done', 'approved', 'c'),
      p('published', 'approved', 'd'),
    ])
    expect(groups.pending.map((x) => x.id)).toEqual(['a'])
    expect(groups.changes.map((x) => x.id)).toEqual(['b'])
    expect(groups.approved.map((x) => x.id)).toEqual(['c'])
    expect(groups.closed.map((x) => x.id)).toEqual(['d'])
  })
})

describe('quién puede decidir', () => {
  it('el cliente solo en planificaciones enviadas o en revisión completa', () => {
    expect(canDecide({ isTeam: false, canReview: true, planStatus: 'in_review' })).toBe(true)
    expect(canDecide({ isTeam: false, canReview: true, planStatus: 'reviewed' })).toBe(true)
    expect(canDecide({ isTeam: false, canReview: true, planStatus: 'closed' })).toBe(false)
  })

  it('sin permiso de revisar, nadie decide', () => {
    expect(canDecide({ isTeam: false, canReview: false, planStatus: 'in_review' })).toBe(false)
  })

  it('el equipo puede revisar en cualquier estado', () => {
    expect(canDecide({ isTeam: true, canReview: true, planStatus: 'draft' })).toBe(true)
  })
})

describe('nota de cambios', () => {
  it('una nota vacía no cuenta', () => {
    expect(normalizeNote('   ')).toBeNull()
    expect(normalizeNote(' Cambiar la foto ')).toBe('Cambiar la foto')
  })
})
