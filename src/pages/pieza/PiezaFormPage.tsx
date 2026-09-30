import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AppLayout } from '../../components/AppLayout'
import { currentMonthKey, isMonthKey, monthLabel, type MonthKey } from '../../lib/dates'
import { emptyForm, formFromPiece, frameHasContent, planFrameCount, targetFrameCount, type PieceFormValues } from '../../lib/pieceForm'
import { PLAN_STATUS_LABELS } from '../../lib/pieces'
import { confirmLeave, useUnsavedGuard } from '../../lib/useUnsavedGuard'
import { useClient, useIsTeam, useMonth } from '../mes/useMonthData'
import { FramesEditor } from './FramesEditor'
import { PieceDataForm } from './PieceDataForm'
import { usePiece } from './usePieceData'
import { ConflictError, useCreatePiece, useSyncFrameCount, useUpdatePiece } from './usePieceMutations'

// Crear y editar piezas (paso 5b.2). Solo el equipo de Iris; la base (RLS)
// rechaza cualquier escritura de otras personas aunque llegaran hasta acá.
//   /:slug/pieza/nueva?mes=AAAA-MM     → nueva pieza en la planificación del mes
//   /:slug/pieza/:pieceId/editar       → datos + pantallas

export function NuevaPiezaPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const monthParam = params.get('mes') ?? undefined
  const month: MonthKey = isMonthKey(monthParam) ? monthParam : currentMonthKey()
  const client = useClient(slug)
  const isTeam = useIsTeam()
  const monthData = useMonth(client.data?.id, month)
  const create = useCreatePiece()
  const [dirty, setDirty] = useState(false)
  useUnsavedGuard(dirty && !create.isSuccess)

  const backTo = `/${slug}/mes/${month}`
  const gate = accessGate({ client, isTeam, loading: monthData.isPending })
  if (gate) return <Shell backTo={backTo} backLabel={`Volver a ${monthLabel(month)}`} dirty={false}>{gate}</Shell>

  const plan = monthData.data?.plan ?? null
  if (!plan) {
    return (
      <Shell backTo={backTo} backLabel={`Volver a ${monthLabel(month)}`} dirty={false}>
        <Message>Para crear piezas primero hay que crear la planificación de {monthLabel(month)}.</Message>
      </Shell>
    )
  }
  if (plan.status === 'closed') {
    return (
      <Shell backTo={backTo} backLabel={`Volver a ${monthLabel(month)}`} dirty={false}>
        <Message>La planificación de {monthLabel(month)} está cerrada: no se pueden agregar piezas.</Message>
      </Shell>
    )
  }

  return (
    <Shell backTo={backTo} backLabel={`Volver a ${monthLabel(month)}`} dirty={dirty}>
      <Header title="Nueva pieza" subtitle={`${client.data!.name} · ${monthLabel(month)} · ${PLAN_STATUS_LABELS[plan.status]}`} />
      <p className="mb-4 text-sm text-iris-violet/80">
        Se crea en <strong>Por hacer</strong> y <strong>Sin revisar</strong>. Después de crearla vas a poder agregar sus
        pantallas.
      </p>
      <PieceDataForm
        clientId={client.data!.id}
        month={month}
        publishCopyEnabled={client.data!.publish_copy_enabled}
        initial={emptyForm()}
        submitLabel="Crear pieza"
        busy={create.isPending}
        serverError={create.error?.message ?? null}
        onDirtyChange={setDirty}
        onCancel={() => confirmLeave(dirty) && navigate(backTo)}
        onSubmit={(values) =>
          create.mutate(
            { clientId: client.data!.id, planId: plan.id, values },
            {
              onSuccess: ({ id, framesFailed }) =>
                navigate(`/${slug}/pieza/${id}/editar?creada=1${framesFailed ? '&pantallas=error' : ''}`, { replace: true }),
            },
          )
        }
      />
    </Shell>
  )
}

export function EditarPiezaPage() {
  const { slug = '', pieceId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const client = useClient(slug)
  const isTeam = useIsTeam()
  const piece = usePiece(client.data?.id, pieceId)
  const update = useUpdatePiece()
  const syncFrames = useSyncFrameCount()

  // Estado del formulario: se toma de la base al cargar, al guardar y cuando
  // la persona decide descartar sus cambios. Una recarga automática nunca
  // pisa lo que se está escribiendo.
  const [formInitial, setFormInitial] = useState<PieceFormValues | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [base, setBase] = useState<string | null>(null)
  const [formDirty, setFormDirty] = useState(false)
  const [dirtyFrames, setDirtyFrames] = useState<Set<string>>(new Set())
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const loadedFor = useRef<string | null>(null)

  const latest = piece.data?.piece
  useEffect(() => {
    if (latest && loadedFor.current !== latest.id) {
      loadedFor.current = latest.id
      setFormInitial(formFromPiece(latest))
      setBase(latest.updated_at)
    }
  }, [latest])

  const onFrameDirty = useCallback((frameId: string, dirty: boolean) => {
    setDirtyFrames((current) => {
      if (dirty === current.has(frameId)) return current
      const next = new Set(current)
      if (dirty) next.add(frameId)
      else next.delete(frameId)
      return next
    })
  }, [])

  const dirty = formDirty || dirtyFrames.size > 0
  useUnsavedGuard(dirty)

  const detailPath = `/${slug}/pieza/${pieceId}`
  const gate = accessGate({ client, isTeam, loading: piece.isPending && piece.fetchStatus !== 'idle' })
  if (gate) return <Shell backTo={detailPath} backLabel="Volver a la pieza" dirty={false}>{gate}</Shell>
  if (piece.isError) {
    return <Shell backTo={detailPath} backLabel="Volver a la pieza" dirty={false}><Message>No pudimos cargar la pieza. Revisá tu conexión y recargá la página.</Message></Shell>
  }
  if (!piece.data || !latest) {
    return <Shell backTo={`/${slug}/mes/${currentMonthKey()}`} backLabel="Volver a la planificación" dirty={false}><Message>No encontramos esta pieza o no tenés acceso.</Message></Shell>
  }
  if (!formInitial || !base) return <Shell backTo={detailPath} backLabel="Volver a la pieza" dirty={false}><Message>Cargando…</Message></Shell>

  const month: MonthKey | null = piece.data.plan ? (piece.data.plan.month.slice(0, 7) as MonthKey) : null
  const conflict = update.error instanceof ConflictError

  return (
    <Shell backTo={detailPath} backLabel="Volver a la pieza" dirty={dirty}>
      <Header
        title="Editar pieza"
        subtitle={`${client.data!.name}${month ? ` · ${monthLabel(month)}` : ' · Banco de ideas'}`}
      />
      {params.get('creada') && (
        <p className="mb-4 rounded-xl bg-iris-lime px-4 py-3 text-sm font-bold">✓ Pieza creada. Ahora podés agregar sus pantallas.</p>
      )}
      {params.get('pantallas') === 'error' && (
        <p role="alert" className="mb-4 rounded-xl bg-iris-lilac px-4 py-3 text-sm font-bold">
          No se pudieron crear las pantallas de la serie. Agregalas abajo con "+ Agregar pantalla".
        </p>
      )}
      {syncFrames.error && (
        <p role="alert" className="mb-4 rounded-xl bg-iris-lilac px-4 py-3 text-sm font-bold">{syncFrames.error.message}</p>
      )}
      {savedAt && !formDirty && <p className="mb-4 rounded-xl bg-iris-lime px-4 py-3 text-sm font-bold">✓ Datos guardados.</p>}

      {conflict && (
        <div role="alert" className="mb-4 rounded-xl bg-iris-lilac px-4 py-3 text-sm">
          <p className="font-bold">{update.error!.message}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setFormInitial(formFromPiece(latest))
                setBase(latest.updated_at)
                setFormVersion((v) => v + 1)
                update.reset()
              }}
              className="rounded-lg bg-white px-3 py-2 font-bold ring-1 ring-iris-lavender"
            >
              Descartar mis cambios y ver la versión nueva
            </button>
            <button
              type="button"
              onClick={() => {
                setBase(latest.updated_at)
                update.reset()
              }}
              className="rounded-lg bg-white px-3 py-2 font-bold ring-1 ring-iris-lavender"
            >
              Mantener mis cambios (se reemplaza al guardar)
            </button>
          </div>
        </div>
      )}

      <PieceDataForm
        key={formVersion}
        clientId={client.data!.id}
        month={month}
        publishCopyEnabled={client.data!.publish_copy_enabled}
        initial={formInitial}
        currentStatus={latest.status}
        frameCount={piece.data.frames.length}
        submitLabel="Guardar datos"
        busy={update.isPending}
        serverError={update.error && !conflict ? update.error.message : null}
        onDirtyChange={setFormDirty}
        onCancel={() => confirmLeave(dirty) && navigate(detailPath)}
        onSubmit={(values) => {
          // Historias: si cambió la cantidad de imágenes (o pasó a Imagen /
          // Video), se ajustan las pantallas. Antes de quitar pantallas con
          // contenido, se pide confirmación.
          const frames = piece.data!.frames
          // "8 o más" con menos de 8 pantallas (se quitaron a mano) deja de serlo.
          if (values.images_open && values.image_count === '' && frames.length < 8) values = { ...values, images_open: false }
          const target = targetFrameCount(values, formInitial, frames.length)
          const plan = target === null ? null : planFrameCount(frames, target)
          if (plan && plan.remove.length > 0) {
            const withContent = plan.remove.filter((frame) => frameHasContent(frame) || dirtyFrames.has(frame.id))
            const positions = plan.remove.map((frame) => frame.position).join(', ')
            if (
              withContent.length > 0 &&
              !window.confirm(
                `Al guardar se quitan ${plan.remove.length === 1 ? 'la pantalla' : 'las pantallas'} ${positions}. ` +
                  `${withContent.length === 1 ? 'Una tiene' : `${withContent.length} tienen`} contenido que se va a perder. ¿Querés continuar?`,
              )
            ) {
              return
            }
          }
          setSavedAt(null)
          syncFrames.reset()
          update.mutate(
            { pieceId: latest.id, loadedUpdatedAt: base, values },
            {
              onSuccess: (updatedAt) => {
                setBase(updatedAt)
                setFormInitial({ ...values, image_count: '' })
                // La cantidad elegida ya queda en las pantallas: el formulario
                // se vuelve a armar con lo guardado.
                if (values.image_count) setFormVersion((v) => v + 1)
                setSavedAt(Date.now())
                if (plan && (plan.add.length > 0 || plan.remove.length > 0)) {
                  syncFrames.mutate({ pieceId: latest.id, add: plan.add, removeIds: plan.remove.map((frame) => frame.id) })
                }
              },
            },
          )
        }}
      />

      <FramesEditor pieceId={latest.id} format={latest.format} frames={piece.data.frames} onDirtyChange={onFrameDirty} />
    </Shell>
  )
}

// ---------------------------------------------------------------------------

type Loadable<T> = { isPending: boolean; isError: boolean; data: T | undefined }

// Quién puede entrar: solo el equipo de Iris. Devuelve lo que hay que
// mostrar si no corresponde seguir, o null si todo está bien.
function accessGate({
  client,
  isTeam,
  loading,
}: {
  client: Loadable<unknown>
  isTeam: Loadable<boolean>
  loading: boolean
}): ReactNode | null {
  if (client.isPending || isTeam.isPending) return <Message>Cargando…</Message>
  if (client.isError || isTeam.isError) return <Message>No pudimos cargar los datos. Revisá tu conexión y recargá la página.</Message>
  if (!client.data) return <Message>No encontramos este cliente o no tenés acceso.</Message>
  if (!isTeam.data) return <Message>Solo el equipo de Iris &amp; Co puede crear o editar piezas.</Message>
  if (loading) return <Message>Cargando…</Message>
  return null
}

function Shell({ backTo, backLabel, dirty, children }: { backTo: string; backLabel: string; dirty: boolean; children: ReactNode }) {
  return (
    <AppLayout>
      <Link
        to={backTo}
        onClick={(event) => {
          if (!confirmLeave(dirty)) event.preventDefault()
        }}
        className="inline-flex items-center gap-1 rounded-xl border border-iris-lavender bg-white px-3 py-2 text-sm font-bold"
      >
        ‹ {backLabel}
      </Link>
      <div className="mx-auto mt-4 max-w-3xl">{children}</div>
    </AppLayout>
  )
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-iris-violet/70">{subtitle}</p>
      <h1 className="text-2xl font-extrabold">{title}</h1>
    </header>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-2xl bg-white p-6 text-center text-sm ring-1 ring-iris-lilac">{children}</p>
}
