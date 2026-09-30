import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ConfigError } from './components/ConfigError.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { readEnv } from './lib/env.ts'
import { initSupabase } from './lib/supabase.ts'
import './styles/index.css'

const root = createRoot(document.getElementById('root')!)
const envResult = readEnv()

if (!envResult.ok) {
  root.render(
    <StrictMode>
      <ConfigError problems={envResult.problems} />
    </StrictMode>,
  )
} else {
  initSupabase(envResult.env)
  const queryClient = new QueryClient()
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
