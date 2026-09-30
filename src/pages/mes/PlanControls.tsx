import { useState } from 'react'
import { monthLabel, type MonthKey } from '../../lib/dates'
import type { MonthlyPlan } from '../../lib/pieces'
import { availablePlanActions, canCreatePlan, type PlanAction } from '../../lib/planStatus'
import { useChangePlanStatus, useCreatePlan } from './useMonthData'

// Crear la planificación del mes (solo el equipo de Iris).
export function CreatePlanButton({ clientId, month, isTeam }: { clientId: string; month: MonthKey; isTeam: boolean }) {
  const create = useCreatePlan()
  if (!canCreatePlan(isTeam, false)) return null
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => create.mutate({ clientId, month })}
        disabled={create.isPending}
        className="w-full rounded-xl bg-iris-violet px-4 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
      >
        {create.isPending ? 'Creando…' : `Crear planificación de ${monthLabel(month)}`}
      </button>
      <p className="mt-2 text-xs text-iris-violet/70">Se crea como borrador: el cliente no la ve hasta que la envíes a revisión.</p>
      {create.error && (
        <p role="alert" className="mt-2 rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {create.error.message}
        </p>
      )}
    </div>
  )
}

// Acciones sobre el estado de la planificación, con confirmación en pantalla.
export function PlanStatusActions({ plan, isTeam }: { plan: MonthlyPlan; isTeam: boolean }) {
  const change = useChangePlanStatus()
  const [confirming, setConfirming] = useState<PlanAction | null>(null)
  const actions = availablePlanActions(plan.status, isTeam)
  if (actions.length === 0) return null

  if (confirming) {
    return (
      <div role="dialog" aria-label={confirming.label} className="mt-3 w-full rounded-2xl bg-white p-4 ring-1 ring-iris-violet">
        <p className="text-sm font-bold">¿{confirming.label}?</p>
        <p className="mt-1 text-sm">{confirming.confirm}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              change.mutate({ plan, action: confirming.key }, { onSettled: () => setConfirming(null) })
            }
            disabled={change.isPending}
            className="rounded-xl bg-iris-violet px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {change.isPending ? 'Guardando…' : `Sí, ${confirming.label.toLowerCase()}`}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            disabled={change.isPending}
            className="rounded-xl border border-iris-lavender bg-white px-4 py-3 text-sm font-bold"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => {
            change.reset()
            setConfirming(action)
          }}
          className={`rounded-xl px-3 py-1.5 font-bold ${
            action.key === 'send_for_review'
              ? 'bg-iris-lime text-iris-violet ring-1 ring-iris-violet/20'
              : 'border border-iris-lavender bg-white'
          }`}
        >
          {action.label}
        </button>
      ))}
      {change.error && (
        <p role="alert" className="w-full rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {change.error.message}
        </p>
      )}
    </>
  )
}
