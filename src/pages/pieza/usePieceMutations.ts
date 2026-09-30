import { useMutation, useQueryClient } from '@tanstack/react-query'
import { framePayload, type FrameFormValues } from '../../lib/frames'
import { CONFLICT_MESSAGE, friendlyDbError, piecePayload, type PieceFormValues } from '../../lib/pieceForm'
import type { PieceStatus } from '../../lib/pieces'
import { supabase } from '../../lib/supabase'

// Escrituras del paso 5b.2. Todas son directas y las protege RLS: solo el
// equipo de Iris puede crear y editar piezas y pantallas (§7). Nada de esto
// toca review_status ni review_note.
//
// Cambios al mismo tiempo: cada edición se aplica solo si el registro sigue
// como se cargó (misma updated_at o mismo estado). Si otra persona lo cambió,
// no se pisa: se avisa y se recargan los datos.

export class ConflictError extends Error {
  constructor() {
    super(CONFLICT_MESSAGE)
  }
}

function useInvalidatePieces() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['piece'] }),
      queryClient.invalidateQueries({ queryKey: ['month'] }),
      queryClient.invalidateQueries({ queryKey: ['review'] }),
    ])
}

export function useCreatePiece() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: async (input: { clientId: string; planId: string; values: PieceFormValues }) => {
      // status y review_status quedan con los valores por defecto de la base
      // (Por hacer / Sin revisar); created_by lo completa la base.
      const { data, error } = await supabase()
        .from('pieces')
        .insert({ client_id: input.clientId, monthly_plan_id: input.planId, ...piecePayload(input.values) })
        .select('id')
        .single<{ id: string }>()
      if (error) throw new Error(friendlyDbError(error))
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useUpdatePiece() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: async (input: { pieceId: string; loadedUpdatedAt: string; values: PieceFormValues }) => {
      const { data, error } = await supabase()
        .from('pieces')
        .update(piecePayload(input.values))
        .eq('id', input.pieceId)
        .eq('updated_at', input.loadedUpdatedAt)
        .select('id, updated_at')
        .returns<{ id: string; updated_at: string }[]>()
      if (error) throw new Error(friendlyDbError(error))
      if (!data || data.length === 0) throw new ConflictError()
      return data[0].updated_at
    },
    onSettled: invalidate,
  })
}

export function useSetProductionStatus() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: async (input: { pieceId: string; from: PieceStatus; to: PieceStatus }) => {
      if (input.to === 'published') throw new Error('Marcar como Publicada llega en el paso 6.')
      const { data, error } = await supabase()
        .from('pieces')
        .update({ status: input.to })
        .eq('id', input.pieceId)
        .eq('status', input.from)
        .select('id')
      if (error) throw new Error(friendlyDbError(error))
      if (!data || data.length === 0) {
        throw new Error('No se pudo cambiar el estado: puede que ya haya cambiado o que no tengas permiso. Recargamos la pieza.')
      }
    },
    onSettled: invalidate,
  })
}

// ---------------------------------------------------------------------------
// Pantallas
// ---------------------------------------------------------------------------

export function useAddFrame() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: async (input: { pieceId: string; position: number; label: string | null }) => {
      const { error } = await supabase()
        .from('piece_frames')
        .insert({ piece_id: input.pieceId, position: input.position, label: input.label })
      if (error) throw new Error(friendlyDbError(error))
    },
    onSettled: invalidate,
  })
}

export function useUpdateFrame() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: async (input: { frameId: string; loadedUpdatedAt: string | undefined; values: FrameFormValues }) => {
      let query = supabase().from('piece_frames').update(framePayload(input.values)).eq('id', input.frameId)
      if (input.loadedUpdatedAt) query = query.eq('updated_at', input.loadedUpdatedAt)
      const { data, error } = await query.select('id, updated_at').returns<{ id: string; updated_at: string }[]>()
      if (error) throw new Error(friendlyDbError(error))
      if (!data || data.length === 0) throw new ConflictError()
      return data[0].updated_at
    },
    onSettled: invalidate,
  })
}

async function applyPositions(changes: { id: string; position: number }[]) {
  for (const change of changes) {
    const { error } = await supabase().from('piece_frames').update({ position: change.position }).eq('id', change.id)
    if (error) throw new Error(friendlyDbError(error))
  }
}

export function useDeleteFrame() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: async (input: { frameId: string; renumber: { id: string; position: number }[] }) => {
      const { data, error } = await supabase().from('piece_frames').delete().eq('id', input.frameId).select('id')
      if (error) throw new Error(friendlyDbError(error))
      if (!data || data.length === 0) throw new Error('No se pudo quitar la pantalla: puede que ya no exista o que no tengas permiso.')
      await applyPositions(input.renumber)
    },
    onSettled: invalidate,
  })
}

export function useMoveFrame() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: async (changes: { id: string; position: number }[]) => applyPositions(changes),
    onSettled: invalidate,
  })
}
