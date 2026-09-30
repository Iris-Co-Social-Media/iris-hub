import { useCallback, useEffect, useState } from 'react'
import { SelectField, TextArea, TextField } from '../../components/FormFields'
import { frameForm, moveFrame, nextPosition, renumber, type FrameFormValues } from '../../lib/frames'
import { INTERACTION_LABELS, type PieceFormat, type PieceFrame } from '../../lib/pieces'
import { INTERACTIONS } from '../../lib/pieceForm'
import { ConflictError, useAddFrame, useDeleteFrame, useMoveFrame, useUpdateFrame } from './usePieceMutations'

// Pantallas / láminas de la pieza (piece_frames). Cada pantalla se guarda por
// separado; el orden se mantiene con `position` (1, 2, 3…).
export function FramesEditor({
  pieceId,
  format,
  frames,
  onDirtyChange,
}: {
  pieceId: string
  format: PieceFormat
  frames: PieceFrame[]
  onDirtyChange: (frameId: string, dirty: boolean) => void
}) {
  const add = useAddFrame()
  const move = useMoveFrame()
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const handleDirty = useCallback(
    (frameId: string, dirty: boolean) => {
      setDirtyIds((current) => {
        if (dirty === current.has(frameId)) return current
        const next = new Set(current)
        if (dirty) next.add(frameId)
        else next.delete(frameId)
        return next
      })
      onDirtyChange(frameId, dirty)
    },
    [onDirtyChange],
  )
  // Mover o quitar cambia la posición de otras pantallas: mientras alguna
  // tenga cambios sin guardar, se espera (evita avisos de conflicto falsos).
  const anyDirty = dirtyIds.size > 0
  const ordered = [...frames].sort((a, b) => a.position - b.position)
  const noun = format === 'carousel' ? 'lámina' : 'pantalla'
  const title = format === 'carousel' ? 'Láminas' : 'Pantallas'

  function handleAdd() {
    const position = nextPosition(ordered)
    add.mutate({ pieceId, position, label: position === 1 ? 'Portada' : null })
  }

  return (
    <section aria-label={title} className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">
          {title} <span className="text-iris-violet/60">({ordered.length})</span>
        </h2>
      </div>
      {ordered.length === 0 && (
        <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-iris-violet/70 ring-1 ring-iris-lilac">
          Esta pieza todavía no tiene {noun}s. Agregá la primera.
        </p>
      )}
      <ol className="mt-3 space-y-3">
        {ordered.map((frame, index) => (
          <FrameCard
            key={frame.id}
            frame={frame}
            noun={noun}
            isFirst={index === 0}
            isLast={index === ordered.length - 1}
            siblings={ordered}
            locked={move.isPending || anyDirty}
            othersDirty={[...dirtyIds].some((id) => id !== frame.id)}
            onMove={(direction) => move.mutate(moveFrame(ordered, frame.id, direction))}
            onDirtyChange={handleDirty}
          />
        ))}
      </ol>
      {(add.error || move.error) && (
        <p role="alert" className="mt-3 rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {(add.error ?? move.error)!.message}
        </p>
      )}
      <button
        type="button"
        onClick={handleAdd}
        disabled={add.isPending}
        className="mt-3 w-full rounded-xl border-2 border-dashed border-iris-lavender bg-white px-4 py-3 text-sm font-bold disabled:opacity-60"
      >
        {add.isPending ? 'Agregando…' : `+ Agregar ${noun}`}
      </button>
    </section>
  )
}

function FrameCard({
  frame,
  noun,
  isFirst,
  isLast,
  siblings,
  locked,
  othersDirty,
  onMove,
  onDirtyChange,
}: {
  frame: PieceFrame
  noun: string
  isFirst: boolean
  isLast: boolean
  siblings: PieceFrame[]
  locked: boolean
  othersDirty: boolean
  onMove: (direction: -1 | 1) => void
  onDirtyChange: (frameId: string, dirty: boolean) => void
}) {
  const update = useUpdateFrame()
  const remove = useDeleteFrame()
  const serverKey = JSON.stringify(frameForm(frame))
  const [values, setValues] = useState<FrameFormValues>(() => frameForm(frame))
  // Última versión de la base que tomó esta tarjeta (textos + updated_at).
  const [synced, setSynced] = useState({ key: serverKey, updatedAt: frame.updated_at })
  const [base, setBase] = useState(frame.updated_at)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(values) !== synced.key
  // Si llega una versión nueva de la base y no hay cambios sin guardar, se
  // toma (se ajusta durante el render, sin efectos).
  if (!dirty && (serverKey !== synced.key || frame.updated_at !== synced.updatedAt)) {
    setSynced({ key: serverKey, updatedAt: frame.updated_at })
    setValues(JSON.parse(serverKey) as FrameFormValues)
    setBase(frame.updated_at)
  }
  const frameId = frame.id
  useEffect(() => onDirtyChange(frameId, dirty), [frameId, dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(frameId, false), [frameId, onDirtyChange])

  function set<K extends keyof FrameFormValues>(key: K, value: FrameFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  function save() {
    update.mutate(
      { frameId: frame.id, loadedUpdatedAt: base, values },
      {
        onSuccess: (updatedAt) => {
          setBase(updatedAt)
          setSynced({ key: JSON.stringify(values), updatedAt })
          setSaved(true)
        },
      },
    )
  }

  function discardAndReload() {
    update.reset()
    setValues(JSON.parse(serverKey) as FrameFormValues)
    setSynced({ key: serverKey, updatedAt: frame.updated_at })
    setBase(frame.updated_at)
  }

  const title = values.label.trim() || `${noun[0].toUpperCase()}${noun.slice(1)} ${frame.position}`
  const conflict = update.error instanceof ConflictError

  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold">
          <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-iris-lilac px-1.5 text-xs">
            {frame.position}
          </span>
          {title}
        </h3>
        <div className="flex gap-1">
          <IconButton label={`Subir ${noun} ${frame.position}`} disabled={isFirst || locked} onClick={() => onMove(-1)}>
            ↑
          </IconButton>
          <IconButton label={`Bajar ${noun} ${frame.position}`} disabled={isLast || locked} onClick={() => onMove(1)}>
            ↓
          </IconButton>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <TextField label="Nombre" placeholder={`Portada, Historia 2, Foto 4 · El desafío…`} value={values.label} onChange={(v) => set('label', v)} />
        <TextArea label="Texto principal" rows={2} value={values.headline} onChange={(v) => set('headline', v)} />
        <TextArea label="Texto secundario" rows={3} value={values.body} onChange={(v) => set('body', v)} />
        <TextArea label="Qué mostrar" hint="Indicación para quien diseña. No se copia." rows={2} value={values.visual_direction} onChange={(v) => set('visual_direction', v)} />
        <SelectField
          label="Interacción"
          value={values.interaction_type}
          onChange={(v) => set('interaction_type', v as FrameFormValues['interaction_type'])}
          options={INTERACTIONS.map((type) => ({ value: type, label: INTERACTION_LABELS[type] }))}
        />
        {values.interaction_type !== 'none' && (
          <div className="grid gap-3 rounded-xl bg-iris-cream p-3">
            <TextField label="Pregunta" value={values.interaction_question} onChange={(v) => set('interaction_question', v)} />
            {values.interaction_type !== 'question' && values.interaction_type !== 'slider' && (
              <TextArea label="Opciones" hint="Una por línea." rows={3} value={values.interaction_options} onChange={(v) => set('interaction_options', v)} />
            )}
            {values.interaction_type === 'quiz' && (
              <SelectField
                label="Respuesta correcta"
                value={values.interaction_correct}
                onChange={(v) => set('interaction_correct', v)}
                emptyLabel="Sin marcar"
                options={values.interaction_options
                  .split('\n')
                  .map((option) => option.trim())
                  .filter(Boolean)
                  .map((option, index) => ({ value: String(index), label: option }))}
              />
            )}
          </div>
        )}
        <TextArea label="Cierre / CTA" rows={2} value={values.closing} onChange={(v) => set('closing', v)} />
      </div>

      {update.error && (
        <div role="alert" className="mt-3 rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {update.error.message}
          {conflict && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={discardAndReload} className="rounded-lg bg-white px-3 py-2 font-bold ring-1 ring-iris-lavender">
                Descartar mis cambios y ver la versión nueva
              </button>
              <button
                type="button"
                onClick={() => {
                  setBase(frame.updated_at)
                  update.reset()
                }}
                className="rounded-lg bg-white px-3 py-2 font-bold ring-1 ring-iris-lavender"
              >
                Mantener mis cambios (se reemplaza al guardar)
              </button>
            </div>
          )}
        </div>
      )}
      {remove.error && (
        <p role="alert" className="mt-3 rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {remove.error.message}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || update.isPending || conflict}
          className="rounded-xl bg-iris-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {update.isPending ? 'Guardando…' : `Guardar ${noun}`}
        </button>
        {dirty && !update.isPending && <span className="text-xs text-iris-violet/70">Cambios sin guardar.</span>}
        {saved && !dirty && <span className="text-xs font-bold">✓ Guardada</span>}
        <span className="sm:flex-1" />
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-xl bg-iris-cream p-2 sm:flex-row sm:items-center">
            <span className="text-sm font-bold">¿Quitar esta {noun}?</span>
            <button
              type="button"
              onClick={() =>
                remove.mutate({
                  frameId: frame.id,
                  renumber: renumber(siblings.filter((sibling) => sibling.id !== frame.id)),
                })
              }
              disabled={remove.isPending}
              className="rounded-lg bg-iris-violet px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {remove.isPending ? 'Quitando…' : 'Sí, quitar'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg bg-white px-3 py-2 text-sm font-bold ring-1 ring-iris-lavender">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={othersDirty || remove.isPending}
            title={othersDirty ? 'Primero guardá las otras pantallas' : undefined}
            className="rounded-xl border border-iris-lavender bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            Quitar {noun}
          </button>
        )}
      </div>
    </li>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-10 w-10 rounded-xl border border-iris-lavender bg-white text-lg font-bold disabled:opacity-40"
    >
      {children}
    </button>
  )
}
