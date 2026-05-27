'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import api from '@/lib/axios'
import KrescoLogo from '@/components/KrescoLogo'
import { Eye, EyeOff } from 'lucide-react'

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
    if (password.length < 6) return toast.error('Mot de passe trop court (min. 6 caract\u00e8res)')
    if (password !== confirm) return toast.error('Les mots de passe ne correspondent pas')
    if (!token) return toast.error('Lien de r\u00e9initialisation invalide')

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
      setTimeout(() => router.replace('/'), 2500)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Lien invalide ou expir\u00e9.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className={pageClass}>
        <div className="w-full max-w-[380px] text-center">
          <KrescoLogo size={52} className="mb-6" />
          <h1 className="mb-2 text-[20px] font-bold text-[var(--auth-text)]">Lien invalide</h1>
          <p className="mb-6 text-[14px] text-[var(--auth-text-muted)]">
            Ce lien de r&eacute;initialisation est invalide ou a expir&eacute;.
          </p>
          <a href="/" className="text-[14px] font-semibold text-[var(--auth-primary)] no-underline">
            Retour &agrave; la connexion
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
            <h1 className="mb-2 text-[22px] font-bold text-[var(--auth-text)]">Mot de passe mis &agrave; jour !</h1>
            <p className="text-[14px] text-[var(--auth-text-muted)]">Redirection vers la connexion...</p>
          </div>
        ) : (
          <>
            <h1 className="mb-1.5 text-center text-[22px] font-bold text-[var(--auth-text)]">
              Nouveau mot de passe
            </h1>
            <p className="mb-6 text-center text-[14px] text-[var(--auth-text-muted)]">
              Choisissez un mot de passe s&eacute;curis&eacute; pour votre compte.
            </p>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3.5">
              <div>
                <label htmlFor="reset-password" className={labelClass}>Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    id="reset-password"
                    aria-label="Nouveau mot de passe"
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
                <label htmlFor="reset-password-confirm" className={labelClass}>Confirmer le mot de passe</label>
                <input
                  id="reset-password-confirm"
                  aria-label="Confirmer le mot de passe"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={'R\u00e9p\u00e9tez le mot de passe'}
                  required
                  className={`${inputClass} ${confirm && confirm !== password ? 'border-[#c10007] focus:border-[#c10007]' : ''}`}
                />
                {confirm && confirm !== password && (
                  <p className="mt-1 text-[12px] text-[#c10007]">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`${primaryButtonClass} mt-1`}
              >
                {loading ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
              </button>
            </form>

            <a href="/" className="mt-5 text-[14px] text-[var(--auth-text-muted)] no-underline">
              Retour &agrave; la connexion
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
