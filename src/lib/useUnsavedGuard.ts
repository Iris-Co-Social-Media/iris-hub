import { useEffect } from 'react'

// Evita perder cambios sin guardar: avisa si se cierra o recarga la pestaña.
// Para los enlaces internos, usar confirmLeave() antes de navegar.
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}

export const LEAVE_MESSAGE = 'Tenés cambios sin guardar. ¿Querés salir igual y perderlos?'

export function confirmLeave(dirty: boolean): boolean {
  return !dirty || window.confirm(LEAVE_MESSAGE)
}
