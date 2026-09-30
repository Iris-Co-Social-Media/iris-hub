import { useEffect, useState } from 'react'
import { copyText } from '../lib/clipboard'

// Botón "copiar con un toque" (docs/ARQUITECTURA.md §4). Muestra "Copiado"
// un momento para confirmar. Solo aparece si hay texto para copiar.
export function CopyButton({
  text,
  label = 'Copiar',
  what,
  variant = 'small',
}: {
  text: string
  label?: string
  what: string // para lectores de pantalla: "Copiar texto principal"
  variant?: 'small' | 'large'
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const id = window.setTimeout(() => setState('idle'), 1800)
    return () => window.clearTimeout(id)
  }, [state])

  if (!text.trim()) return null

  async function handleClick() {
    setState((await copyText(text)) ? 'copied' : 'error')
  }

  const size =
    variant === 'large' ? 'px-4 py-2.5 text-sm' : 'min-h-9 px-3 py-1.5 text-xs'
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${label}: ${what}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-bold ${size} ${
        state === 'copied'
          ? 'bg-iris-lime text-iris-violet'
          : 'border border-iris-lavender bg-white text-iris-violet active:bg-iris-lilac'
      }`}
    >
      <span aria-live="polite">
        {state === 'copied' ? '✓ Copiado' : state === 'error' ? 'No se pudo copiar' : label}
      </span>
    </button>
  )
}
