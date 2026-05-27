'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
import KrescoLogo from '@/components/KrescoLogo'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    let redirectTimer: ReturnType<typeof setTimeout> | null = null
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setErrorMsg('Lien de vérification invalide.')
      return
    }

    api.post('/auth/verify-email', { token })
      .then(({ data }) => {
        if (cancelled) return
        login(data.user)
        setStatus('success')
        redirectTimer = setTimeout(() => router.replace('/'), 1800)
      })
      .catch((err: any) => {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(err?.response?.data?.detail || 'Lien invalide ou expiré.')
      })

    return () => {
      cancelled = true
      if (redirectTimer) clearTimeout(redirectTimer)
    }
  }, [searchParams, login, router])

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'var(--auth-bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  }

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <KrescoLogo size={52} className="mb-6" />

        {status === 'loading' && (
          <>
            <div style={{
              width: 40, height: 40,
              border: '3px solid var(--auth-card-selected-bg)',
              borderTopColor: 'var(--auth-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginBottom: 20,
            }} />
            <p style={{ color: 'var(--auth-text-muted)', fontSize: 15 }}>Vérification en cours...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--auth-card-selected-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="var(--auth-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--auth-text)', margin: '0 0 8px' }}>Email vérifié !</h1>
            <p style={{ color: 'var(--auth-text-muted)', fontSize: 14 }}>Redirection en cours...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#c10007" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--auth-text)', margin: '0 0 8px' }}>Vérification échouée</h1>
            <p style={{ color: 'var(--auth-text-muted)', fontSize: 14, marginBottom: 28 }}>{errorMsg}</p>
            <a
              href="/"
              style={{ color: 'var(--auth-primary)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Retour à la connexion
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--auth-bg)' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #edf1ff', borderTopColor: '#453dee', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
