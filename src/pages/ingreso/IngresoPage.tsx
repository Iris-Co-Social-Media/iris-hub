import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { AuthLayout } from '../../components/AuthLayout'
import { OTP_LENGTH, OTP_MINUTES, RESEND_SECONDS } from '../../lib/constants'
import { supabase } from '../../lib/supabase'
import { authRedirectUrl } from '../../lib/urls'

// Ingreso (sección 2.3). Regla de privacidad: la pantalla NUNCA dice si un
// mail está invitado. Siempre pasa al paso del código con el mismo mensaje;
// la base de datos (hook de invitación) decide si se envía o no el mail.

const emailSchema = z.email()
const codeSchema = z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`))

const CONNECTION_ERROR = 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.'

type Step = { kind: 'email' } | { kind: 'code'; email: string }

export function IngresoPage() {
  const [step, setStep] = useState<Step>({ kind: 'email' })
  const oauthError = useOAuthError()

  return (
    <AuthLayout>
      {step.kind === 'email' ? (
        <EmailStep oauthError={oauthError} onSent={(email) => setStep({ kind: 'code', email })} />
      ) : (
        <CodeStep email={step.email} onBack={() => setStep({ kind: 'email' })} />
      )}
    </AuthLayout>
  )
}

function EmailStep({ oauthError, onSent }: { oauthError: boolean; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(
    oauthError
      ? 'No se pudo completar el ingreso con Google. Si creés que deberías tener acceso, escribile a Iris & Co.'
      : null,
  )
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!emailSchema.safeParse(normalized).success) {
      setError('Escribí un mail válido.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await sendCode(normalized)
    setBusy(false)
    if (result === 'connection-error') {
      setError(CONNECTION_ERROR)
      return
    }
    onSent(normalized)
  }

  async function handleGoogle() {
    setBusy(true)
    setError(null)
    const { error: oauthStartError } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    })
    if (oauthStartError) {
      setBusy(false)
      setError(CONNECTION_ERROR)
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold">Ingresá</h2>
      <form className="mt-4 space-y-3" onSubmit={handleSubmit} noValidate>
        <label className="block">
          <span className="text-sm font-semibold">Tu mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-iris-lavender bg-white px-4 py-3 text-base outline-none focus:border-iris-violet focus:ring-2 focus:ring-iris-lavender"
            placeholder="nombre@ejemplo.com"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-iris-violet px-4 py-3 text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Enviando…' : 'Recibir código'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-sm text-iris-violet/60" aria-hidden="true">
        <span className="h-px flex-1 bg-iris-lilac" />o<span className="h-px flex-1 bg-iris-lilac" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="w-full rounded-xl border border-iris-lavender bg-white px-4 py-3 text-base font-bold disabled:opacity-60"
      >
        Entrar con Google
      </button>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-iris-lilac px-4 py-3 text-sm">
          {error}
        </p>
      )}
    </>
  )
}

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const secondsLeft = useCountdown(RESEND_SECONDS)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const token = code.replace(/\s/g, '')
    if (!codeSchema.safeParse(token).success) {
      setError(`El código tiene ${OTP_LENGTH} números.`)
      return
    }
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase().auth.verifyOtp({ email, token, type: 'email' })
    setBusy(false)
    if (verifyError) {
      setError(
        isAuthRetryableFetchError(verifyError)
          ? CONNECTION_ERROR
          : 'El código no es correcto o ya venció. Revisá el mail o pedí uno nuevo.',
      )
      return
    }
    navigate('/', { replace: true })
  }

  async function handleResend() {
    setBusy(true)
    setError(null)
    setInfo(null)
    const result = await sendCode(email)
    setBusy(false)
    if (result === 'connection-error') {
      setError(CONNECTION_ERROR)
      return
    }
    secondsLeft.restart()
    setInfo('Si tu mail está invitado, te enviamos un código nuevo.')
  }

  return (
    <>
      <h2 className="text-lg font-bold">Revisá tu mail</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Si <strong className="break-all">{email}</strong> está invitado, te enviamos un código de{' '}
        {OTP_LENGTH} números. Vence en {OTP_MINUTES} minutos y sirve una sola vez.
      </p>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit} noValidate>
        <label className="block">
          <span className="text-sm font-semibold">Código</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={OTP_LENGTH + 2}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-iris-lavender bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-iris-violet focus:ring-2 focus:ring-iris-lavender"
            placeholder={'•'.repeat(OTP_LENGTH)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-iris-violet px-4 py-3 text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-iris-lilac px-4 py-3 text-sm">
          {error}
        </p>
      )}
      {info && !error && <p className="mt-4 rounded-xl bg-iris-lime px-4 py-3 text-sm">{info}</p>}

      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
        <button type="button" onClick={onBack} className="font-semibold underline">
          Usar otro mail
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={busy || secondsLeft.value > 0}
          className="font-semibold underline disabled:no-underline disabled:opacity-60"
        >
          {secondsLeft.value > 0 ? `Reenviar código (${secondsLeft.value})` : 'Reenviar código'}
        </button>
      </div>
    </>
  )
}

// Pide el código. Cualquier respuesta de Supabase (enviado, mail no invitado,
// límite de envíos) se trata igual, para no revelar invitaciones. Solo se
// distingue la falta de conexión.
//
// El ingreso es con el código de 6 dígitos (las plantillas de mail solo
// muestran {{ .Token }}). emailRedirectTo es un resguardo: si un mail llegara
// con link, vuelve a este mismo sitio y no al "Site URL" de Supabase.
async function sendCode(email: string): Promise<'done' | 'connection-error'> {
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: authRedirectUrl() },
  })
  if (error && isAuthRetryableFetchError(error)) return 'connection-error'
  return 'done'
}

// Si Google (o el hook de invitación) rechazó el ingreso, Supabase vuelve al
// sitio con ?error=… en la dirección. Se muestra un aviso y se limpia la URL.
function useOAuthError(): boolean {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search || location.hash.replace(/^#/, ''))
  const hasError = params.has('error') || params.has('error_description')

  useEffect(() => {
    if (hasError) navigate('/ingreso', { replace: true })
  }, [hasError, navigate])

  const [shown] = useState(hasError)
  return shown
}

function useCountdown(seconds: number) {
  const [deadline, setDeadline] = useState(() => Date.now() + seconds * 1000)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return {
    value: Math.max(0, Math.ceil((deadline - now) / 1000)),
    restart: () => {
      const current = Date.now()
      setNow(current)
      setDeadline(current + seconds * 1000)
    },
  }
}
