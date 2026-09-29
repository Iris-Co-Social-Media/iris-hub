// Pantalla provisoria del paso 1 de la V1-alpha: solo confirma que el
// proyecto (React + Vite + TypeScript + Tailwind) compila y se publica.
// Se reemplaza en los pasos siguientes por las pantallas reales (sección 4).
export default function App() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-iris-lilac">
        <p className="text-sm font-semibold uppercase tracking-widest text-iris-violet/70">
          Iris &amp; Co
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">Planificación</h1>
        <p className="mt-4 text-base leading-relaxed">
          El sitio está funcionando. Esta es una pantalla provisoria mientras
          construimos la primera versión.
        </p>
        <div className="mt-6 flex flex-wrap gap-2" aria-hidden="true">
          <span className="h-8 w-8 rounded-full bg-iris-violet" />
          <span className="h-8 w-8 rounded-full bg-iris-lavender" />
          <span className="h-8 w-8 rounded-full bg-iris-lilac" />
          <span className="h-8 w-8 rounded-full bg-iris-lime" />
          <span className="h-8 w-8 rounded-full bg-iris-cream ring-1 ring-iris-lilac" />
        </div>
      </div>
    </main>
  )
}
