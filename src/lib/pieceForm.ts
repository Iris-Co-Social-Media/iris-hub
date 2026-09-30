// Formulario de pieza (paso 5b.2). Valida con Zod y arma lo que se guarda en
// `pieces`. Nunca incluye review_status ni status: la revisión va por su
// propio flujo y el estado de producción por sus controles (§3.2).

import { z } from 'zod'
import {
  CONTENT_KIND_LABELS,
  contentKind,
  INTERACTION_LABELS,
  STORY_TYPE_LABELS,
  type ContentKind,
  type InteractionType,
  type Objective,
  type PieceDetail,
  type PieceFormat,
  type PieceStatus,
  type StoryType,
} from './pieces'

export const FORMATS: PieceFormat[] = ['story', 'post', 'carousel', 'reel']
export const PUBLICATION_FORMATS: PieceFormat[] = ['post', 'carousel', 'reel']
export const STORY_TYPES: StoryType[] = ['image', 'image_series', 'video']
export const OBJECTIVES: Objective[] = ['educate', 'leads', 'experience', 'engagement', 'brand']
export const INTERACTIONS: InteractionType[] = ['none', 'poll', 'quiz', 'question', 'slider']
// Interacciones que se ofrecen en una historia nueva. "Deslizador" solo se
// muestra si la pieza ya lo tenía.
export const STORY_INTERACTIONS: InteractionType[] = ['poll', 'question', 'quiz']

// Cantidad de imágenes de una serie = cantidad de pantallas. "8 o más" crea
// 8 pantallas y después se pueden agregar más; queda marcado en la pieza
// (story_images_open) para no confundirlo con "8".
export const IMAGE_COUNTS = ['2', '3', '4', '5', '6', '7', '8', '8+'] as const
export type ImageCount = (typeof IMAGE_COUNTS)[number]
export const IMAGE_COUNT_LABELS: Record<ImageCount, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '8+': '8 o más',
}

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), {
    message: 'Tiene que ser un enlace que empiece con https://',
  })

export const pieceFormSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio.').max(300, 'El título es demasiado largo.'),
  // Opcional: puede quedar vacía.
  description: z.string(),
  // Primero se elige el tipo (Publicación / Historia) y después el formato.
  // "kind" no se guarda: sale del formato.
  kind: z.enum(['', 'publication', 'story']),
  format: z.enum(['', 'story', 'post', 'carousel', 'reel']),
  story_type: z.enum(['', 'image', 'image_series', 'video']),
  // Cantidad elegida para una serie. Al editar, '' = dejar las pantallas como están.
  image_count: z.enum(['', ...IMAGE_COUNTS]),
  images_open: z.boolean(), // "8 o más" (se guarda en story_images_open)
  has_interaction: z.boolean(),
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
    description: '',
    kind: '',
    format: '',
    story_type: '',
    image_count: '',
    images_open: false,
    has_interaction: false,
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
    description: piece.description ?? '',
    kind: contentKind(piece.format),
    format: piece.format,
    story_type: piece.story_type ?? '',
    image_count: '',
    images_open: piece.story_images_open,
    has_interaction: piece.interaction !== 'none',
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

// Columnas que guarda el formulario (mismas para crear y editar). Solo se
// llama con un formulario válido (tipo y formato elegidos).
export function piecePayload(values: PieceFormValues) {
  const isStory = values.kind === 'story'
  return {
    title: values.title.trim(),
    description: orNull(values.description),
    format: (isStory ? 'story' : values.format) as PieceFormat,
    story_type: isStory ? ((values.story_type || null) as StoryType | null) : null,
    story_images_open: isStory && values.story_type === 'image_series' && values.images_open,
    estimated_date: orNull(values.estimated_date),
    pillar_id: orNull(values.pillar_id),
    service_id: orNull(values.service_id),
    series_id: orNull(values.series_id),
    project_id: orNull(values.project_id),
    objective: orNull(values.objective) as Objective | null,
    interaction: isStory && !values.has_interaction ? 'none' : values.interaction,
    needs_client_on_camera: values.needs_client_on_camera,
    script: orNull(values.script),
    publish_copy: orNull(values.publish_copy),
    canva_url: orNull(values.canva_url),
    album_url: orNull(values.album_url),
  }
}

export type FormErrors = Partial<Record<keyof PieceFormValues, string>>

// Valida el formulario. `currentStatus` es el estado de producción actual
// (solo al editar): la base no deja que una pieza en "Esperando grabación" o
// "Grabado" deje de ser reel. `frameCount` son las pantallas que ya tiene.
export function validatePieceForm(
  values: PieceFormValues,
  currentStatus?: PieceStatus,
  { frameCount = 0 }: { frameCount?: number } = {},
): FormErrors {
  const errors: FormErrors = {}
  const parsed = pieceFormSchema.safeParse(values)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof PieceFormValues
      errors[key] ??= issue.message
    }
  }
  const editing = currentStatus !== undefined
  if (values.kind === '') {
    errors.kind = 'Elegí si es una publicación o una historia.'
  } else if (values.kind === 'publication') {
    if (!PUBLICATION_FORMATS.includes(values.format as PieceFormat)) errors.format = 'Elegí un formato.'
  } else {
    // Las historias creadas antes de este cambio pueden no tener formato: no
    // se obliga a elegirlo para guardar otros cambios.
    if (values.story_type === '' && !editing) errors.story_type = 'Elegí un formato.'
    if (values.story_type === 'image_series' && values.image_count === '' && frameCount < 2 && !values.images_open) {
      errors.image_count = 'Elegí la cantidad de imágenes.'
    }
    if (values.has_interaction && values.interaction === 'none') {
      errors.interaction = 'Elegí el tipo de interacción.'
    }
  }
  const finalFormat = values.kind === 'story' ? 'story' : values.format
  if (currentStatus && isReelOnlyStatus(currentStatus) && values.kind !== '' && finalFormat !== 'reel') {
    errors[values.kind === 'story' ? 'kind' : 'format'] =
      'Esta pieza está en un estado de grabación. Para cambiar el formato, primero pasala a "Por hacer" o "Editada".'
  }
  return errors
}

// ---------------------------------------------------------------------------
// Cambiar entre Publicación e Historia (o de formato de historia)
// ---------------------------------------------------------------------------

// Devuelve los valores nuevos y qué datos cargados se descartarían, para
// pedir confirmación antes de perderlos.
export function switchKind(values: PieceFormValues, next: ContentKind): { values: PieceFormValues; lost: string[] } {
  if (values.kind === next) return { values, lost: [] }
  const lost: string[] = []
  if (next === 'publication') {
    if (values.story_type) lost.push(`el formato de historia (${STORY_TYPE_LABELS[values.story_type]})`)
    const count = values.image_count || (values.images_open ? '8+' : '')
    if (values.story_type === 'image_series' && count) {
      lost.push(`la cantidad de imágenes (${IMAGE_COUNT_LABELS[count]})`)
    }
    if (values.interaction !== 'none') {
      lost.push(`la interacción (${INTERACTION_LABELS[values.interaction]})`)
    }
    return {
      values: {
        ...values,
        kind: next,
        format: '',
        story_type: '',
        image_count: '',
        images_open: false,
        has_interaction: false,
        interaction: 'none',
      },
      lost,
    }
  }
  if (values.script.trim()) lost.push('el guion (solo para reels)')
  return {
    values: {
      ...values,
      kind: next,
      format: 'story',
      story_type: '',
      image_count: '',
      images_open: false,
      has_interaction: values.interaction !== 'none',
      script: '',
    },
    lost,
  }
}

export function lostDataMessage(next: ContentKind, lost: string[]): string {
  return `Al cambiar a ${CONTENT_KIND_LABELS[next]} se descarta ${lost.join(', ')}. ¿Querés continuar?`
}

// Formato de historia: dejar de ser serie borra la cantidad elegida.
export function switchStoryType(values: PieceFormValues, next: StoryType): PieceFormValues {
  const series = next === 'image_series'
  return { ...values, story_type: next, image_count: series ? values.image_count : '', images_open: series && values.images_open }
}

// ---------------------------------------------------------------------------
// Cantidad de pantallas de una historia
// ---------------------------------------------------------------------------

// Opción del selector que corresponde a las pantallas que tiene la serie.
// Con 8 pantallas, "8 o más" solo si se eligió así.
export function imageCountOption(frameCount: number, open = false): ImageCount | '' {
  if (frameCount < 2) return ''
  if (frameCount > 8 || (frameCount === 8 && open)) return '8+'
  return String(frameCount) as ImageCount
}

// Cuántas pantallas tiene que quedar teniendo la pieza al guardar, o null si
// no hay que tocarlas. `initial` es la versión guardada (null al crear).
//   · Serie con cantidad elegida → esa cantidad ("8 o más": al menos 8).
//   · Cambió a Imagen o Video → una sola pantalla.
export function targetFrameCount(values: PieceFormValues, initial: PieceFormValues | null, current: number): number | null {
  if (values.kind !== 'story') return null
  if (values.story_type === 'image_series' && values.image_count) {
    const target = values.image_count === '8+' ? Math.max(8, current) : Number(values.image_count)
    return target === current ? null : target
  }
  const changed = initial !== null && initial.story_type !== values.story_type
  if ((values.story_type === 'image' || values.story_type === 'video') && changed && current > 1) return 1
  return null
}

type SyncFrame = {
  id: string
  position: number
  label: string | null
  headline: string | null
  body: string | null
  visual_direction: string | null
  closing: string | null
  interaction: unknown
}

// Qué pantallas agregar (posiciones nuevas, al final) o quitar (las últimas).
export function planFrameCount<T extends SyncFrame>(frames: T[], target: number): { add: number[]; remove: T[] } {
  const ordered = [...frames].sort((a, b) => a.position - b.position)
  if (target >= ordered.length) {
    const last = ordered.at(-1)?.position ?? 0
    return { add: Array.from({ length: target - ordered.length }, (_, i) => last + i + 1), remove: [] }
  }
  return { add: [], remove: ordered.slice(target) }
}

export function frameHasContent(frame: SyncFrame): boolean {
  return (
    [frame.label, frame.headline, frame.body, frame.visual_direction, frame.closing].some((text) => Boolean(text?.trim())) ||
    frame.interaction != null
  )
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
