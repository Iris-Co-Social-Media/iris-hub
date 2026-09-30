import { describe, expect, it } from 'vitest'
import type { PieceDetail } from './pieces'
import {
  emptyForm,
  formFromPiece,
  frameHasContent,
  friendlyDbError,
  imageCountOption,
  planFrameCount,
  piecePayload,
  productionMoves,
  productionSteps,
  switchKind,
  switchStoryType,
  targetFrameCount,
  validatePieceForm,
  type PieceFormValues,
} from './pieceForm'

// Formulario con el tipo y el formato ya elegidos.
const post = (): PieceFormValues => ({ ...emptyForm(), kind: 'publication', format: 'post' })
const story = (extra: Partial<PieceFormValues> = {}): PieceFormValues => ({
  ...emptyForm(),
  title: 'Historia',
  kind: 'story',
  format: 'story',
  ...extra,
})

describe('validación del formulario de pieza', () => {
  it('pide título', () => {
    expect(validatePieceForm({ ...post(), title: '   ' }).title).toBe('El título es obligatorio.')
  })

  it('con título y formato alcanza', () => {
    expect(validatePieceForm({ ...post(), title: 'Idea' })).toEqual({})
  })

  it('los enlaces tienen que ser http(s)', () => {
    const errors = validatePieceForm({ ...post(), title: 'Idea', canva_url: 'javascript:alert(1)' })
    expect(errors.canva_url).toBeDefined()
    expect(validatePieceForm({ ...post(), title: 'Idea', canva_url: 'https://canva.com/x' })).toEqual({})
  })

  it('no deja sacar el formato reel si está en un estado de grabación', () => {
    const values = { ...post(), title: 'Reel' }
    expect(validatePieceForm(values, 'awaiting_recording').format).toBeDefined()
    expect(validatePieceForm(values, 'recorded').format).toBeDefined()
    expect(validatePieceForm(values, 'done')).toEqual({})
  })
})

describe('lo que se guarda', () => {
  it('convierte vacíos en null y nunca incluye estados', () => {
    const payload = piecePayload({ ...emptyForm(), title: '  Idea  ', objective: 'leads' })
    expect(payload.title).toBe('Idea')
    expect(payload.estimated_date).toBeNull()
    expect(payload.pillar_id).toBeNull()
    expect(payload.objective).toBe('leads')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('review_status')
    expect(payload).not.toHaveProperty('review_note')
  })
})

describe('descripción / idea', () => {
  it('es opcional: vacía no bloquea el guardado', () => {
    expect(validatePieceForm({ ...post(), title: 'Idea', description: '' })).toEqual({})
    expect(piecePayload({ ...emptyForm(), title: 'Idea', description: '   ' }).description).toBeNull()
  })

  it('se guarda al crear y al editar (texto largo, con saltos de línea)', () => {
    const text = 'Mostrar el antes y después de la obra.\n\nCerrar con la familia.'
    expect(piecePayload({ ...emptyForm(), title: 'Idea', description: `  ${text}  ` }).description).toBe(text)
  })

  it('se lee de la pieza guardada y no toca otros campos', () => {
    const piece = { title: 'Idea', format: 'post', interaction: 'none', needs_client_on_camera: false, description: 'La idea' } as PieceDetail
    const values = formFromPiece(piece)
    expect(values.description).toBe('La idea')
    expect(values.objective).toBe('')
    expect(values.publish_copy).toBe('')
    expect(formFromPiece({ ...piece, description: null }).description).toBe('')
  })
})

describe('estado de producción', () => {
  it('reels tienen los pasos de grabación; el resto no', () => {
    expect(productionSteps('reel')).toEqual(['todo', 'awaiting_recording', 'recorded', 'done'])
    expect(productionSteps('carousel')).toEqual(['todo', 'done'])
  })

  it('ofrece los otros pasos y archivar; nunca Publicada', () => {
    const moves = productionMoves('post', 'todo')
    expect(moves).toEqual([
      { to: 'done', kind: 'step' },
      { to: 'archived', kind: 'archive' },
    ])
    expect(productionMoves('reel', 'recorded').map((m) => m.to)).toEqual(['todo', 'awaiting_recording', 'done', 'archived'])
    expect(productionMoves('reel', 'todo').some((m) => m.to === 'published')).toBe(false)
  })

  it('una archivada solo se puede desarchivar (vuelve a Por hacer)', () => {
    expect(productionMoves('post', 'archived')).toEqual([{ to: 'todo', kind: 'restore' }])
  })

  it('una publicada no se toca acá (paso 6)', () => {
    expect(productionMoves('post', 'published')).toEqual([])
  })
})

describe('errores de la base', () => {
  it('traduce los códigos más comunes', () => {
    expect(friendlyDbError({ code: '42501' })).toMatch(/permiso/)
    expect(friendlyDbError({ code: '23503' })).toMatch(/no corresponde a este cliente/)
    expect(friendlyDbError(null)).toMatch(/conexión/)
  })
})

describe('tipo de contenido y formato', () => {
  it('primero hay que elegir Publicación o Historia', () => {
    expect(validatePieceForm({ ...emptyForm(), title: 'Idea' }).kind).toBeDefined()
  })

  it('Publicación: Post, Carrusel y Reel; hay que elegir uno', () => {
    expect(validatePieceForm({ ...post(), format: '' }).format).toBe('Elegí un formato.')
    for (const format of ['post', 'carousel', 'reel'] as const) {
      const values = { ...post(), title: 'Idea', format }
      expect(validatePieceForm(values)).toEqual({})
      expect(piecePayload(values)).toMatchObject({ format, story_type: null })
    }
  })

  it('Historia: Imagen, Serie de imágenes y Video se guardan como story + story_type', () => {
    expect(validatePieceForm(story()).story_type).toBe('Elegí un formato.')
    for (const story_type of ['image', 'video'] as const) {
      expect(validatePieceForm(story({ story_type }))).toEqual({})
      expect(piecePayload(story({ story_type }))).toMatchObject({ format: 'story', story_type })
    }
    expect(piecePayload(story({ story_type: 'image_series', image_count: '4' }))).toMatchObject({
      format: 'story',
      story_type: 'image_series',
    })
  })

  it('una historia anterior (sin formato) se puede editar sin elegirlo', () => {
    expect(validatePieceForm(story(), 'todo')).toEqual({})
    expect(piecePayload(story()).story_type).toBeNull()
  })

  it('Serie de imágenes: pide la cantidad y acepta de 2 a 8 y "8 o más"', () => {
    expect(validatePieceForm(story({ story_type: 'image_series' })).image_count).toBeDefined()
    for (const image_count of ['2', '3', '4', '5', '6', '7', '8', '8+'] as const) {
      expect(validatePieceForm(story({ story_type: 'image_series', image_count }))).toEqual({})
    }
    // Al editar, alcanza con las pantallas que ya tiene.
    expect(validatePieceForm(story({ story_type: 'image_series' }), 'todo', { frameCount: 3 })).toEqual({})
    expect(validatePieceForm(story({ story_type: 'image_series' }), 'todo', { frameCount: 1 }).image_count).toBeDefined()
  })

  it('interacción en historias: No, o Sí con Encuesta / Caja de preguntas / Elegí la respuesta correcta', () => {
    expect(piecePayload(story({ story_type: 'image', has_interaction: false, interaction: 'poll' })).interaction).toBe('none')
    expect(validatePieceForm(story({ story_type: 'image', has_interaction: true })).interaction).toBe('Elegí el tipo de interacción.')
    for (const interaction of ['poll', 'question', 'quiz'] as const) {
      const values = story({ story_type: 'image', has_interaction: true, interaction })
      expect(validatePieceForm(values)).toEqual({})
      expect(piecePayload(values).interaction).toBe(interaction)
    }
  })
})

describe('cambiar entre Publicación e Historia', () => {
  it('Historia → Publicación descarta formato de historia, cantidad e interacción, y lo avisa', () => {
    const from = story({ story_type: 'image_series', image_count: '5', has_interaction: true, interaction: 'poll' })
    const { values, lost } = switchKind(from, 'publication')
    expect(lost).toHaveLength(3)
    expect(values).toMatchObject({ kind: 'publication', format: '', story_type: '', image_count: '', has_interaction: false, interaction: 'none' })
  })

  it('Publicación → Historia descarta el guion del reel, y lo avisa', () => {
    const { values, lost } = switchKind({ ...post(), format: 'reel', script: 'Toma 1' }, 'story')
    expect(lost).toEqual(['el guion (solo para reels)'])
    expect(values).toMatchObject({ kind: 'story', format: 'story', script: '' })
  })

  it('sin datos que perder no hay nada que confirmar', () => {
    expect(switchKind(emptyForm(), 'story').lost).toEqual([])
    expect(switchKind(post(), 'story').lost).toEqual([])
    expect(switchKind(story({ story_type: 'image' }), 'publication').lost).toHaveLength(1)
  })

  it('dejar de ser serie borra la cantidad elegida', () => {
    expect(switchStoryType(story({ story_type: 'image_series', image_count: '6' }), 'video').image_count).toBe('')
  })
})

describe('pantallas de una historia', () => {
  const frame = (position: number, headline: string | null = null) => ({
    id: `f${position}`, position, label: null, headline, body: null, visual_direction: null, closing: null, interaction: null,
  })

  it('al crear una serie se crean tantas pantallas como imágenes ("8 o más" crea 8)', () => {
    expect(targetFrameCount(story({ story_type: 'image_series', image_count: '3' }), null, 0)).toBe(3)
    expect(targetFrameCount(story({ story_type: 'image_series', image_count: '8+' }), null, 0)).toBe(8)
    expect(targetFrameCount(story({ story_type: 'image' }), null, 0)).toBeNull()
    expect(targetFrameCount({ ...post(), format: 'carousel' }, null, 0)).toBeNull()
  })

  it('al editar: cambiar la cantidad ajusta las pantallas; "8 o más" no quita las que ya hay', () => {
    const initial = story({ story_type: 'image_series' })
    expect(targetFrameCount(story({ story_type: 'image_series', image_count: '2' }), initial, 5)).toBe(2)
    expect(targetFrameCount(story({ story_type: 'image_series', image_count: '8+' }), initial, 10)).toBeNull()
    expect(targetFrameCount(story({ story_type: 'image_series' }), initial, 5)).toBeNull()
    expect(targetFrameCount(story({ story_type: 'video' }), initial, 5)).toBe(1)
    expect(targetFrameCount(story({ story_type: 'image' }), story({ story_type: 'image' }), 3)).toBeNull()
  })

  it('agrega al final o quita las últimas, y detecta si tenían contenido', () => {
    const frames = [frame(1, 'Hola'), frame(2), frame(3, 'Chau')]
    expect(planFrameCount(frames, 5)).toEqual({ add: [4, 5], remove: [] })
    const plan = planFrameCount(frames, 1)
    expect(plan.remove.map((f) => f.position)).toEqual([2, 3])
    expect(plan.remove.filter(frameHasContent)).toHaveLength(1)
  })

  it('la opción del selector refleja las pantallas reales y respeta "8 o más"', () => {
    expect(imageCountOption(1)).toBe('')
    expect(imageCountOption(5)).toBe('5')
    expect(imageCountOption(8)).toBe('8')
    expect(imageCountOption(8, true)).toBe('8+')
    expect(imageCountOption(11)).toBe('8+')
    expect(imageCountOption(5, true)).toBe('5')
  })

  it('"8 o más" se guarda como marca y no como "8"', () => {
    const open = story({ story_type: 'image_series', image_count: '8+', images_open: true })
    expect(piecePayload(open).story_images_open).toBe(true)
    expect(piecePayload(story({ story_type: 'image_series', image_count: '8' })).story_images_open).toBe(false)
    // Al editar, sin tocar la cantidad, alcanza con la marca guardada.
    expect(validatePieceForm(story({ story_type: 'image_series', images_open: true }), 'todo', { frameCount: 0 })).toEqual({})
    // Dejar de ser serie (o pasar a publicación) quita la marca.
    expect(switchStoryType(open, 'image').images_open).toBe(false)
    const toPost = switchKind({ ...open, image_count: '' }, 'publication')
    expect(toPost.values.images_open).toBe(false)
    expect(toPost.lost).toContain('la cantidad de imágenes (8 o más)')
  })
})

describe('piezas existentes', () => {
  it('se cargan con su tipo y formato, sin cambiar nada al guardar', () => {
    const base = { title: 'X', description: null, story_type: null, story_images_open: false, needs_client_on_camera: false } as unknown as PieceDetail
    for (const format of ['post', 'carousel', 'reel'] as const) {
      const values = formFromPiece({ ...base, format, interaction: 'none' })
      expect(values.kind).toBe('publication')
      expect(validatePieceForm(values, 'todo')).toEqual({})
      expect(piecePayload(values)).toMatchObject({ format, story_type: null, interaction: 'none' })
    }
    const oldStory = formFromPiece({ ...base, format: 'story', interaction: 'slider' })
    expect(oldStory).toMatchObject({ kind: 'story', story_type: '', has_interaction: true })
    expect(validatePieceForm(oldStory, 'done')).toEqual({})
    expect(piecePayload(oldStory)).toMatchObject({ format: 'story', story_type: null, interaction: 'slider' })
    // Un post que ya tenía interacción la conserva.
    expect(piecePayload(formFromPiece({ ...base, format: 'carousel', interaction: 'quiz' })).interaction).toBe('quiz')
  })
})
