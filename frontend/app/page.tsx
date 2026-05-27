'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
import { resolveAuthSuccess } from '@/lib/authPolicy'
import KrescoLogo from '@/components/KrescoLogo'
import { ArrowLeft, Check, Eye, EyeOff, Mail } from 'lucide-react'

declare global {
  interface Window {
    google: any
    handleGoogleCredential: (response: any) => void
  }
}

type Step = 'auth' | 'niveau' | 'filiere'
type AuthMode = 'options' | 'login' | 'signup' | 'verify-pending' | 'forgot' | 'forgot-sent'

const NIVEAUX = [
  { id: '1bac', label: '1\u00e8re Bac' },
  { id: '2bac', label: '2\u00e8me Bac' },
]

const SPECIALITES = [
  'Bac Sciences Math\u00e9matiques A',
  'Bac Sciences Math\u00e9matiques B',
  'Bac Sciences Physiques',
  'Bac SVT',
  'Bac Sciences Et Technologies Electriques',
  'Bac Sciences Et Technologies M\u00e9caniques',
  'Bac Sciences \u00c9conomiques',
  'Bac Techniques De Gestion Et Comptabilit\u00e9',
  'Bac Sciences Agronomiques',
  'Bac Lettres',
  'Langue Arabe',
  'Sciences De La Chariaa',
  'Arts Appliqu\u00e9s',
  'Autre',
]

const pageClass = 'relative flex min-h-screen flex-col items-center justify-center bg-[var(--auth-bg)] px-5 py-6'
const panelClass = 'flex w-full max-w-[380px] flex-col items-center'
const titleClass = 'mb-1 text-center text-[24px] font-bold text-[var(--auth-text)]'
const sectionTitleClass = 'mb-1.5 text-center text-[22px] font-bold text-[var(--auth-text)]'
const bodyClass = 'text-center text-[14px] leading-normal text-[var(--auth-text-muted)]'
const bodySpaciousClass = 'text-center text-[14px] leading-[1.5] text-[var(--auth-text-muted)]'
const inputClass = 'w-full rounded-[14px] border border-[var(--auth-input-border)] bg-[var(--auth-input-bg)] px-4 py-[13px] text-[14px] text-[var(--auth-text)] outline-none transition-colors focus:border-[var(--auth-input-border-focus)]'
const labelClass = 'mb-1.5 block text-[13px] font-medium text-[var(--auth-text-hint)]'
const primaryButtonClass = 'w-full rounded-[14px] border-0 bg-[var(--auth-primary)] p-[14px] text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-[0.4]'
const outlineButtonClass = 'w-full rounded-[14px] border border-[var(--auth-outline-border)] bg-transparent p-[13px] text-[14px] font-medium text-[var(--auth-text)]'
const ghostButtonClass = 'border-0 bg-transparent text-[14px] text-[var(--auth-text-muted)]'
const linkButtonClass = 'border-0 bg-transparent text-[14px] font-semibold text-[var(--auth-primary)]'
const formClass = 'flex w-full flex-col gap-3.5'
const socialRowClass = 'flex w-full gap-[11px]'
const progressTrackClass = 'mb-7 h-[3px] w-full overflow-hidden rounded-full bg-[var(--auth-divider)]'
const progressFillClass = 'h-full rounded-full bg-[var(--auth-primary)] transition-[width] duration-500 ease-out'
const hiddenGoogleClass = 'pointer-events-none absolute -left-[9999px] -top-[9999px] w-px overflow-hidden opacity-0'
const circleIconClass = 'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--auth-card-selected-bg)]'
const optionBaseClass = 'flex w-full shrink-0 cursor-pointer items-center justify-between text-left'
const selectedOptionClass = 'border-[var(--auth-card-selected-border)] bg-[var(--auth-card-selected-bg)] text-[var(--auth-primary)]'
const unselectedOptionClass = 'border-[var(--auth-input-border)] bg-transparent text-[var(--auth-text)]'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.657 14.013 17.64 11.705 17.64 9.2z" fill="#4285f4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34a853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fbbc05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#ea4335"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0866ff">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="16" height="19" viewBox="0 0 14 17" fill="currentColor">
      <path d="M13.4 12.5c-.3.8-.5 1.1-.9 1.8-.6.9-1.4 2-2.4 2-.9.1-1.2-.6-2.4-.6-1.2 0-1.5.6-2.4.6-1 0-1.9-1.1-2.4-2C1.4 11.8 1 9.5 1.9 7.7c.6-1.2 1.8-2 3-2 1.1 0 1.8.6 2.7.6.9 0 1.4-.7 2.7-.7 1.1 0 2.2.6 2.9 1.6-2.6 1.4-2.1 5-.8 5.3z"/>
      <path d="M9.7 3.5C10.2 2.9 10.6 2 10.5 1c-1 .1-2.1.7-2.8 1.4C7.2 3 6.8 4 6.9 5c1 0 2.1-.6 2.8-1.5z"/>
    </svg>
  )
}

function SocialBtn({
  icon, label, onClick, disabled = false,
}: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="relative h-11 flex-1 rounded-[14px] border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-[0.45]"
    >
      <div className="absolute inset-0 rounded-[14px] bg-[#f4f4f5]" />
      <div className="absolute inset-0 flex items-center justify-center rounded-[14px] border border-[#e4e4e7] bg-white">
        {icon}
      </div>
    </button>
  )
}

function OrDivider({ className = '' }: { className?: string }) {
  return (
    <div className={cx('flex w-full items-center gap-3', className)}>
      <div className="h-px flex-1 bg-[var(--auth-divider)]" />
      <span className="text-[16px] font-bold text-[var(--auth-divider)]">or</span>
      <div className="h-px flex-1 bg-[var(--auth-divider)]" />
    </div>
  )
}

export default function AuthPage() {
  const router = useRouter()
  const { login, token, hydrate, isHydrated, user, updateUser } = useAuthStore()
  const hiddenGoogleRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('auth')
  const [authMode, setAuthMode] = useState<AuthMode>('options')
  const [selectedLevel, setSelectedLevel] = useState('')
  const [selectedSpec, setSelectedSpec] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [googleReady, setGoogleReady] = useState(false)

  const handleAuthResolution = useCallback((nextUser: unknown, mode: 'push' | 'replace' = 'push') => {
    const resolution = resolveAuthSuccess(nextUser as { role?: string; niveau?: string; filiere?: string })
    if (resolution.action === 'onboarding') {
      setStep(resolution.step)
      return
    }

    if (mode === 'replace') router.replace(resolution.destination)
    else router.push(resolution.destination)
  }, [router])

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isHydrated) return
    if (token && user) {
      handleAuthResolution(user, 'replace')
    }
  }, [handleAuthResolution, isHydrated, token, user])

  useEffect(() => {
    window.handleGoogleCredential = async (response: any) => {
      setLoading(true)
      try {
        const { data } = await api.post('/google-login', { credential: response.credential })
        login(data.user, data.csrf_token)
        toast.success(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
        handleAuthResolution(data.user)
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || 'Connexion \u00e9chou\u00e9e.')
      } finally {
        setLoading(false)
      }
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      if (window.google && hiddenGoogleRef.current) {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: window.handleGoogleCredential,
        })
        window.google.accounts.id.renderButton(hiddenGoogleRef.current, {
          size: 'large', width: 1, text: 'continue_with',
        })
        setGoogleReady(true)
      }
    }
    document.head.appendChild(script)
    return () => { try { document.head.removeChild(script) } catch {} }
  }, [handleAuthResolution, login])

  function triggerGoogle() {
    if (!googleReady) return
    const btn = hiddenGoogleRef.current?.querySelector('div[role="button"]') as HTMLElement | null
    if (btn) btn.click()
    else window.google?.accounts?.id?.prompt()
  }

  function resetForm() {
    setEmail('')
    setPassword('')
    setFullName('')
    setShowPassword(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return toast.error('Entrez votre nom complet')
    if (password.length < 6) return toast.error('Mot de passe trop court (min. 6 caract\u00e8res)')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/signup', { email, password, full_name: fullName })
      setPendingEmail(data.email)
      setAuthMode('verify-pending')
      toast.success('Email de v\u00e9rification envoy\u00e9 !')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Erreur lors de la cr\u00e9ation du compte.')
    } finally { setLoading(false) }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      login(data.user, data.csrf_token)
      toast.success(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
      handleAuthResolution(data.user)
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setPendingEmail(email)
        setAuthMode('verify-pending')
        toast.error('V\u00e9rifiez votre email avant de vous connecter.')
      } else {
        toast.error(err?.response?.data?.detail || 'Email ou mot de passe incorrect.')
      }
    } finally { setLoading(false) }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try { await api.post('/auth/forgot-password', { email }) } catch {}
    setLoading(false)
    setAuthMode('forgot-sent')
  }

  async function handleResend() {
    if (!pendingEmail) return
    setLoading(true)
    try {
      await api.post('/auth/resend-verification', { email: pendingEmail })
      toast.success('Email renvoy\u00e9 !')
    } catch { toast.error('Impossible d\'envoyer l\'email.') }
    setLoading(false)
  }

  async function saveOnboarding() {
    setLoading(true)
    try {
      const { data } = await api.patch('/profile/me', { niveau: selectedLevel, filiere: selectedSpec })
      updateUser({ niveau: data.niveau, filiere: data.filiere })
      router.push('/home')
    } catch { toast.error('Erreur lors de la sauvegarde.') }
    setLoading(false)
  }

  const canGoBack = step !== 'auth' || !['options', 'verify-pending', 'forgot-sent'].includes(authMode)
  const stepNum = step === 'auth' ? 1 : step === 'niveau' ? 2 : 3
  const progressWidthClass = stepNum === 1 ? 'w-1/3' : stepNum === 2 ? 'w-2/3' : 'w-full'

  return (
    <div className={pageClass}>
      <div ref={hiddenGoogleRef} className={hiddenGoogleClass} />

      <div className={panelClass}>
        <div className={progressTrackClass}>
          <div className={cx(progressFillClass, progressWidthClass)} />
        </div>

        {canGoBack && (
          <button
            type="button"
            onClick={() => {
              if (step === 'filiere') setStep('niveau')
              else if (authMode === 'login' || authMode === 'signup') { setAuthMode('options'); resetForm() }
              else if (authMode === 'forgot') { setAuthMode('login'); resetForm() }
              else setStep('auth')
            }}
            className="mb-4 flex items-center gap-1.5 self-start border-0 bg-transparent text-[14px] text-[var(--auth-text-muted)]"
          >
            <ArrowLeft size={15} /> Retour
          </button>
        )}

        <KrescoLogo size={52} className="mb-5" />

        {step === 'auth' && (
          <>
            {authMode === 'options' && (
              <>
                <h1 className={titleClass}>Bienvenue sur Kresco</h1>
                <p className={cx(bodySpaciousClass, 'mb-7')}>
                  Connectez-vous pour acc&eacute;der &agrave; vos cours du Bac.
                </p>

                <div className={cx(socialRowClass, 'mb-1')}>
                  <SocialBtn icon={<GoogleIcon />} label="Continuer avec Google" onClick={triggerGoogle} disabled={!googleReady || loading} />
                  <SocialBtn icon={<FacebookIcon />} label="Facebook (bient\u00f4t)" disabled />
                  <SocialBtn icon={<AppleIcon />} label="Apple (bient\u00f4t)" disabled />
                </div>

                {loading && <p className="mt-1.5 text-[12px] text-[var(--auth-text-muted)]">Connexion...</p>}

                <OrDivider className="my-5" />

                <button type="button" onClick={() => { setAuthMode('signup'); resetForm() }} className={outlineButtonClass}>
                  Cr&eacute;er un compte
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); resetForm() }}
                  className={cx(ghostButtonClass, 'mt-3.5')}
                >
                  D&eacute;j&agrave; un compte ? <span className="font-semibold text-[var(--auth-primary)]">Se connecter</span>
                </button>
              </>
            )}

            {authMode === 'signup' && (
              <>
                <h1 className={titleClass}>Sign up</h1>
                <p className={cx(bodyClass, 'mb-6')}>Rejoignez Kresco gratuitement.</p>

                <div className={cx(socialRowClass, 'mb-5')}>
                  <SocialBtn icon={<GoogleIcon />} label="Google" onClick={triggerGoogle} disabled={!googleReady || loading} />
                  <SocialBtn icon={<FacebookIcon />} label="Facebook" disabled />
                  <SocialBtn icon={<AppleIcon />} label="Apple" disabled />
                </div>

                <OrDivider className="mb-5" />

                <form onSubmit={handleSignup} className={formClass}>
                  <div>
                    <label htmlFor="signup-full-name" className={labelClass}>Nom complet</label>
                    <input id="signup-full-name" aria-label="Nom complet" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ahmed Benali" required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="signup-email" className={labelClass}>Email</label>
                    <input id="signup-email" aria-label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="signup-password" className={labelClass}>Mot de passe</label>
                    <div className="relative">
                      <input id="signup-password" aria-label="Mot de passe" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder={'Min. 6 caract\u00e8res'} required minLength={6}
                        className={cx(inputClass, 'pr-11')} />
                      <button type="button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3.5 top-1/2 flex -translate-y-1/2 border-0 bg-transparent text-[var(--auth-text-muted)]">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={cx(primaryButtonClass, 'mt-1')}>
                    {loading ? 'Cr\u00e9ation...' : 'Cr\u00e9er mon compte'}
                  </button>
                </form>
                <p className="mt-[18px] text-[14px] text-[var(--auth-text-muted)]">
                  D&eacute;j&agrave; un compte ?{' '}
                  <button type="button" onClick={() => { setAuthMode('login'); resetForm() }} className={linkButtonClass}>
                    Se connecter
                  </button>
                </p>
              </>
            )}

            {authMode === 'verify-pending' && (
              <div className="w-full text-center">
                <div className={circleIconClass}>
                  <Mail size={28} color="var(--auth-primary)" />
                </div>
                <h1 className={cx(sectionTitleClass, 'mb-2.5')}>V&eacute;rifiez votre email</h1>
                <p className="mb-7 text-[14px] leading-[1.6] text-[var(--auth-text-muted)]">
                  Nous avons envoy&eacute; un lien &agrave; <strong className="text-[var(--auth-text)]">{pendingEmail}</strong>.
                  <br />Cliquez dessus pour activer votre compte.
                </p>
                <button type="button" onClick={handleResend} disabled={loading} className={cx(outlineButtonClass, 'mb-3.5 disabled:opacity-[0.6]')}>
                  {loading ? 'Envoi...' : 'Renvoyer l\'email'}
                </button>
                <button type="button" onClick={() => { setAuthMode('options'); resetForm() }} className={ghostButtonClass}>
                  Retour &agrave; l&apos;accueil
                </button>
              </div>
            )}

            {authMode === 'login' && (
              <>
                <h1 className={titleClass}>Log in</h1>
                <p className={cx(bodyClass, 'mb-6')}>Content de vous revoir !</p>

                <div className={cx(socialRowClass, 'mb-5')}>
                  <SocialBtn icon={<GoogleIcon />} label="Google" onClick={triggerGoogle} disabled={!googleReady || loading} />
                  <SocialBtn icon={<FacebookIcon />} label="Facebook" disabled />
                  <SocialBtn icon={<AppleIcon />} label="Apple" disabled />
                </div>

                <OrDivider className="mb-5" />

                <form onSubmit={handleLogin} className={formClass}>
                  <div>
                    <label htmlFor="login-email" className={labelClass}>Email</label>
                    <input id="login-email" aria-label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required className={inputClass} />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="login-password" className="block text-[13px] font-medium text-[var(--auth-text-hint)]">Mot de passe</label>
                      <button type="button" onClick={() => { setAuthMode('forgot'); resetForm() }} className="border-0 bg-transparent text-[12px] font-medium text-[var(--auth-primary)]">
                        Mot de passe oubli&eacute; ?
                      </button>
                    </div>
                    <div className="relative">
                      <input id="login-password" aria-label="Mot de passe" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Votre mot de passe" required
                        className={cx(inputClass, 'pr-11')} />
                      <button type="button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3.5 top-1/2 flex -translate-y-1/2 border-0 bg-transparent text-[var(--auth-text-muted)]">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={cx(primaryButtonClass, 'mt-1')}>
                    {loading ? 'Connexion...' : 'Se connecter'}
                  </button>
                </form>

                <p className="mt-[18px] text-[14px] text-[var(--auth-text-muted)]">
                  Pas encore de compte ?{' '}
                  <button type="button" onClick={() => { setAuthMode('signup'); resetForm() }} className={linkButtonClass}>
                    Cr&eacute;er un compte
                  </button>
                </p>
              </>
            )}

            {authMode === 'forgot' && (
              <>
                <h1 className={sectionTitleClass}>Mot de passe oubli&eacute;</h1>
                <p className={cx(bodySpaciousClass, 'mb-6')}>
                  Entrez votre email, nous vous enverrons un lien de r&eacute;initialisation.
                </p>
                <form onSubmit={handleForgot} className={formClass}>
                  <div>
                    <label htmlFor="forgot-email" className={labelClass}>Email</label>
                    <input id="forgot-email" aria-label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required className={inputClass} />
                  </div>
                  <button type="submit" disabled={loading} className={cx(primaryButtonClass, 'mt-1')}>
                    {loading ? 'Envoi...' : 'Envoyer le lien'}
                  </button>
                </form>
                <button type="button" onClick={() => { setAuthMode('login'); resetForm() }} className={cx(linkButtonClass, 'mt-[18px] font-medium')}>
                  Retour &agrave; la connexion
                </button>
              </>
            )}

            {authMode === 'forgot-sent' && (
              <div className="w-full text-center">
                <div className={circleIconClass}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="var(--auth-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 className={cx(sectionTitleClass, 'mb-2.5')}>Email envoy&eacute; !</h1>
                <p className="mb-7 text-[14px] leading-[1.6] text-[var(--auth-text-muted)]">
                  Si un compte existe avec cette adresse, vous recevrez un lien sous peu.
                </p>
                <button type="button" onClick={() => { setAuthMode('login'); resetForm() }} className={primaryButtonClass}>
                  Retour &agrave; la connexion
                </button>
              </div>
            )}
          </>
        )}

        {step === 'niveau' && (
          <>
            <h1 className={sectionTitleClass}>Quel est votre niveau ?</h1>
            <p className={cx(bodyClass, 'mb-7')}>Cela nous aide &agrave; personnaliser votre exp&eacute;rience.</p>
            <div className="mb-7 flex w-full flex-col gap-3">
              {NIVEAUX.map(n => {
                const selected = selectedLevel === n.id
                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => setSelectedLevel(n.id)}
                    className={cx(
                      optionBaseClass,
                      'rounded-[14px] border-2 px-5 py-4 text-[15px] font-medium',
                      selected ? selectedOptionClass : unselectedOptionClass,
                    )}
                  >
                    {n.label}
                    {selected && <Check size={16} />}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={() => selectedLevel && setStep('filiere')} disabled={!selectedLevel} className={primaryButtonClass}>
              Continuer
            </button>
          </>
        )}

        {step === 'filiere' && (
          <>
            <h1 className={sectionTitleClass}>Quelle est votre fili&egrave;re ?</h1>
            <p className={cx(bodyClass, 'mb-5')}>S&eacute;lectionnez votre sp&eacute;cialit&eacute; du Bac.</p>
            <div className="mb-6 flex max-h-[360px] w-full flex-col gap-2 overflow-y-auto pr-1">
              {SPECIALITES.map(spec => {
                const selected = selectedSpec === spec
                return (
                  <button
                    type="button"
                    key={spec}
                    onClick={() => setSelectedSpec(spec)}
                    className={cx(
                      optionBaseClass,
                      'rounded-xl border-2 px-4 py-[13px] text-[14px]',
                      selected ? cx(selectedOptionClass, 'font-semibold') : cx(unselectedOptionClass, 'font-normal'),
                    )}
                  >
                    {spec}
                    {selected && <Check size={14} className="shrink-0" />}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={saveOnboarding} disabled={!selectedSpec || loading} className={primaryButtonClass}>
              {loading ? 'Sauvegarde...' : 'Commencer'}
            </button>
          </>
        )}
      </div>

      <p className="absolute bottom-5 px-4 text-center text-[12px] text-[var(--auth-text-muted)]">
        By using Kresco services, you agree to our{' '}
        <a href="#" className="text-[var(--auth-text-hint)] underline">Terms</a>
        {' '}and{' '}
        <a href="#" className="text-[var(--auth-text-hint)] underline">Privacy</a>.
      </p>
    </div>
  )
}
