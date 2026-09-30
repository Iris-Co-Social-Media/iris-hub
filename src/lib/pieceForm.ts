// Formulario de pieza (paso 5b.2). Valida con Zod y arma lo que se guarda en
// `pieces`. Nunca incluye review_status ni status: la revisión va por su
// propio flujo y el estado de producción por sus controles (§3.2).

import { z } from 'zod'
import type { InteractionType, Objective, PieceDetail, PieceFormat, PieceStatus } from './pieces'

export const FORMATS: PieceFormat[] = ['story', 'post', 'carousel', 'reel']
export const OBJECTIVES: Objective[] = ['educate', 'leads', 'experience', 'engagement', 'brand']
export const INTERACTIONS: InteractionType[] = ['none', 'poll', 'quiz', 'question', 'slider']

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), {
    message: 'Tiene que ser un enlace que empiece con https://',
  })

export const pieceFormSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio.').max(300, 'El título es demasiado largo.'),
  format: z.enum(['story', 'post', 'carousel', 'reel'], { message: 'Elegí un formato.' }),
  estimated_date: z
    .string()
    .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), { message: 'Fecha inválida.' }),
  pillar_id: z.string(),
  service_id: z.string(),
  series_id: z.string(),
  project_id: z.string(),
  objective: z.string(),
  interaction: z.enum(['none', 'poll', 'quiz', 'question', 'slider']),
  needs_client_on_camera: z.boolean(),
  script: z.string(),
  publish_copy: z.string(),
  canva_url: optionalUrl,
  album_url: optionalUrl,
})

export type PieceFormValues = z.infer<typeof pieceFormSchema>

export function emptyForm(): PieceFormValues {
  return {
    title: '',
    format: 'post',
    estimated_date: '',
    pillar_id: '',
    service_id: '',
    series_id: '',
    project_id: '',
    objective: '',
    interaction: 'none',
    needs_client_on_camera: false,
    script: '',
    publish_copy: '',
    canva_url: '',
    album_url: '',
  }
}

export function formFromPiece(piece: PieceDetail): PieceFormValues {
  return {
    title: piece.title,
    format: piece.format,
    estimated_date: piece.estimated_date ?? '',
    pillar_id: piece.pillar_id ?? '',
    service_id: piece.service_id ?? '',
    series_id: piece.series_id ?? '',
    project_id: piece.project_id ?? '',
    objective: piece.objective ?? '',
    interaction: piece.interaction,
    needs_client_on_camera: piece.needs_client_on_camera,
    script: piece.script ?? '',
    publish_copy: piece.publish_copy ?? '',
    canva_url: piece.canva_url ?? '',
    album_url: piece.album_url ?? '',
  }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

// Columnas que guarda el formulario (mismas para crear y editar).
export function piecePayload(values: PieceFormValues) {
  return {
    title: values.title.trim(),
    format: values.format,
    estimated_date: orNull(values.estimated_date),
    pillar_id: orNull(values.pillar_id),
    service_id: orNull(values.service_id),
    series_id: orNull(values.series_id),
    project_id: orNull(values.project_id),
    objective: orNull(values.objective) as Objective | null,
    interaction: values.interaction,
    needs_client_on_camera: values.needs_client_on_camera,
    script: orNull(values.script),
    publish_copy: orNull(values.publish_copy),
    canva_url: orNull(values.canva_url),
    album_url: orNull(values.album_url),
  }
}

export type FormErrors = Partial<Record<keyof PieceFormValues, string>>

// Valida el formulario. `currentStatus` es el estado de producción actual
// (al editar): la base no deja que una pieza en "Esperando grabación" o
// "Grabado" deje de ser reel.
export function validatePieceForm(values: PieceFormValues, currentStatus?: PieceStatus): FormErrors {
  const errors: FormErrors = {}
  const parsed = pieceFormSchema.safeParse(values)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof PieceFormValues
      errors[key] ??= issue.message
    }
  }
  if (currentStatus && isReelOnlyStatus(currentStatus) && values.format !== 'reel') {
    errors.format = 'Esta pieza está en un estado de grabación. Para cambiar el formato, primero pasala a "Por hacer" o "Editada".'
  }
  return errors
}

// ---------------------------------------------------------------------------
// Estado de producción (§3.2). "Publicada" es del paso 6 (mark_published).
// ---------------------------------------------------------------------------

export function isReelOnlyStatus(status: PieceStatus): boolean {
  return status === 'awaiting_recording' || status === 'recorded'
}

// Estados que el equipo puede elegir desde los controles, en orden del flujo.
export function productionSteps(format: PieceFormat): PieceStatus[] {
  return format === 'reel' ? ['todo', 'awaiting_recording', 'recorded', 'done'] : ['todo', 'done']
}

export type ProductionMove = { to: PieceStatus; kind: 'step' | 'archive' | 'restore' }

// Movimientos posibles desde el estado actual. Se puede ir a cualquier paso
// del flujo (también volver, §3.2: "vuelven la pieza a Por hacer"), archivar,
// o desarchivar (vuelve a Por hacer). Una pieza publicada no se toca acá.
export function productionMoves(format: PieceFormat, status: PieceStatus): ProductionMove[] {
  if (status === 'published') return []
  if (status === 'archived') return [{ to: 'todo', kind: 'restore' }]
  return [
    ...productionSteps(format)
      .filter((step) => step !== status)
      .map((to) => ({ to, kind: 'step' as const })),
    { to: 'archived', kind: 'archive' },
  ]
}

// ---------------------------------------------------------------------------
// Errores de la base, en lenguaje simple
// ---------------------------------------------------------------------------

export function friendlyDbError(error: { code?: string; message?: string } | null | undefined): string {
  switch (error?.code) {
    case '42501':
      return 'No tenés permiso para hacer este cambio.'
    case '23514':
      return 'La base rechazó el cambio porque no es válido (por ejemplo, un estado de grabación en una pieza que no es reel, o un título vacío).'
    case '23503':
      return 'Alguno de los datos elegidos (pilar, servicio, serie u obra) no corresponde a este cliente o ya no existe.'
    case '23502':
      return 'Falta completar un dato obligatorio.'
    case 'PGRST116':
      return 'No encontramos esta pieza o no tenés acceso.'
    default:
      return 'No se pudo guardar. Revisá tu conexión e intentá de nuevo.'
  }
}

export const CONFLICT_MESSAGE =
  'Otra persona cambió esta pieza mientras la editabas. Recargamos los datos: revisá y volvé a guardar.'
