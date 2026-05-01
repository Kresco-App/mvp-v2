'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import api from '@/lib/axios'
import KrescoLogo from '@/components/KrescoLogo'
import { Eye, EyeOff } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: 14,
  background: 'var(--auth-input-bg)',
  border: '1px solid var(--auth-input-border)',
  color: 'var(--auth-text)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 150ms',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--auth-text-hint)',
  marginBottom: 6,
}

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  borderRadius: 14,
  background: 'var(--auth-primary)',
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  transition: 'opacity 150ms',
}

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
    if (password.length < 6) return toast.error('Mot de passe trop court (min. 6 caractères)')
    if (password !== confirm) return toast.error('Les mots de passe ne correspondent pas')
    if (!token) return toast.error('Lien de réinitialisation invalide')

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
      setTimeout(() => router.replace('/'), 2500)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Lien invalide ou expiré.')
    } finally {
      setLoading(false)
    }
  }

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'var(--auth-bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  }

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <KrescoLogo size={52} className="mb-6" />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--auth-text)', marginBottom: 8 }}>Lien invalide</h1>
          <p style={{ color: 'var(--auth-text-muted)', fontSize: 14, marginBottom: 24 }}>
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <a href="/" style={{ color: 'var(--auth-primary)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            Retour à la connexion
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <KrescoLogo size={52} className="mb-5" />

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--auth-card-selected-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="var(--auth-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--auth-text)', margin: '0 0 8px' }}>Mot de passe mis à jour !</h1>
            <p style={{ color: 'var(--auth-text-muted)', fontSize: 14 }}>Redirection vers la connexion...</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--auth-text)', margin: '0 0 6px', textAlign: 'center' }}>
              Nouveau mot de passe
            </h1>
            <p style={{ fontSize: 14, color: 'var(--auth-text-muted)', marginBottom: 24, textAlign: 'center' }}>
              Choisissez un mot de passe sécurisé pour votre compte.
            </p>

            <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nouveau mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 6 caractères"
                    required
                    minLength={6}
                    style={{ ...inputStyle, paddingRight: 44 }}
                    onFocus={e => (e.target.style.borderColor = 'var(--auth-input-border-focus)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--auth-input-border)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--auth-text-muted)', display: 'flex' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Confirmer le mot de passe</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  required
                  style={{
                    ...inputStyle,
                    borderColor: confirm && confirm !== password ? '#c10007' : 'var(--auth-input-border)',
                  }}
                  onFocus={e => {
                    if (!(confirm && confirm !== password)) {
                      e.target.style.borderColor = 'var(--auth-input-border-focus)'
                    }
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = confirm && confirm !== password ? '#c10007' : 'var(--auth-input-border)'
                  }}
                />
                {confirm && confirm !== password && (
                  <p style={{ fontSize: 12, color: '#c10007', marginTop: 4 }}>Les mots de passe ne correspondent pas</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ ...primaryBtnStyle, marginTop: 4, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
              </button>
            </form>

            <a href="/" style={{ marginTop: 20, fontSize: 14, color: 'var(--auth-text-muted)', textDecoration: 'none' }}>
              Retour à la connexion
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--auth-bg)' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #edf1ff', borderTopColor: '#453dee', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
