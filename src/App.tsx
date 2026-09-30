import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { FullScreenMessage } from './components/AuthLayout'
import { useAuth } from './lib/auth-context'
import { IngresoPage } from './pages/ingreso/IngresoPage'
import { InicioPage } from './pages/inicio/InicioPage'
import { MesPage } from './pages/mes/MesPage'
import { PiezaPage } from './pages/pieza/PiezaPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/ingreso"
          element={
            <OnlySignedOut>
              <IngresoPage />
            </OnlySignedOut>
          }
        />
        <Route
          path="/"
          element={
            <RequireSession>
              <InicioPage />
            </RequireSession>
          }
        />
        <Route
          path="/:slug/mes/:month?"
          element={
            <RequireSession>
              <MesPage />
            </RequireSession>
          }
        />
        <Route
          path="/:slug/pieza/:pieceId"
          element={
            <RequireSession>
              <PiezaPage />
            </RequireSession>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// Pantallas que exigen sesión. Si no hay, va a /ingreso conservando la
// dirección (por si vuelve de Google con un aviso de error).
function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) {
    return <Navigate to={{ pathname: '/ingreso', search: location.search, hash: location.hash }} replace />
  }
  return children
}

function OnlySignedOut({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  if (session) return <Navigate to="/" replace />
  return children
}

function Loading() {
  return (
    <FullScreenMessage>
      <p className="text-sm font-semibold">Cargando…</p>
    </FullScreenMessage>
  )
}
