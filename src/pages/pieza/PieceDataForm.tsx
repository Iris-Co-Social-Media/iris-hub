import { useEffect, useState, type FormEvent } from 'react'
import { CheckboxField, SelectField, TextArea, TextField } from '../../components/FormFields'
import { monthStartIso, type MonthKey } from '../../lib/dates'
import {
  FORMATS,
  INTERACTIONS,
  OBJECTIVES,
  validatePieceForm,
  type FormErrors,
  type PieceFormValues,
} from '../../lib/pieceForm'
import { FORMAT_LABELS, INTERACTION_LABELS, OBJECTIVE_LABELS, type PieceStatus } from '../../lib/pieces'
import { useCatalog, visibleOptions } from './useCatalogs'

// Datos de la pieza (§6.2). Obligatorios: título y formato (lo que exige la
// base). Fecha y pilar, muy recomendados. No incluye estados: la producción
// tiene sus propios controles y la revisión su propio flujo.
export function PieceDataForm({
  clientId,
  month,
  publishCopyEnabled,
  initial,
  currentStatus,
  submitLabel,
  busy,
  serverError,
  onSubmit,
  onDirtyChange,
  onCancel,
}: {
  clientId: string
  month: MonthKey | null
  publishCopyEnabled: boolean
  initial: PieceFormValues
  currentStatus?: PieceStatus
  submitLabel: string
  busy: boolean
  serverError: string | null
  onSubmit: (values: PieceFormValues) => void
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const pillars = useCatalog('pillars', clientId)
  const services = useCatalog('services', clientId)
  const series = useCatalog('series', clientId)
  const projects = useCatalog('projects', clientId)

  // `initial` es la última versión guardada. Para reemplazar lo escrito por
  // otra versión, quien usa el formulario lo vuelve a montar (prop `key`).
  const initialKey = JSON.stringify(initial)
  const dirty = JSON.stringify(values) !== initialKey
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  function set<K extends keyof PieceFormValues>(key: K, value: PieceFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validatePieceForm(values, currentStatus)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return
    onSubmit(values)
  }

  const monthMin = month ? monthStartIso(month) : undefined
  const monthMax = month ? endOfMonthIso(month) : undefined
  const dateOutsideMonth =
    month && values.estimated_date && !values.estimated_date.startsWith(month)
      ? 'La fecha queda fuera del mes de esta planificación.'
      : undefined
  const showScript = values.format === 'reel' || values.script.trim() !== ''
  const showPublishCopy = publishCopyEnabled || values.publish_copy.trim() !== ''

  const catalogOptions = (items: ReturnType<typeof useCatalog>['data'], selected: string) =>
    visibleOptions(items, selected).map((item) => ({
      value: item.id,
      label: item.name + (item.active ? '' : ' (inactivo)') + (item.confidential ? ' · confidencial' : ''),
    }))

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <fieldset className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
        <legend className="px-1 text-sm font-extrabold">Lo básico</legend>
        <TextField label="Título" required value={values.title} onChange={(v) => set('title', v)} error={errors.title} />
        <TextArea
          label="Descripción / idea"
          hint="Opcional. Qué se quiere contar o desarrollar en esta publicación."
          rows={5}
          value={values.description}
          onChange={(v) => set('description', v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Formato"
            required
            value={values.format}
            onChange={(v) => set('format', v as PieceFormValues['format'])}
            options={FORMATS.map((format) => ({ value: format, label: FORMAT_LABELS[format] }))}
            error={errors.format}
          />
          <TextField
            label="Fecha estimada"
            hint="Recomendada: sin fecha no aparece en el calendario."
            type="date"
            value={values.estimated_date}
            onChange={(v) => set('estimated_date', v)}
            min={monthMin}
            max={monthMax}
            error={errors.estimated_date ?? dateOutsideMonth}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
        <legend className="px-1 text-sm font-extrabold">Clasificación</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Pilar"
            hint="Recomendado."
            value={values.pillar_id}
            onChange={(v) => set('pillar_id', v)}
            emptyLabel="Sin pilar"
            options={catalogOptions(pillars.data, values.pillar_id)}
          />
          <SelectField
            label="Servicio"
            value={values.service_id}
            onChange={(v) => set('service_id', v)}
            emptyLabel="Sin servicio"
            options={catalogOptions(services.data, values.service_id)}
          />
          <SelectField
            label="Serie"
            value={values.series_id}
            onChange={(v) => set('series_id', v)}
            emptyLabel="Sin serie"
            options={catalogOptions(series.data, values.series_id)}
          />
          <SelectField
            label="Obra"
            value={values.project_id}
            onChange={(v) => set('project_id', v)}
            emptyLabel={projects.data?.length ? 'Sin obra' : 'Todavía no hay obras cargadas'}
            options={catalogOptions(projects.data, values.project_id)}
          />
          <SelectField
            label="Objetivo"
            value={values.objective}
            onChange={(v) => set('objective', v)}
            emptyLabel="Sin objetivo"
            options={OBJECTIVES.map((objective) => ({ value: objective, label: OBJECTIVE_LABELS[objective] }))}
          />
          <SelectField
            label="Interacción"
            hint="Resumen de la pieza (el detalle va en cada pantalla)."
            value={values.interaction}
            onChange={(v) => set('interaction', v as PieceFormValues['interaction'])}
            options={INTERACTIONS.map((interaction) => ({ value: interaction, label: INTERACTION_LABELS[interaction] }))}
          />
        </div>
        <CheckboxField
          label="Graba el cliente (necesita que el cliente esté en cámara)"
          checked={values.needs_client_on_camera}
          onChange={(v) => set('needs_client_on_camera', v)}
        />
      </fieldset>

      {(showScript || showPublishCopy) && (
        <fieldset className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
          <legend className="px-1 text-sm font-extrabold">Textos</legend>
          {showScript && (
            <TextArea
              label="Guion"
              hint={values.format === 'reel' ? 'Solo para reels.' : 'Solo para reels: esta pieza ya no es reel.'}
              rows={6}
              value={values.script}
              onChange={(v) => set('script', v)}
            />
          )}
          {showPublishCopy && (
            <TextArea
              label="Copy para publicar"
              hint={publishCopyEnabled ? undefined : 'Este cliente no usa copy para publicar.'}
              rows={5}
              value={values.publish_copy}
              onChange={(v) => set('publish_copy', v)}
            />
          )}
        </fieldset>
      )}

      <fieldset className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
        <legend className="px-1 text-sm font-extrabold">Enlaces</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Enlace de Canva"
            type="url"
            placeholder="https://www.canva.com/…"
            value={values.canva_url}
            onChange={(v) => set('canva_url', v)}
            error={errors.canva_url}
          />
          <TextField
            label="Enlace del álbum / Drive"
            type="url"
            placeholder="https://drive.google.com/…"
            value={values.album_url}
            onChange={(v) => set('album_url', v)}
            error={errors.album_url}
          />
        </div>
      </fieldset>

      {serverError && (
        <p role="alert" className="rounded-xl bg-iris-lilac px-4 py-3 text-sm font-semibold">
          {serverError}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-iris-lilac bg-iris-cream/95 px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="submit"
          disabled={busy || (!dirty && submitLabel !== 'Crear pieza')}
          className="rounded-xl bg-iris-violet px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Guardando…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-iris-lavender bg-white px-5 py-3 text-sm font-bold"
        >
          Cancelar
        </button>
        {dirty && <span className="self-center text-xs text-iris-violet/70">Hay cambios sin guardar.</span>}
      </div>
    </form>
  )
}

function endOfMonthIso(month: MonthKey): string {
  const [year, m] = month.split('-').map(Number)
  const last = new Date(year, m, 0).getDate()
  return `${month}-${String(last).padStart(2, '0')}`
}
