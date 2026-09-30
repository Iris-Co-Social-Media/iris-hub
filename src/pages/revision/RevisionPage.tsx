import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { AppLayout } from '../../components/AppLayout'
import { addMonths, capitalizeFirst, currentMonthKey, dayLabel, isMonthKey, monthLabel, type MonthKey } from '../../lib/dates'
import { PLAN_STATUS_LABELS, sortPieces, type PieceFrame } from '../../lib/pieces'
import { canDecide, groupForReview, normalizeNote, reviewProgress } from '../../lib/review'
import { FormatBadge, ReviewBadge, StatusBadge } from '../mes/PieceBadges'
import { useClient, useIsTeam, usePillars } from '../mes/useMonthData'
import { useDecide, useMarkCorrected, useReview, type ReviewPiece } from './useReviewData'

// Pantalla "Revisión" (docs/ARQUITECTURA.md §3.2 y §4): lo que ve Jonathan.
// Ideas pendientes primero y avance "14/23". Cada decisión se guarda al
// instante, así se puede dejar por la mitad y retomar después.
// Dirección: /:slug/revision/:mes   (por ejemplo /eia/revision/2026-10)
export function RevisionPage() {
  const { slug = '', month } = useParams()
  if (!isMonthKey(month)) {
    return <Navigate to={`/${slug}/revision/${currentMonthKey()}`} replace />
  }
  return <ReviewScreen slug={slug} month={month} />
}

function ReviewScreen({ slug, month }: { slug: string; month: MonthKey }) {
  const client = useClient(slug)
  const isTeam = useIsTeam()
  const pillars = usePillars(client.data?.id)
  const review = useReview(client.data?.id, month)

  const pillarNames = useMemo(
    () => new Map((pillars.data ?? []).map((pillar) => [pillar.id, pillar.name])),
    [pillars.data],
  )
  const groups = useMemo(() => groupForReview(sortPieces(review.data?.pieces ?? [])), [review.data])

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

  const plan = review.data?.plan ?? null
  const team = isTeam.data ?? false
  const decide = plan
    ? canDecide({ isTeam: team, canReview: review.data?.canReview ?? false, planStatus: plan.status })
    : false
  const progress = reviewProgress(review.data?.pieces ?? [])
  const primary = client.data.brand_colors?.primary ?? '#421869'

  return (
    <AppLayout>
      <Link
        to={`/${slug}/mes/${month}`}
        className="inline-flex items-center gap-1 rounded-xl border border-iris-lavender bg-white px-3 py-2 text-sm font-bold"
      >
        ‹ Volver a la planificación
      </Link>

      <div className="mx-auto max-w-3xl">
        <div className="mt-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
            style={{ backgroundColor: primary }}
          >
            {client.data.name.slice(0, 3).toUpperCase()}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-iris-violet/70">
              Revisión · {client.data.name}
            </p>
            <h1 className="text-xl font-extrabold sm:text-2xl">{capitalizeFirst(monthLabel(month))}</h1>
          </div>
        </div>

        <nav aria-label="Cambiar de mes" className="mt-4 flex justify-between gap-2 text-sm font-bold">
          <Link to={`/${slug}/revision/${addMonths(month, -1)}`} className="rounded-xl border border-iris-lavender bg-white px-3 py-2">
            ‹ {monthLabel(addMonths(month, -1))}
          </Link>
          <Link to={`/${slug}/revision/${addMonths(month, 1)}`} className="rounded-xl border border-iris-lavender bg-white px-3 py-2">
            {monthLabel(addMonths(month, 1))} ›
          </Link>
        </nav>

        {review.isPending ? (
          <Message>Cargando la revisión…</Message>
        ) : review.isError ? (
          <Message>No pudimos cargar la revisión. Revisá tu conexión y recargá la página.</Message>
        ) : !plan ? (
          <Message>
            {team
              ? `Todavía no hay planificación de ${monthLabel(month)}.`
              : `Todavía no hay una planificación de ${monthLabel(month)} para revisar. Cuando Iris & Co la envíe a revisión, va a aparecer acá.`}
          </Message>
        ) : (
          <>
            {/* Avance "14/23" */}
            <section aria-label="Avance de la revisión" className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold">
                  <span className="text-3xl font-extrabold">{progress.done}</span>
                  <span className="text-iris-violet/60"> / {progress.total}</span> ideas revisadas
                </p>
                <span className="rounded-full bg-iris-cream px-3 py-1 text-xs font-semibold ring-1 ring-iris-lavender">
                  {PLAN_STATUS_LABELS[plan.status]}
                </span>
              </div>
              <div
                className="mt-3 h-2 rounded-full bg-iris-lilac"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label={`${progress.done} de ${progress.total} ideas revisadas`}
              >
                <div
                  className="h-2 rounded-full bg-iris-violet"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              {progress.total > 0 && progress.done === progress.total && (
                <p className="mt-2 text-sm font-bold">¡Listo! Todas las ideas tienen revisión.</p>
              )}
              {!decide && <p className="mt-2 text-sm text-iris-violet/80">{readOnlyReason(review.data?.canReview ?? false)}</p>}
            </section>

            {review.data!.pieces.length === 0 ? (
              <Message>La planificación de {monthLabel(month)} todavía no tiene piezas.</Message>
            ) : (
              <>
                <Group title="Por revisar" empty="No quedan ideas por revisar." pieces={groups.pending}>
                  {(piece) => <ReviewCard key={piece.id} {...cardProps(piece)} />}
                </Group>
                <Group title="Cambios pedidos" pieces={groups.changes}>
                  {(piece) => <ReviewCard key={piece.id} {...cardProps(piece)} />}
                </Group>
                <Group title="Revisadas" pieces={groups.approved}>
                  {(piece) => <ReviewCard key={piece.id} {...cardProps(piece)} />}
                </Group>
                <Group title="Publicadas o archivadas" pieces={groups.closed}>
                  {(piece) => <ReviewCard key={piece.id} {...cardProps(piece)} />}
                </Group>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )

  function cardProps(piece: ReviewPiece) {
    return {
      slug,
      piece,
      frames: review.data?.frames.get(piece.id) ?? [],
      pillarName: piece.pillar_id ? (pillarNames.get(piece.pillar_id) ?? null) : null,
      canDecide: decide,
      isTeam: team,
    }
  }
}

function readOnlyReason(canReview: boolean): string {
  return canReview
    ? 'Esta planificación no está abierta para revisión. Podés verla, pero no cambiar las decisiones.'
    : 'Podés ver la revisión, pero tu usuario no tiene permiso para revisar.'
}

function Group({
  title,
  pieces,
  empty,
  children,
}: {
  title: string
  pieces: ReviewPiece[]
  empty?: string
  children: (piece: ReviewPiece) => ReactNode
}) {
  if (pieces.length === 0 && !empty) return null
  return (
    <section aria-label={title} className="mt-6">
      <h2 className="text-lg font-extrabold">
        {title} <span className="text-iris-violet/60">({pieces.length})</span>
      </h2>
      {pieces.length === 0 ? (
        <p className="mt-2 text-sm text-iris-violet/70">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">{pieces.map(children)}</ul>
      )}
    </section>
  )
}

function ReviewCard({
  slug,
  piece,
  frames,
  pillarName,
  canDecide,
  isTeam,
}: {
  slug: string
  piece: ReviewPiece
  frames: PieceFrame[]
  pillarName: string | null
  canDecide: boolean
  isTeam: boolean
}) {
  const decideMutation = useDecide()
  const correctedMutation = useMarkCorrected()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)

  const busy = decideMutation.isPending || correctedMutation.isPending
  const error = decideMutation.error?.message ?? correctedMutation.error?.message ?? null
  const open = piece.status !== 'published' && piece.status !== 'archived'

  function approve() {
    decideMutation.mutate({ pieceId: piece.id, decision: 'approved', note: null })
  }

  function submitChanges() {
    const clean = normalizeNote(note)
    if (!clean) {
      setNoteError('Contanos qué hay que cambiar.')
      return
    }
    setNoteError(null)
    decideMutation.mutate(
      { pieceId: piece.id, decision: 'changes_requested', note: clean },
      {
        onSuccess: () => {
          setAsking(false)
          setNote('')
        },
      },
    )
  }

  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link to={`/${slug}/pieza/${piece.id}`} className="font-bold underline-offset-2 hover:underline">
          {piece.title}
        </Link>
        <span className="text-xs font-semibold text-iris-violet/70">
          {piece.estimated_date ? dayLabel(piece.estimated_date) : 'Sin fecha'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <FormatBadge format={piece.format} />
        <ReviewBadge review={piece.review_status} />
        <StatusBadge status={piece.status} format={piece.format} />
        {pillarName && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-iris-violet/80 ring-1 ring-iris-lilac">
            {pillarName}
          </span>
        )}
      </div>

      {piece.review_note && (
        <div
          className={`mt-3 rounded-xl p-3 text-sm ${
            piece.review_status === 'changes_requested' ? 'bg-iris-violet/10 ring-1 ring-iris-violet' : 'bg-iris-cream'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide">
            {piece.review_status === 'changes_requested'
              ? 'Cambios pedidos'
              : piece.review_status === 'pending'
                ? 'Se había pedido (ya corregido)'
                : 'Nota'}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{piece.review_note}</p>
        </div>
      )}

      {frames.length > 0 && (
        <details className="mt-3 rounded-xl bg-iris-cream p-3">
          <summary className="cursor-pointer text-sm font-bold">
            Ver {piece.format === 'carousel' ? 'láminas' : 'pantallas'} ({frames.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {frames.map((frame) => (
              <li key={frame.id} className="text-sm">
                <p className="text-xs font-bold text-iris-violet/70">
                  {frame.position}. {frame.label?.trim() || `Pantalla ${frame.position}`}
                </p>
                {frame.headline && <p className="font-bold">{frame.headline}</p>}
                {frame.body && <p className="whitespace-pre-wrap">{frame.body}</p>}
                {frame.closing && <p className="italic">{frame.closing}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {open && canDecide && (
        <div className="mt-4">
          {asking ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-sm font-bold">¿Qué hay que cambiar?</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="mt-1 block w-full rounded-xl border border-iris-lavender bg-white px-3 py-2 text-base outline-none focus:border-iris-violet focus:ring-2 focus:ring-iris-lavender"
                  placeholder="Por ejemplo: simplificar el texto de la portada."
                />
              </label>
              {noteError && <p role="alert" className="text-sm font-semibold">{noteError}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={submitChanges}
                  disabled={busy}
                  className="rounded-xl bg-iris-violet px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {busy ? 'Guardando…' : 'Enviar pedido de cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAsking(false)
                    setNoteError(null)
                  }}
                  disabled={busy}
                  className="rounded-xl border border-iris-lavender bg-white px-4 py-3 text-sm font-bold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={approve}
                disabled={busy || piece.review_status === 'approved'}
                className="rounded-xl bg-iris-lime px-4 py-3 text-sm font-bold text-iris-violet ring-1 ring-iris-violet/20 disabled:opacity-60"
              >
                {piece.review_status === 'approved' ? '✓ Revisado' : busy ? 'Guardando…' : '✓ Revisado'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(true)
                  setNote(piece.review_status === 'changes_requested' ? (piece.review_note ?? '') : '')
                }}
                disabled={busy}
                className="rounded-xl border border-iris-violet bg-white px-4 py-3 text-sm font-bold"
              >
                {piece.review_status === 'changes_requested' ? 'Editar pedido de cambios' : 'Pedir cambios'}
              </button>
              {isTeam && piece.review_status === 'changes_requested' && (
                <button
                  type="button"
                  onClick={() => correctedMutation.mutate(piece.id)}
                  disabled={busy}
                  className="rounded-xl border border-iris-lavender bg-iris-cream px-4 py-3 text-sm font-bold"
                >
                  Ya corregimos → volver a Sin revisar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </li>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p className="mt-6 rounded-2xl bg-white p-6 text-center text-sm ring-1 ring-iris-lilac">{children}</p>
}
