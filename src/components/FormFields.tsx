import type { ReactNode } from 'react'

// Campos de formulario con los estilos de Iris & Co. Texto grande (16px) para
// que el celular no haga zoom al escribir.

const inputClass =
  'mt-1 block w-full rounded-xl border border-iris-lavender bg-white px-3 py-2.5 text-base outline-none focus:border-iris-violet focus:ring-2 focus:ring-iris-lavender'

function Wrapper({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-bold">{label}</span>
      {hint && <span className="block text-xs text-iris-violet/70">{hint}</span>}
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-sm font-semibold text-iris-violet">
          ⚠ {error}
        </span>
      )}
    </label>
  )
}

export function TextField({
  label,
  hint,
  error,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  min,
  max,
}: {
  label: string
  hint?: string
  error?: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'date' | 'url'
  placeholder?: string
  required?: boolean
  min?: string
  max?: string
}) {
  return (
    <Wrapper label={label + (required ? ' *' : '')} hint={hint} error={error}>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        aria-invalid={Boolean(error)}
        className={inputClass}
      />
    </Wrapper>
  )
}

export function TextArea({
  label,
  hint,
  error,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string
  hint?: string
  error?: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <Wrapper label={label} hint={hint} error={error}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={inputClass}
      />
    </Wrapper>
  )
}

export function SelectField({
  label,
  hint,
  error,
  value,
  onChange,
  options,
  emptyLabel,
  required,
}: {
  label: string
  hint?: string
  error?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  emptyLabel?: string // opción "sin elegir"
  required?: boolean
}) {
  return (
    <Wrapper label={label + (required ? ' *' : '')} hint={hint} error={error}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  )
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-iris-lavender">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-iris-violet"
      />
      <span className="text-sm font-bold">{label}</span>
    </label>
  )
}

// Opciones de una sola elección, como botones (radio). Sirve para listas
// cortas: se ven todas a la vez y se eligen con un toque.
export function ChoiceField({
  label,
  hint,
  error,
  name,
  value,
  onChange,
  options,
  required,
}: {
  label: string
  hint?: string
  error?: string
  name: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  required?: boolean
}) {
  return (
    <fieldset className="min-w-0" aria-invalid={Boolean(error)}>
      <legend className="text-sm font-bold">{label + (required ? ' *' : '')}</legend>
      {hint && <span className="block text-xs text-iris-violet/70">{hint}</span>}
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center rounded-xl border border-iris-lavender bg-white px-4 py-2 text-sm font-bold has-checked:border-iris-violet has-checked:bg-iris-violet has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-iris-lavender"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <span role="alert" className="mt-1 block text-sm font-semibold text-iris-violet">
          ⚠ {error}
        </span>
      )}
    </fieldset>
  )
}
