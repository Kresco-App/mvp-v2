'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import KrescoLogo from '@/components/KrescoLogo'
import { Check, Loader2, TriangleAlert } from 'lucide-react'
import { localizedCopy } from '@/lib/localization'
import { applyFirebaseEmailVerification } from '@/lib/firebaseAuth'

const pageClass = 'flex min-h-[100svh] flex-col items-center justify-center overflow-y-auto bg-[var(--auth-bg)] p-6'
const panelClass = 'flex w-full max-w-[380px] flex-col items-center text-center'
const focusRingClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    let redirectTimer: ReturnType<typeof setTimeout> | null = null
    const oobCode = searchParams.get('oobCode') || searchParams.get('code')
    if (!oobCode) {
      setStatus('error')
      setErrorMsg(localizedCopy.auth.verifyEmailInvalidBody)
      return () => {
        cancelled = true
      }
    }

    applyFirebaseEmailVerification(oobCode)
      .then(() => {
        if (cancelled) return
        setStatus('success')
        redirectTimer = setTimeout(() => router.replace('/'), 2500)
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(localizedCopy.auth.verifyEmailInvalidBody)
      })

    return () => {
      cancelled = true
      if (redirectTimer) clearTimeout(redirectTimer)
    }
  }, [searchParams, router])

  return (
    <div className={pageClass}>
      <div className={panelClass}>
        <KrescoLogo size={52} className="mb-6" />

        {status === 'loading' && (
          <div role="status">
            <Loader2 size={40} className="mx-auto mb-5 animate-spin text-[var(--auth-primary)]" aria-hidden="true" />
            <p className="text-[15px] text-[var(--auth-text-muted)]">{localizedCopy.auth.verifyEmailChecking}</p>
          </div>
        )}

        {status === 'success' && (
          <div role="status">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--auth-card-selected-bg)]">
              <Check size={28} color="var(--auth-primary)" aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-[22px] font-bold text-[var(--auth-text)]">{localizedCopy.auth.verifyEmailVerifiedTitle}</h1>
            <p className="text-[14px] leading-[1.55] text-[var(--auth-text-muted)]">{localizedCopy.auth.verifyEmailVerifiedBody}</p>
          </div>
        )}

        {status === 'error' && (
          <div role="alert">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff0f0]">
              <TriangleAlert size={28} color="#c10007" aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-[22px] font-bold text-[var(--auth-text)]">{localizedCopy.auth.verifyEmailFailedTitle}</h1>
            <p className="mb-7 text-[14px] leading-[1.55] text-[var(--auth-text-muted)]">{errorMsg}</p>
            <a
              href="/"
              className={`rounded-md px-1 py-1 text-[14px] font-semibold text-[var(--auth-primary)] no-underline hover:text-[#3a2fd3] ${focusRingClass}`}
            >
              {localizedCopy.auth.backToLogin}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[100svh] items-center justify-center bg-[var(--auth-bg)]" role="status" aria-label={localizedCopy.auth.loading}>
        <Loader2 size={34} className="animate-spin text-[var(--auth-primary)]" aria-hidden="true" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
