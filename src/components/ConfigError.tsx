import { AuthLayout } from './AuthLayout'

// Se muestra si faltan (o están mal) las variables de Supabase al compilar.
export function ConfigError({ problems }: { problems: string[] }) {
  return (
    <AuthLayout>
      <h2 className="text-lg font-bold">Falta configurar el sitio</h2>
      <p className="mt-2 text-sm leading-relaxed">
        No se encontraron bien los datos de conexión con Supabase. Revisá las variables de entorno
        (ver <code>docs/INGRESO.md</code>).
      </p>
      <ul className="mt-3 list-disc pl-5 text-sm">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </AuthLayout>
  )
}
