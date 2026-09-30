import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { AppLayout } from '../../components/AppLayout'
import { addMonths, capitalizeFirst, currentMonthKey, dayLabel, isMonthKey, monthLabel, type MonthKey } from '../../lib/dates'
import { computeQuota, PLAN_STATUS_LABELS, sortPieces, type PieceSummary } from '../../lib/pieces'
import { reviewProgress } from '../../lib/review'
import { MonthCalendar } from './MonthCalendar'
import { PieceList } from './PieceList'
import { QuotaSummary } from './QuotaSummary'
import { useClient, useIsTeam, useMonth, usePillars } from './useMonthData'

type View = 'calendario' | 'lista'

// Pantalla "Mes" de un cliente (docs/ARQUITECTURA.md §4): calendario + lista
// + avance de cuota, con navegación entre meses. Solo lectura por ahora.
// Dirección: /:slug/mes/:mes   (por ejemplo /eia/mes/2026-10)
export function MesPage() {
  const { slug = '', month } = useParams()
  if (!isMonthKey(month)) {
    return <Navigate to={`/${slug}/mes/${currentMonthKey()}`} replace />
  }
  return <MonthScreen slug={slug} month={month} />
}

function MonthScreen({ slug, month }: { slug: string; month: MonthKey }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const view: View = searchParams.get('vista') === 'lista' || (!searchParams.get('vista') && prefersList())
    ? 'lista'
    : 'calendario'
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const client = useClient(slug)
  const isTeam = useIsTeam()
  const pillars = usePillars(client.data?.id)
  const monthData = useMonth(client.data?.id, month)

  const pieces = useMemo(() => sortPieces(monthData.data?.pieces ?? []), [monthData.data])
  const pillarNames = useMemo(
    () => new Map((pillars.data ?? []).map((pillar) => [pillar.id, pillar.name])),
    [pillars.data],
  )
  const piecesByDay = useMemo(() => {
    const map = new Map<string, PieceSummary[]>()
    for (const piece of pieces) {
      if (!piece.estimated_date) continue
      map.set(piece.estimated_date, [...(map.get(piece.estimated_date) ?? []), piece])
    }
    return map
  }, [pieces])
  const undated = pieces.filter((piece) => !piece.estimated_date || !piece.estimated_date.startsWith(month))

  function setView(next: View) {
    const params = new URLSearchParams(searchParams)
    params.set('vista', next)
    setSearchParams(params, { replace: true })
  }

  if (client.isPending) return <AppLayout><Message>Cargando…</Message></AppLayout>
  if (client.isError) {
    return <AppLayout><Message>No pudimos cargar los datos. Revisá tu conexión y recargá la página.</Message></AppLayout>
  }
  if (!client.data) {
    return (
      <AppLayout>
        <Message>
          No encontramos este cliente o no tenés acceso.{' '}
          <Link to="/" className="font-bold underline">Volver al inicio</Link>
        </Message>
      </AppLayout>
    )
  }

  const quota = computeQuota(pieces, client.data.quota_posts, client.data.quota_stories)
  const review = reviewProgress(pieces)
  const plan = monthData.data?.plan ?? null
  const primary = client.data.brand_colors?.primary ?? '#421869'
  const monthPath = (key: MonthKey) => `/${slug}/mes/${key}${searchParams.toString() ? `?${searchParams}` : ''}`

  return (
    <AppLayout>
      {/* Espacio del cliente: su nombre y su color principal (§4, Anexo C) */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
          style={{ backgroundColor: primary }}
        >
          {client.data.name.slice(0, 3).toUpperCase()}
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-iris-violet/70">Cliente</p>
          <h1 className="text-xl font-extrabold sm:text-2xl">{client.data.name}</h1>
        </div>
      </div>

      {/* Navegación entre meses */}
      <nav aria-label="Cambiar de mes" className="mt-5 flex items-center justify-between gap-2">
        <Link
          to={monthPath(addMonths(month, -1))}
          className="rounded-xl border border-iris-lavender bg-white px-3 py-2 text-sm font-bold"
          aria-label={`Mes anterior: ${monthLabel(addMonths(month, -1))}`}
        >
          ‹ <span className="hidden sm:inline">{monthLabel(addMonths(month, -1))}</span>
        </Link>
        <div className="text-center">
          <h2 className="text-lg font-extrabold sm:text-xl">{capitalizeFirst(monthLabel(month))}</h2>
          {month !== currentMonthKey() && (
            <Link to={monthPath(currentMonthKey())} className="text-xs font-semibold underline">
              Ir al mes actual
            </Link>
          )}
        </div>
        <Link
          to={monthPath(addMonths(month, 1))}
          className="rounded-xl border border-iris-lavender bg-white px-3 py-2 text-sm font-bold"
          aria-label={`Mes siguiente: ${monthLabel(addMonths(month, 1))}`}
        >
          <span className="hidden sm:inline">{monthLabel(addMonths(month, 1))}</span> ›
        </Link>
      </nav>

      {monthData.isPending ? (
        <Message>Cargando la planificación…</Message>
      ) : monthData.isError ? (
        <Message>No pudimos cargar la planificación. Revisá tu conexión y recargá la página.</Message>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {plan ? (
                <>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold ring-1 ring-iris-lavender">
                    {PLAN_STATUS_LABELS[plan.status]}
                  </span>
                  <Link
                    to={`/${slug}/revision/${month}`}
                    className="rounded-xl bg-iris-violet px-3 py-1.5 font-bold text-white"
                  >
                    Revisión {review.done}/{review.total} ›
                  </Link>
                </>
              ) : (
                <span className="text-iris-violet/70">Sin planificación</span>
              )}
            </div>
            <div role="tablist" aria-label="Vista" className="inline-flex rounded-xl bg-white p-1 ring-1 ring-iris-lavender">
              {(['calendario', 'lista'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={view === option}
                  onClick={() => setView(option)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold capitalize ${
                    view === option ? 'bg-iris-violet text-white' : ''
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <QuotaSummary quota={quota} />
          </div>

          {!plan ? (
            <EmptyPlan isTeam={isTeam.data ?? false} month={month} />
          ) : pieces.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white p-6 text-center ring-1 ring-iris-lilac">
              <p className="font-bold">La planificación de {monthLabel(month)} todavía no tiene piezas.</p>
            </div>
          ) : view === 'lista' ? (
            <div className="mt-4">
              <PieceList slug={slug} pieces={pieces} pillarNames={pillarNames} />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <MonthCalendar
                month={month}
                piecesByDay={piecesByDay}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
              {selectedDay && (
                <section aria-label={`Piezas del ${dayLabel(selectedDay)}`}>
                  <h3 className="mb-2 text-sm font-extrabold">{capitalizeFirst(dayLabel(selectedDay))}</h3>
                  {piecesByDay.get(selectedDay)?.length ? (
                    <PieceList slug={slug} pieces={piecesByDay.get(selectedDay)!} pillarNames={pillarNames} showDate={false} />
                  ) : (
                    <p className="text-sm text-iris-violet/70">No hay piezas este día.</p>
                  )}
                </section>
              )}
              {undated.length > 0 && (
                <section aria-label="Piezas sin fecha en este mes">
                  <h3 className="mb-2 text-sm font-extrabold">Sin fecha en {monthLabel(month)}</h3>
                  <PieceList slug={slug} pieces={undated} pillarNames={pillarNames} />
                </section>
              )}
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}

function EmptyPlan({ isTeam, month }: { isTeam: boolean; month: MonthKey }) {
  return (
    <div className="mt-4 rounded-2xl bg-white p-6 text-center ring-1 ring-iris-lilac">
      {isTeam ? (
        <p className="font-bold">Todavía no hay planificación de {monthLabel(month)}.</p>
      ) : (
        <>
          <p className="font-bold">Todavía no hay una planificación de {monthLabel(month)} para revisar.</p>
          <p className="mt-1 text-sm text-iris-violet/70">
            Cuando Iris &amp; Co la envíe a revisión, va a aparecer acá.
          </p>
        </>
      )}
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p className="mt-6 rounded-2xl bg-white p-6 text-center text-sm ring-1 ring-iris-lilac">{children}</p>
}

// En pantallas chicas arranca en la lista, que se lee mejor en el celular.
function prefersList(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches
}
