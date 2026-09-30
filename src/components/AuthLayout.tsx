import type { ReactNode } from 'react'

// Marco de las pantallas de ingreso y bienvenida: tarjeta centrada, cómoda
// en el celular.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-iris-lilac sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-iris-violet/70">
          Iris &amp; Co
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">Planificación</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4 text-center">
      <div>{children}</div>
    </main>
  )
}
