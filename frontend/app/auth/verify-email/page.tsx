'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import KrescoLogo from '@/components/KrescoLogo'
import { localizedCopy } from '@/lib/localization'
import { applyFirebaseEmailVerification } from '@/lib/firebaseAuth'

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--auth-bg)] p-6">
      <div className="flex w-full max-w-[380px] flex-col items-center text-center">
        <KrescoLogo size={52} className="mb-6" />

        {status === 'loading' && (
          <>
            <div className="mb-5 h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--auth-card-selected-bg)] border-t-[var(--auth-primary)]" />
            <p className="text-[15px] text-[var(--auth-text-muted)]">V&eacute;rification en cours...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--auth-card-selected-bg)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="var(--auth-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="mb-2 text-[22px] font-bold text-[var(--auth-text)]">{localizedCopy.auth.verifyEmailVerifiedTitle}</h1>
            <p className="text-[14px] text-[var(--auth-text-muted)]">{localizedCopy.auth.verifyEmailVerifiedBody}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff0f0]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#c10007" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="mb-2 text-[22px] font-bold text-[var(--auth-text)]">V&eacute;rification &eacute;chou&eacute;e</h1>
            <p className="mb-7 text-[14px] text-[var(--auth-text-muted)]">{errorMsg}</p>
            <a
              href="/"
              className="text-[14px] font-semibold text-[var(--auth-primary)] no-underline"
            >
              {localizedCopy.auth.backToLogin}
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--auth-bg)]">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#edf1ff] border-t-[#453dee]" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
