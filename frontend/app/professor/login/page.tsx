'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react'
import GuestGuard from '@/components/GuestGuard'
import KrescoWordmark from '@/components/KrescoWordmark'
import { postJson } from '@/lib/apiClient'
import { AUTH_ROUTES, isProfessorUser } from '@/lib/authPolicy'
import { getFirebaseEmailPasswordIdToken, isFirebaseEmailNotVerifiedError } from '@/lib/firebaseAuth'
import { useAuthStore } from '@/lib/store'
import { localizedCopy } from '@/lib/localization'

type LoginResponse = {
  user: {
    id: number
    email: string
    full_name: string
    role: string
    tier?: string
  }
  csrf_token?: string
}

export default function ProfessorLoginPage() {
  const router = useRouter()
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()
  const hasCredentials = normalizedEmail.length > 0 && password.length > 0
  const canSubmit = hasCredentials && !loading
  const professorLoginFieldDescription = `professor-login-help${error ? ' professor-login-error' : ''}`

  function updateEmail(value: string) {
    setEmail(value)
    if (error) setError('')
  }

  function updatePassword(value: string) {
    setPassword(value)
    if (error) setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!normalizedEmail || !password) {
      setError('Renseignez email professeur et mot de passe.')
      return
    }
    setLoading(true)
    try {
      const credential = await getFirebaseEmailPasswordIdToken(normalizedEmail, password)
      const data = await postJson<LoginResponse>('/auth/firebase-session', { credential })
      if (!isProfessorUser(data.user)) {
        await logout()
        setError(localizedCopy.auth.professorOnlyError)
        return
      }
      login(data.user, data.csrf_token)
      router.replace(AUTH_ROUTES.professorHome)
    } catch (caught) {
      if (isFirebaseEmailNotVerifiedError(caught)) {
        setError(localizedCopy.auth.verifyEmailBeforeLogin)
        return
      }
      setError(errorMessage(caught, localizedCopy.auth.professorLoginFailed))
    } finally {
      setLoading(false)
    }
  }

  return (
    <GuestGuard authenticatedRedirectMode="professor-only">
      <main className="grid min-h-[100svh] place-items-center overflow-y-auto bg-[#fbfbfc] px-4 py-10">
        <section className="w-full max-w-[440px] rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-6 shadow-[0_18px_44px_rgba(24,24,27,0.06)]">
          <div className="mb-8 flex items-center justify-between gap-4">
            <KrescoWordmark />
            <span className="rounded-[12px] bg-[#f0f0ff] px-3 py-2 text-[12px] font-black text-[#453dee]">{localizedCopy.auth.professorBadge}</span>
          </div>
          <div className="mb-7">
            <h1 className="m-0 text-[24px] font-black leading-[1.12] text-[#3f3f46]">{localizedCopy.auth.professorLoginTitle}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-[#71717b]">{localizedCopy.auth.professorLoginBody}</p>
          </div>
          <form className="grid gap-4" onSubmit={submit} aria-busy={loading}>
            <div className="grid gap-2">
              <label htmlFor="professor-email" className="text-[13px] font-black text-[#52525c]">
                {localizedCopy.auth.email}
              </label>
              <div className="flex h-12 items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-4 transition-[border-color,box-shadow] duration-200 focus-within:border-[#453dee] focus-within:shadow-[0_0_0_3px_rgba(69,61,238,0.12)]">
                <Mail size={17} className="text-[#71717b]" aria-hidden="true" />
                <input
                  id="professor-email"
                  aria-label={localizedCopy.auth.email}
                  aria-describedby={professorLoginFieldDescription}
                  aria-invalid={error ? 'true' : undefined}
                  value={email}
                  onChange={(event) => updateEmail(event.target.value)}
                  type="email"
                  required
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#3f3f46] outline-none"
                  placeholder={localizedCopy.auth.professorEmailPlaceholder}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label htmlFor="professor-password" className="text-[13px] font-black text-[#52525c]">
                {localizedCopy.auth.password}
              </label>
              <div className="flex h-12 items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-4 transition-[border-color,box-shadow] duration-200 focus-within:border-[#453dee] focus-within:shadow-[0_0_0_3px_rgba(69,61,238,0.12)]">
                <LockKeyhole size={17} className="text-[#71717b]" aria-hidden="true" />
                <input
                  id="professor-password"
                  aria-label={localizedCopy.auth.password}
                  aria-describedby={professorLoginFieldDescription}
                  aria-invalid={error ? 'true' : undefined}
                  value={password}
                  onChange={(event) => updatePassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#3f3f46] outline-none"
                  placeholder={localizedCopy.auth.passwordPlaceholder}
                />
                <button
                  type="button"
                  aria-label={showPassword ? localizedCopy.auth.hidePassword : localizedCopy.auth.showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-0 bg-transparent text-[#71717b] transition hover:bg-[#f4f4f5] hover:text-[#3f3f46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#453dee] focus-visible:ring-offset-2"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <section
              id="professor-login-help"
              aria-label="Professor login requirements"
              aria-live="polite"
              className="flex items-start gap-3 rounded-[14px] border border-[#e4e4e7] bg-[#fbfbfc] px-3 py-3"
            >
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  hasCredentials ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f0f0ff] text-[#453dee]'
                }`}
                aria-hidden="true"
              >
                {hasCredentials ? <CheckCircle2 size={16} /> : <LockKeyhole size={16} />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 text-[13px] font-black text-[#3f3f46]">Compte professeur</p>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-black ${
                      hasCredentials ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-[#71717b]'
                    }`}
                  >
                    {hasCredentials ? 'Pret a verifier' : 'Email et mot de passe requis'}
                  </span>
                </div>
                <p className="m-0 mt-1 text-[12px] font-bold leading-[1.45] text-[#71717b]">
                  Connectez-vous avec l&apos;email rattache a votre espace professeur.
                </p>
              </div>
            </section>

            {error && (
              <p
                id="professor-login-error"
                className="m-0 flex items-start gap-2 rounded-[12px] bg-red-50 px-3 py-2 text-[13px] font-bold leading-[1.45] text-red-600"
                role="alert"
              >
                <AlertCircle size={15} className="mt-[2px] shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border-0 bg-[#453dee] px-5 text-[15px] font-black text-white shadow-[0_8px_22px_rgba(69,61,238,0.18)] transition-[background-color,opacity,transform,box-shadow] duration-200 hover:bg-[#3a2fd3] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#453dee] focus-visible:ring-offset-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  {localizedCopy.auth.loginLoading}
                </>
              ) : localizedCopy.auth.professorLoginAction}
            </button>
          </form>
        </section>
      </main>
    </GuestGuard>
  )
}

function errorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { detail?: unknown } } }
  if (typeof maybe?.response?.data?.detail === 'string') return maybe.response.data.detail
  if (error instanceof Error && error.message) return error.message
  return fallback
}
