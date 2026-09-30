import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { PieceDetail } from '../../lib/pieces'
import { canShowPublish, publishErrorMessage } from '../../lib/publish'
import { supabase } from '../../lib/supabase'

// "Marcar como publicada" (paso 6). La base (mark_published) vuelve a validar
// permiso y estado: el botón solo evita mostrar algo que no va a funcionar.
export function PublishControl({ piece }: { piece: PieceDetail }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const permission = useQuery({
    queryKey: ['perm', piece.client_id, 'can_mark_published'],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase().rpc('has_perm', {
        p_client_id: piece.client_id,
        p_permission: 'can_mark_published',
      })
      if (error) throw error
      return Boolean(data)
    },
    staleTime: 5 * 60_000,
  })

  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase().rpc('mark_published', { p_piece_id: piece.id })
      if (error) throw new Error(publishErrorMessage(error))
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['piece'] }),
        queryClient.invalidateQueries({ queryKey: ['month'] }),
        queryClient.invalidateQueries({ queryKey: ['review'] }),
      ]),
  })

  const error = publish.error?.message ?? null
  if (!canShowPublish(piece.status, permission.data ?? false)) {
    // Si falló porque otra persona la publicó, el aviso se sigue viendo.
    return error ? <p role="alert" className="mt-4 rounded-xl bg-iris-lilac px-4 py-3 text-sm">{error}</p> : null
  }

  return (
    <section aria-label="Publicación" className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-iris-lilac">
      {confirming ? (
        <div role="dialog" aria-label="Marcar como publicada">
          <p className="text-sm font-bold">¿Ya está subida a Instagram?</p>
          <p className="mt-1 text-sm">
            La pieza pasa a <strong>Publicada</strong> con la fecha de hoy. No cambia la revisión ni los textos.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={publish.isPending}
              onClick={() => publish.mutate(undefined, { onSettled: () => setConfirming(false) })}
              className="min-h-11 rounded-xl bg-iris-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {publish.isPending ? 'Guardando…' : 'Sí, marcar como publicada'}
            </button>
            <button
              type="button"
              disabled={publish.isPending}
              onClick={() => setConfirming(false)}
              className="min-h-11 rounded-xl border border-iris-lavender bg-white px-4 py-2.5 text-sm font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            publish.reset()
            setConfirming(true)
          }}
          className="min-h-11 w-full rounded-xl bg-iris-violet px-4 py-2.5 text-sm font-bold text-white sm:w-auto"
        >
          ✓ Marcar como publicada
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-iris-lilac px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </section>
  )
}
