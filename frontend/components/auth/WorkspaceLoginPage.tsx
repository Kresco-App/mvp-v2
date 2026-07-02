'use client'

import { FormEvent, Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'

import GuestGuard from '@/components/GuestGuard'
import KrescoWordmark from '@/components/KrescoWordmark'
import { postJson } from '@/lib/apiClient'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  AUTH_ROUTES,
  getSafePostLoginDestination,
  isStaffRoute,
  isStaffUser,
} from '@/lib/authPolicy'
import type { AuthUser } from '@/lib/authSession'
import { useAuthStore } from '@/lib/store'

type WorkspaceLoginKind = 'admin' | 'staff'

type LoginResponse = {
  user: AuthUser
  csrf_token?: string
}

type WorkspaceLoginPageProps = {
  requestHost: string
  forcedWorkspace?: WorkspaceLoginKind
}

const workspaceCopy: Record<WorkspaceLoginKind, {
  badge: string
  title: string
  body: string
  helperTitle: string
  helperBody: string
  submit: string
  defaultDestination: string
  denied: string
}> = {
  admin: {
    badge: 'ADMIN',
    title: 'Admin dashboard',
    body: 'Founder and operator access.',
    helperTitle: 'Admin access',
    helperBody: 'Use a staff-enabled account to open the admin workspace.',
    submit: 'Sign in to admin',
    defaultDestination: AUTH_ROUTES.adminHome,
    denied: 'This account does not have admin access.',
  },
  staff: {
    badge: 'STAFF',
    title: 'Staff payments',
    body: 'Payment-code operations.',
    helperTitle: 'Staff access',
    helperBody: 'Use an approved staff account to manage payment requests.',
    submit: 'Sign in to staff',
    defaultDestination: AUTH_ROUTES.staffHome,
    denied: 'This account does not have staff access.',
  },
}

const controlMotionClass = 'transition-[background-color,color,opacity,transform,box-shadow] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#453dee]/35 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'
const fieldMotionClass = 'transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[#453dee] focus-within:shadow-[0_0_0_3px_rgba(69,61,238,0.12)] motion-reduce:transition-none'

export default function WorkspaceLoginPage(props: WorkspaceLoginPageProps) {
  return (
    <Suspense fallback={null}>
      <WorkspaceLoginContent {...props} />
    </Suspense>
  )
}

function WorkspaceLoginContent({ requestHost, forcedWorkspace }: WorkspaceLoginPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const login = useAuthStore((state) => state.login)
  const clearSession = useAuthStore((state) => state.clearSession)
  const workspace = useMemo(
    () => forcedWorkspace ?? resolveWorkspaceLoginKind(requestHost, searchParams.get('workspace'), searchParams.get('next')),
    [forcedWorkspace, requestHost, searchParams],
  )
  const copy = workspaceCopy[workspace]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()
  const hasCredentials = normalizedEmail.length > 0 && password.length > 0
  const canSubmit = hasCredentials && !loading
  const fieldDescription = `workspace-login-help${error ? ' workspace-login-error' : ''}`

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
    if (!hasCredentials) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)
    try {
      const { getFirebaseEmailPasswordIdToken } = await import('@/lib/firebaseAuth')
      const credential = await getFirebaseEmailPasswordIdToken(normalizedEmail, password)
      const data = await postJson<LoginResponse>('/auth/firebase-session', { credential })

      if (!isStaffUser(data.user)) {
        await clearSession()
        setError(copy.denied)
        return
      }

      login(data.user, data.csrf_token)
      router.replace(resolvePostLoginDestination(workspace, data.user, searchParams.get('next'), copy.defaultDestination))
    } catch (caught) {
      if (isFirebaseEmailNotVerifiedError(caught)) {
        setError('Verify this email before signing in.')
        return
      }
      setError(apiDataErrorMessage(caught, 'Sign-in failed. Check the email and password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <GuestGuard authenticatedRedirectMode="staff-only">
      <main className="grid min-h-[100svh] place-items-center overflow-y-auto bg-[#fbfbfc] px-4 py-10">
        <section className="w-full max-w-[440px] rounded-[16px] border border-transparent bg-white p-6 shadow-[var(--shadow-border),0_18px_44px_rgba(24,24,27,0.06)]">
          <div className="mb-8 flex items-center justify-between gap-4">
            <KrescoWordmark />
            <span className="rounded-[12px] bg-[#f0f0ff] px-3 py-2 text-[12px] font-black text-[#453dee]">{copy.badge}</span>
          </div>

          <div className="mb-7">
            <h1 className="m-0 text-balance text-[24px] font-black leading-[1.12] text-[#3f3f46]">{copy.title}</h1>
            <p className="m-0 mt-2 text-pretty text-[14px] font-bold leading-[1.55] text-[#71717b]">{copy.body}</p>
          </div>

          <form className="grid gap-4" onSubmit={submit} aria-busy={loading}>
            <div className="grid gap-2">
              <label htmlFor="workspace-email" className="text-[13px] font-black text-[#52525c]">Email</label>
              <div className={`flex h-12 items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-4 ${fieldMotionClass}`}>
                <Mail size={17} className="text-[#71717b]" aria-hidden="true" />
                <input
                  id="workspace-email"
                  aria-label="Email"
                  aria-describedby={fieldDescription}
                  aria-invalid={error ? 'true' : undefined}
                  value={email}
                  onChange={(event) => updateEmail(event.target.value)}
                  type="email"
                  required
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#3f3f46] outline-none"
                  placeholder="name@kresco.ma"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label htmlFor="workspace-password" className="text-[13px] font-black text-[#52525c]">Password</label>
              <div className={`flex h-12 items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-4 ${fieldMotionClass}`}>
                <LockKeyhole size={17} className="text-[#71717b]" aria-hidden="true" />
                <input
                  id="workspace-password"
                  aria-label="Password"
                  aria-describedby={fieldDescription}
                  aria-invalid={error ? 'true' : undefined}
                  value={password}
                  onChange={(event) => updatePassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#3f3f46] outline-none"
                  placeholder="Password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-0 bg-transparent text-[#71717b] hover:bg-[#f4f4f5] hover:text-[#3f3f46] ${controlMotionClass}`}
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <section
              id="workspace-login-help"
              aria-label="Workspace login requirements"
              aria-live="polite"
              className="flex items-start gap-3 rounded-[14px] border border-[#e4e4e7] bg-[#fbfbfc] px-3 py-3"
            >
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  hasCredentials ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f0f0ff] text-[#453dee]'
                }`}
                aria-hidden="true"
              >
                {hasCredentials ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 text-[13px] font-black text-[#3f3f46]">{copy.helperTitle}</p>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-black ${
                      hasCredentials ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-[#71717b]'
                    }`}
                  >
                    {hasCredentials ? 'Ready' : 'Required'}
                  </span>
                </div>
                <p className="m-0 mt-1 text-[12px] font-bold leading-[1.45] text-[#71717b]">{copy.helperBody}</p>
              </div>
            </section>

            {error && (
              <p
                id="workspace-login-error"
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
              className={`mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border-0 bg-[#453dee] px-5 text-[15px] font-black text-white shadow-[0_8px_22px_rgba(69,61,238,0.18)] hover:bg-[#3a2fd3] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${controlMotionClass}`}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Signing in
                </>
              ) : copy.submit}
            </button>
          </form>
        </section>
      </main>
    </GuestGuard>
  )
}

function resolveWorkspaceLoginKind(host: string, explicit: string | null, nextDestination: string | null): WorkspaceLoginKind {
  const normalizedExplicit = explicit?.trim().toLowerCase()
  if (normalizedExplicit === 'staff') return 'staff'
  if (normalizedExplicit === 'admin') return 'admin'

  const hostname = hostnameFromHeader(host)
  const firstLabel = hostname.split('.')[0] ?? ''
  if (firstLabel === 'staff') return 'staff'
  if (firstLabel === 'admin') return 'admin'
  if (nextDestination && isStaffRoute(nextDestination)) return 'staff'
  return 'admin'
}

function hostnameFromHeader(value: string) {
  const host = value.split(',')[0]?.trim().toLowerCase()
  if (!host) return ''
  try {
    return new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function resolvePostLoginDestination(
  workspace: WorkspaceLoginKind,
  user: AuthUser,
  nextDestination: string | null,
  fallback: string,
) {
  const safeNext = getSafePostLoginDestination(nextDestination, user)
  if (!safeNext) return fallback
  if (workspace === 'staff') return isStaffRoute(safeNext) ? safeNext : fallback
  return safeNext === AUTH_ROUTES.adminHome || safeNext.startsWith(`${AUTH_ROUTES.adminHome}/`)
    ? safeNext
    : fallback
}

function isFirebaseEmailNotVerifiedError(error: unknown) {
  return error instanceof Error && error.name === 'FirebaseEmailNotVerifiedError'
}
