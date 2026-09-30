// Estados de la planificación mensual (docs/ARQUITECTURA.md §3.1):
//   Borrador ──► Enviada a revisión ──► Revisión completa ──► Cerrada
// En la V1-alpha (§13, paso 5b) el equipo solo mueve Borrador ↔ Enviada a
// revisión. "Revisión completa" y "Cerrada" (que traslada lo pendiente) son
// de la V1-beta. Estos cambios nunca tocan la revisión de las piezas.

import type { PlanStatus } from './pieces'

export type PlanActionKey = 'send_for_review' | 'back_to_draft'

export type PlanAction = {
  key: PlanActionKey
  label: string
  from: PlanStatus[] // estados desde los que se puede
  to: PlanStatus
  confirm: string // qué pasa, en lenguaje simple
}

export const PLAN_ACTIONS: Record<PlanActionKey, PlanAction> = {
  send_for_review: {
    key: 'send_for_review',
    label: 'Enviar a revisión',
    from: ['draft'],
    to: 'in_review',
    confirm:
      'Las personas del cliente van a poder ver esta planificación y revisar sus ideas. Por ahora no se envía mail de aviso.',
  },
  back_to_draft: {
    key: 'back_to_draft',
    label: 'Volver a borrador',
    from: ['in_review', 'reviewed'],
    to: 'draft',
    confirm:
      'El cliente deja de ver esta planificación hasta que la vuelvas a enviar. Las revisiones que ya hizo se conservan.',
  },
}

// Solo el equipo de Iris gestiona planificaciones (RLS igual lo impide).
export function availablePlanActions(status: PlanStatus, isTeam: boolean): PlanAction[] {
  if (!isTeam) return []
  return Object.values(PLAN_ACTIONS).filter((action) => action.from.includes(status))
}

export function canCreatePlan(isTeam: boolean, planExists: boolean): boolean {
  return isTeam && !planExists
}

// Qué se guarda en monthly_plans para cada acción.
export function planUpdate(
  action: PlanActionKey,
  now: Date = new Date(),
): { status: PlanStatus; sent_for_review_at: string | null } {
  if (action === 'send_for_review') {
    return { status: 'in_review', sent_for_review_at: now.toISOString() }
  }
  // Al volver a borrador deja de estar "enviada": se limpia la fecha y se
  // completa de nuevo cuando se vuelva a enviar.
  return { status: 'draft', sent_for_review_at: null }
}
