import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { AppLayout } from '../../components/AppLayout'
import { CopyButton } from '../../components/CopyButton'
import { capitalizeFirst, currentMonthKey, dayLabel, monthLabel, type MonthKey } from '../../lib/dates'
import {
  allFramesCopyText,
  FORMAT_LABELS,
  frameCopyText,
  INTERACTION_LABELS,
  interactionText,
  OBJECTIVE_LABELS,
  PLAN_STATUS_LABELS,
  type PieceFrame,
} from '../../lib/pieces'
import { FormatBadge, ReviewBadge, StatusBadge } from '../mes/PieceBadges'
import { useClient, useIsTeam, usePillars } from '../mes/useMonthData'
import { ProductionControls } from './ProductionControls'
import { PublishControl } from './PublishControl'
import { usePiece, type PieceBundle } from './usePieceData'

// Pantalla "Pieza (detalle)" (docs/ARQUITECTURA.md §4): datos de la pieza y
// sus pantallas, con "copiar con un toque". Solo lectura por ahora.
// Dirección: /:slug/pieza/:pieceId
export function PiezaPage() {
  const { slug = '', pieceId = '' } = useParams()
  const client = useClient(slug)
  const pillars = usePillars(client.data?.id)
  const piece = usePiece(client.data?.id, pieceId)

  const loading = client.isPending || (client.data && piece.isPending && piece.fetchStatus !== 'idle')
  if (loading) return <Shell slug={slug}><Message>Cargando…</Message></Shell>
  if (client.isError || piece.isError) {
    return <Shell slug={slug}><Message>No pudimos cargar la pieza. Revisá tu conexión y recargá la página.</Message></Shell>
  }
  if (!client.data || !piece.data) {
    return (
      <Shell slug={slug}>
        <Message>No encontramos esta pieza o no tenés acceso.</Message>
      </Shell>
    )
  }

  const pillarName = pillars.data?.find((pillar) => pillar.id === piece.data!.piece.pillar_id)?.name ?? null
  return <PieceView slug={slug} bundle={piece.data} pillarName={pillarName} />
}

function PieceView({ slug, bundle, pillarName }: { slug: string; bundle: PieceBundle; pillarName: string | null }) {
  const isTeam = useIsTeam().data ?? false
  const { piece, frames, plan, names } = bundle
  const backMonth: MonthKey = (plan?.month ?? piece.estimated_date ?? `${currentMonthKey()}-01`).slice(0, 7)
  const framesText = allFramesCopyText(frames)

  return (
    <Shell slug={slug} backMonth={backMonth}>
      {/* Encabezado */}
      <header className="mt-4">
        <div className="flex flex-wrap gap-1.5">
          <FormatBadge format={piece.format} />
          <StatusBadge status={piece.status} format={piece.format} />
          <ReviewBadge review={piece.review_status} />
          {piece.times_carried_over > 0 && (
            <Tag>
              Trasladada{piece.times_carried_over > 1 ? ` (${piece.times_carried_over} veces)` : ''}
            </Tag>
          )}
          {piece.needs_client_on_camera && <Tag>Graba el cliente</Tag>}
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{piece.title}</h1>
          <CopyButton text={piece.title} what="título" />
        </div>
        {isTeam && (
          <Link
            to={`/${slug}/pieza/${piece.id}/editar`}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-iris-violet px-4 py-2 text-sm font-bold text-white"
          >
            Editar datos y pantallas
          </Link>
        )}
      </header>

      <PublishControl piece={piece} />
      {piece.status === 'published' && (
        <p className="mt-4 rounded-2xl bg-iris-violet px-4 py-3 text-sm font-bold text-white">
          ✓ Publicada
          {piece.published_at &&
            ` el ${new Date(piece.published_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </p>
      )}
      {isTeam && <ProductionControls piece={piece} />}

      {piece.review_status === 'changes_requested' && piece.review_note && (
        <section className="mt-4 rounded-2xl bg-iris-violet/10 p-4 ring-1 ring-iris-violet">
          <h2 className="text-sm font-extrabold">Cambios pedidos</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{piece.review_note}</p>
        </section>
      )}

      {/* Datos */}
      <section aria-label="Datos de la pieza" className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="Fecha estimada">
            {piece.estimated_date ? capitalizeFirst(dayLabel(piece.estimated_date)) : 'Sin fecha'}
          </Field>
          <Field label="Planificación">
            {plan
              ? `${capitalizeFirst(monthLabel(plan.month.slice(0, 7)))} · ${PLAN_STATUS_LABELS[plan.status]}`
              : 'Banco de ideas'}
          </Field>
          <Field label="Formato">{FORMAT_LABELS[piece.format]} · Instagram</Field>
          <Field label="Pilar">{pillarName ?? '—'}</Field>
          {names.service && <Field label="Servicio">{names.service}</Field>}
          {names.series && <Field label="Serie">{names.series}</Field>}
          {names.project && <Field label="Obra">{names.project}</Field>}
          {piece.objective && <Field label="Objetivo">{OBJECTIVE_LABELS[piece.objective]}</Field>}
          {piece.interaction !== 'none' && <Field label="Interacción">{INTERACTION_LABELS[piece.interaction]}</Field>}
          {piece.published_at && (
            <Field label="Publicada">
              {new Date(piece.published_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Field>
          )}
        </dl>
        {(piece.canva_url || piece.album_url) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {piece.canva_url && <ExternalLink href={piece.canva_url}>Abrir en Canva</ExternalLink>}
            {piece.album_url && <ExternalLink href={piece.album_url}>Ver álbum de fotos</ExternalLink>}
          </div>
        )}
      </section>

      {/* Descripción / idea (solo si se cargó) */}
      {piece.description?.trim() && (
        <TextBlock title="Descripción / idea" text={piece.description} copyWhat="descripción" />
      )}

      {/* Guion (reels) */}
      {piece.script?.trim() && (
        <TextBlock title="Guion" text={piece.script} copyWhat="guion" large />
      )}

      {/* Pantallas / láminas */}
      <section aria-label="Pantallas" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">
            {piece.format === 'carousel' ? 'Láminas' : 'Pantallas'}
            {frames.length > 0 && <span className="text-iris-violet/60"> ({frames.length})</span>}
          </h2>
          <CopyButton text={framesText} label="Copiar todo" what="todas las pantallas" variant="large" />
        </div>
        {frames.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-iris-violet/70 ring-1 ring-iris-lilac">
            Esta pieza todavía no tiene pantallas cargadas.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {frames.map((frame) => (
              <FrameCard key={frame.id} frame={frame} />
            ))}
          </ol>
        )}
      </section>

      {/* Copy para publicar (solo si se cargó) */}
      {piece.publish_copy?.trim() && (
        <TextBlock title="Copy para publicar" text={piece.publish_copy} copyWhat="copy para publicar" large />
      )}
    </Shell>
  )
}

function FrameCard({ frame }: { frame: PieceFrame }) {
  const title = frame.label?.trim() || `Pantalla ${frame.position}`
  const interaction = interactionText(frame.interaction)
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-extrabold">
          <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-iris-lilac px-1.5 text-xs">
            {frame.position}
          </span>
          {title}
        </h3>
        <CopyButton text={frameCopyText(frame)} label="Copiar pantalla" what={title} />
      </div>
      <div className="mt-3 space-y-3">
        <FrameText label="Texto principal" text={frame.headline} strong />
        <FrameText label="Texto secundario" text={frame.body} />
        <FrameText label="Interacción" text={interaction} />
        <FrameText label="Cierre" text={frame.closing} />
        {frame.visual_direction?.trim() && (
          <div className="rounded-xl bg-iris-cream p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-iris-violet/70">Qué mostrar</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{frame.visual_direction}</p>
          </div>
        )}
      </div>
    </li>
  )
}

function FrameText({ label, text, strong = false }: { label: string; text: string | null; strong?: boolean }) {
  if (!text?.trim()) return null
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-iris-violet/70">{label}</p>
        <p className={`mt-1 whitespace-pre-wrap break-words ${strong ? 'text-base font-bold' : 'text-sm'}`}>{text}</p>
      </div>
      <CopyButton text={text} what={label.toLowerCase()} />
    </div>
  )
}

function TextBlock({ title, text, copyWhat, large = false }: { title: string; text: string; copyWhat: string; large?: boolean }) {
  return (
    <section aria-label={title} className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <CopyButton text={text} what={copyWhat} variant={large ? 'large' : 'small'} />
      </div>
      <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-4 text-base leading-relaxed ring-1 ring-iris-lilac">
        {text}
      </p>
    </section>
  )
}

function Shell({ slug, backMonth, children }: { slug: string; backMonth?: MonthKey; children: ReactNode }) {
  const month = backMonth ?? currentMonthKey()
  return (
    <AppLayout>
      <Link
        to={`/${slug}/mes/${month}`}
        className="inline-flex items-center gap-1 rounded-xl border border-iris-lavender bg-white px-3 py-2 text-sm font-bold"
      >
        ‹ Volver a {monthLabel(month)}
      </Link>
      <div className="mx-auto max-w-3xl">{children}</div>
    </AppLayout>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-iris-violet/70">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-iris-violet/40">
      {children}
    </span>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  // Solo enlaces http(s): evita que un valor raro se ejecute como código.
  if (!/^https?:\/\//i.test(href)) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-xl bg-iris-violet px-4 py-2.5 text-sm font-bold text-white"
    >
      {children} ↗
    </a>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p className="mt-6 rounded-2xl bg-white p-6 text-center text-sm ring-1 ring-iris-lilac">{children}</p>
}
