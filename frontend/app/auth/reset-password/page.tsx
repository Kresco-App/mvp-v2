'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { postJson } from '@/lib/apiClient'
import KrescoLogo from '@/components/KrescoLogo'
import { Eye, EyeOff } from 'lucide-react'
import { localizedCopy } from '@/lib/localization'

const pageClass = 'flex min-h-screen flex-col items-center justify-center bg-[var(--auth-bg)] p-6'
const panelClass = 'flex w-full max-w-[380px] flex-col items-center'
const inputClass = 'w-full rounded-[14px] border border-[var(--auth-input-border)] bg-[var(--auth-input-bg)] px-4 py-[13px] text-[14px] text-[var(--auth-text)] outline-none transition-colors focus:border-[var(--auth-input-border-focus)]'
const labelClass = 'mb-1.5 block text-[13px] font-medium text-[var(--auth-text-hint)]'
const primaryButtonClass = 'w-full rounded-[14px] border-0 bg-[var(--auth-primary)] p-[14px] text-[15px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const token = searchParams.get('token') || ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) return toast.error(localizedCopy.auth.passwordMinPlaceholder)
    if (password !== confirm) return toast.error(localizedCopy.auth.resetPasswordMismatch)
    if (!token) return toast.error(localizedCopy.auth.resetPasswordInvalidLinkTitle)

    setLoading(true)
    try {
      await postJson('/auth/reset-password', { token, password })
      setDone(true)
      setTimeout(() => router.replace('/'), 2500)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || localizedCopy.auth.resetPasswordInvalidLinkBody)
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className={pageClass}>
        <div className="w-full max-w-[380px] text-center">
          <KrescoLogo size={52} className="mb-6" />
          <h1 className="mb-2 text-[20px] font-bold text-[var(--auth-text)]">{localizedCopy.auth.resetPasswordInvalidLinkTitle}</h1>
          <p className="mb-6 text-[14px] text-[var(--auth-text-muted)]">
            {localizedCopy.auth.resetPasswordInvalidLinkBody}
          </p>
          <a href="/" className="text-[14px] font-semibold text-[var(--auth-primary)] no-underline">
            {localizedCopy.auth.backToLogin}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={pageClass}>
      <div className={panelClass}>
        <KrescoLogo size={52} className="mb-5" />

        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--auth-card-selected-bg)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="var(--auth-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="mb-2 text-[22px] font-bold text-[var(--auth-text)]">{localizedCopy.auth.resetPasswordSuccessTitle}</h1>
            <p className="text-[14px] text-[var(--auth-text-muted)]">{localizedCopy.auth.resetPasswordSuccessBody}</p>
          </div>
        ) : (
          <>
            <h1 className="mb-1.5 text-center text-[22px] font-bold text-[var(--auth-text)]">
              {localizedCopy.auth.resetPasswordTitle}
            </h1>
            <p className="mb-6 text-center text-[14px] text-[var(--auth-text-muted)]">
              {localizedCopy.auth.resetPasswordBody}
            </p>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3.5">
              <div>
                <label htmlFor="reset-password" className={labelClass}>{localizedCopy.auth.resetPasswordTitle}</label>
                <div className="relative">
                  <input
                    id="reset-password"
                    aria-label={localizedCopy.auth.resetPasswordTitle}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={'Min. 6 caract\u00e8res'}
                    required
                    minLength={6}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 flex -translate-y-1/2 border-0 bg-transparent text-[var(--auth-text-muted)]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-password-confirm" className={labelClass}>{localizedCopy.auth.resetPasswordConfirmLabel}</label>
                <input
                  id="reset-password-confirm"
                  aria-label={localizedCopy.auth.resetPasswordConfirmLabel}
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={'R\u00e9p\u00e9tez le mot de passe'}
                  required
                  className={`${inputClass} ${confirm && confirm !== password ? 'border-[#c10007] focus:border-[#c10007]' : ''}`}
                />
                {confirm && confirm !== password && (
                  <p className="mt-1 text-[12px] text-[#c10007]">{localizedCopy.auth.resetPasswordMismatch}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`${primaryButtonClass} mt-1`}
              >
                {loading ? localizedCopy.auth.saving : localizedCopy.auth.resetPasswordSaveBtn}
              </button>
            </form>

            <a href="/" className="mt-5 text-[14px] text-[var(--auth-text-muted)] no-underline">
              {localizedCopy.auth.backToLogin}
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--auth-bg)]">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#edf1ff] border-t-[#453dee]" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
