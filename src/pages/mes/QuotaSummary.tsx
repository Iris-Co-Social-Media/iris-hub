import type { QuotaLine, QuotaSummary as Quota } from '../../lib/pieces'

// Avance de la cuota del mes (§3.1): lo planificado contra la cuota del plan,
// con las piezas trasladadas descontadas.
export function QuotaSummary({ quota }: { quota: Quota }) {
  return (
    <section aria-label="Cuota del mes" className="grid grid-cols-2 gap-3">
      <QuotaCard title="Posteos" hint="Posts, carruseles y reels" line={quota.posts} />
      <QuotaCard title="Historias" line={quota.stories} />
    </section>
  )
}

function QuotaCard({ title, hint, line }: { title: string; hint?: string; line: QuotaLine }) {
  const percent = line.quota > 0 ? Math.min(100, Math.round((line.planned / line.quota) * 100)) : 0
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
      <p className="text-sm font-bold">{title}</p>
      {hint && <p className="text-xs text-iris-violet/60">{hint}</p>}
      <p className="mt-2 text-2xl font-extrabold">
        {line.planned}
        <span className="text-base font-bold text-iris-violet/60"> / {line.quota}</span>
      </p>
      <div
        className="mt-2 h-2 rounded-full bg-iris-lilac"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={line.quota}
        aria-valuenow={line.planned}
        aria-label={`${title}: ${line.planned} de ${line.quota}`}
      >
        <div className="h-2 rounded-full bg-iris-violet" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs">
        {line.missing > 0 ? `Faltan ${line.missing}` : 'Cuota completa'}
        {line.carried > 0 && ` · ${line.carried} trasladada${line.carried === 1 ? '' : 's'}`}
      </p>
    </div>
  )
}
