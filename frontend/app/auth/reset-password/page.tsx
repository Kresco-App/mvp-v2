'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import KrescoLogo from '@/components/KrescoLogo'
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import { localizedCopy } from '@/lib/localization'
import { confirmFirebasePasswordReset } from '@/lib/firebaseAuth'

const focusRingClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
const buttonMotionClass = 'transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-200 ease-out active:scale-[0.99] disabled:active:scale-100'
const pageClass = 'flex min-h-[100svh] flex-col items-center justify-center overflow-y-auto bg-[var(--auth-bg)] p-6'
const panelClass = 'flex w-full max-w-[380px] flex-col items-center'
const inputClass = 'min-h-12 w-full rounded-[14px] border border-[var(--auth-input-border)] bg-[var(--auth-input-bg)] px-4 py-[13px] text-[14px] text-[var(--auth-text)] outline-none transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-[var(--auth-text-muted)] focus:border-[var(--auth-input-border-focus)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(69,61,238,0.12)]'
const labelClass = 'mb-1.5 block text-[13px] font-medium text-[var(--auth-text-hint)]'
const primaryButtonClass = `flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-[var(--auth-primary)] p-[14px] text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(69,61,238,0.18)] hover:bg-[#3a2fd3] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${buttonMotionClass} ${focusRingClass}`
const linkClass = `rounded-md text-[14px] font-semibold text-[var(--auth-primary)] no-underline hover:text-[#3a2fd3] ${buttonMotionClass} ${focusRingClass}`

function LoadingText({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      {label}
    </span>
  )
}

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const oobCode = searchParams.get('oobCode') || searchParams.get('code') || ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return toast.error(localizedCopy.auth.passwordMinPlaceholder)
    if (password !== confirm) return toast.error(localizedCopy.auth.resetPasswordMismatch)
    if (!oobCode) return toast.error(localizedCopy.auth.resetPasswordInvalidLinkTitle)

    setLoading(true)
    try {
      await confirmFirebasePasswordReset(oobCode, password)
      setDone(true)
      setTimeout(() => router.replace('/'), 2500)
    } catch {
      toast.error(localizedCopy.auth.resetPasswordInvalidLinkBody)
    } finally {
      setLoading(false)
    }
  }

  if (!oobCode) {
    return (
      <div className={pageClass}>
        <div className="w-full max-w-[380px] text-center" role="alert">
          <KrescoLogo size={52} className="mb-6" />
          <h1 className="mb-2 text-[20px] font-bold text-[var(--auth-text)]">{localizedCopy.auth.resetPasswordInvalidLinkTitle}</h1>
          <p className="mb-6 text-[14px] leading-[1.55] text-[var(--auth-text-muted)]">
            {localizedCopy.auth.resetPasswordInvalidLinkBody}
          </p>
          <a href="/" className={linkClass}>
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
          <div className="text-center" role="status">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--auth-card-selected-bg)]">
              <Check size={28} color="var(--auth-primary)" aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-[22px] font-bold text-[var(--auth-text)]">{localizedCopy.auth.resetPasswordSuccessTitle}</h1>
            <p className="text-[14px] leading-[1.55] text-[var(--auth-text-muted)]">{localizedCopy.auth.resetPasswordSuccessBody}</p>
          </div>
        ) : (
          <>
            <h1 className="mb-1.5 text-center text-[22px] font-bold text-[var(--auth-text)]">
              {localizedCopy.auth.resetPasswordTitle}
            </h1>
            <p className="mb-6 text-center text-[14px] leading-[1.55] text-[var(--auth-text-muted)]">
              {localizedCopy.auth.resetPasswordBody}
            </p>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3.5" aria-busy={loading}>
              <div>
                <label htmlFor="reset-password" className={labelClass}>{localizedCopy.auth.resetPasswordTitle}</label>
                <div className="relative">
                  <input
                    id="reset-password"
                    aria-label={localizedCopy.auth.resetPasswordTitle}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={localizedCopy.auth.passwordMinPlaceholder}
                    required
                    minLength={8}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? localizedCopy.auth.hidePassword : localizedCopy.auth.showPassword}
                    onClick={() => setShowPassword(v => !v)}
                    className={`absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-[var(--auth-text-muted)] hover:bg-white hover:text-[var(--auth-text)] ${buttonMotionClass} ${focusRingClass}`}
                  >
                    {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-password-confirm" className={labelClass}>{localizedCopy.auth.resetPasswordConfirmLabel}</label>
                <input
                  id="reset-password-confirm"
                  aria-label={localizedCopy.auth.resetPasswordConfirmLabel}
                  aria-describedby={confirm && confirm !== password ? 'reset-password-confirm-error' : undefined}
                  aria-invalid={confirm && confirm !== password ? 'true' : undefined}
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={localizedCopy.auth.resetPasswordConfirmPlaceholder}
                  required
                  className={`${inputClass} ${confirm && confirm !== password ? 'border-[#c10007] focus:border-[#c10007]' : ''}`}
                />
                {confirm && confirm !== password && (
                  <p id="reset-password-confirm-error" className="mt-1 text-[12px] text-[#c10007]">{localizedCopy.auth.resetPasswordMismatch}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`${primaryButtonClass} mt-1`}
              >
                {loading ? <LoadingText label={localizedCopy.auth.saving} /> : localizedCopy.auth.resetPasswordSaveBtn}
              </button>
            </form>

            <a href="/" className={`mt-5 rounded-md px-1 py-1 text-[14px] text-[var(--auth-text-muted)] no-underline hover:text-[var(--auth-text)] ${buttonMotionClass} ${focusRingClass}`}>
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
      <div className="flex min-h-[100svh] items-center justify-center bg-[var(--auth-bg)]" role="status" aria-label={localizedCopy.auth.loading}>
        <Loader2 size={34} className="animate-spin text-[var(--auth-primary)]" aria-hidden="true" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
