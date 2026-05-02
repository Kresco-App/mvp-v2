'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
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
  { id: '1bac', label: '1ère Bac' },
  { id: '2bac', label: '2ème Bac' },
]

const SPECIALITES = [
  'Bac Sciences Mathématiques A',
  'Bac Sciences Mathématiques B',
  'Bac Sciences Physiques',
  'Bac SVT',
  'Bac Sciences Et Technologies Electriques',
  'Bac Sciences Et Technologies Mécaniques',
  'Bac Sciences Économiques',
  'Bac Techniques De Gestion Et Comptabilité',
  'Bac Sciences Agronomiques',
  'Bac Lettres',
  'Langue Arabe',
  'Sciences De La Chariaa',
  'Arts Appliqués',
  'Autre',
]

/* ── Figma design tokens ────────────────────── */
const C = {
  bg: 'var(--auth-bg)',
  inputBg: 'var(--auth-input-bg)',
  inputBorder: 'var(--auth-input-border)',
  inputFocus: 'var(--auth-input-border-focus)',
  text: 'var(--auth-text)',
  muted: 'var(--auth-text-muted)',
  hint: 'var(--auth-text-hint)',
  divider: 'var(--auth-divider)',
  primary: 'var(--auth-primary)',
  selBg: 'var(--auth-card-selected-bg)',
  selBorder: 'var(--auth-card-selected-border)',
  outlineBorder: 'var(--auth-outline-border)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px', borderRadius: 14,
  background: C.inputBg, border: `1px solid ${C.inputBorder}`,
  color: C.text, fontSize: 14, outline: 'none', transition: 'border-color 150ms',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500, color: C.hint, marginBottom: 6,
}
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '14px', borderRadius: 14, background: C.primary,
  color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer',
}
const outlineBtn: React.CSSProperties = {
  width: '100%', padding: '13px', borderRadius: 14, background: 'transparent',
  color: C.text, fontSize: 14, fontWeight: 500,
  border: `1px solid ${C.outlineBorder}`, cursor: 'pointer',
}

/* ── Google G SVG ── */
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

/* ── Social button (Figma style: shadow + white base) ── */
function SocialBtn({
  icon, label, onClick, disabled = false,
}: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        position: 'relative', flex: 1, height: 44, borderRadius: 14,
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: 'transparent', padding: 0,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {/* shadow layer */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 14,
        background: '#f4f4f5',
      }} />
      {/* base layer */}
      <div style={{
        position: 'absolute', inset: 0, top: 0, borderRadius: 14,
        background: '#ffffff',
        border: '1px solid #e4e4e7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
    </button>
  )
}

/* ── Google overlay button ──────────────────────────────────────────────────
   Shows our custom-styled button visually, but places the real Google iframe
   on top (opacity 0.01). The user's click lands on the iframe naturally — no
   programmatic click needed, so popup blockers can't interfere.
   The overlay div ref is a callback ref so renderButton is called every time
   the div mounts (i.e. when the auth mode changes and the div remounts).
*/
function GoogleOverlayBtn({
  loading,
  overlayRef,
}: {
  loading: boolean
  overlayRef: (node: HTMLDivElement | null) => void
}) {
  return (
    <div style={{ position: 'relative', flex: 1, height: 44 }} title="Continuer avec Google">
      {/* shadow layer */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: '#f4f4f5' }} />
      {/* base layer (visible icon) */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 14,
        background: '#ffffff', border: '1px solid #e4e4e7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none', opacity: loading ? 0.45 : 1,
      }}>
        <GoogleIcon />
      </div>
      {/* Real Google GSI iframe — transparent overlay, receives user clicks */}
      <div
        ref={overlayRef}
        style={{
          position: 'absolute', inset: 0,
          opacity: 0.01, overflow: 'hidden', borderRadius: 14,
          pointerEvents: loading ? 'none' : 'auto',
        }}
      />
    </div>
  )
}

export default function AuthPage() {
  const router = useRouter()
  const { login, token, hydrate, isHydrated, user, updateUser } = useAuthStore()
  const googleOverlayDivRef = useRef<HTMLDivElement | null>(null)
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
  // Called whenever a Google overlay div mounts/unmounts.
  // Re-renders the GSI button into whichever overlay div is currently in the DOM.
  const googleOverlayCallback = useCallback((node: HTMLDivElement | null) => {
    googleOverlayDivRef.current = node
    if (node && window.google?.accounts?.id) {
      setTimeout(() => {
        if (node.isConnected && window.google?.accounts?.id) {
          try {
            window.google.accounts.id.renderButton(node, {
              size: 'large',
              width: Math.max(node.offsetWidth, 80),
            })
          } catch {}
        }
      }, 0)
    }
  }, [])

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isHydrated) return
    if (token && user) {
      if (!user.niveau || !user.filiere) setStep(user.niveau ? 'filiere' : 'niveau')
      else router.replace('/home')
    }
  }, [isHydrated, token, user, router])

  /* ── Load Google Identity Services once ── */
  useEffect(() => {
    window.handleGoogleCredential = async (response: any) => {
      setLoading(true)
      try {
        const { data } = await api.post('/google-login', { credential: response.credential })
        login(data.access_token, data.user)
        toast.success(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
        if (!data.user.niveau) setStep('niveau')
        else if (!data.user.filiere) setStep('filiere')
        else router.push('/home')
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || 'Connexion échouée.')
      } finally {
        setLoading(false)
      }
    }

    function initGSI() {
      if (!window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: window.handleGoogleCredential,
        ux_mode: 'popup',
      })
      if (googleOverlayDivRef.current) {
        try {
          window.google.accounts.id.renderButton(googleOverlayDivRef.current, {
            size: 'large',
            width: Math.max(googleOverlayDivRef.current.offsetWidth, 80),
          })
        } catch {}
      }
    }

    if (window.google?.accounts?.id) {
      initGSI()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => { try { initGSI() } catch (e) { console.error('[Kresco] GSI init failed:', e) } }
    script.onerror = () => console.error('[Kresco] GSI script failed to load')
    document.head.appendChild(script)
    return () => { try { document.head.removeChild(script) } catch {} }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setEmail(''); setPassword(''); setFullName(''); setShowPassword(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return toast.error('Entrez votre nom complet')
    if (password.length < 6) return toast.error('Mot de passe trop court (min. 6 caractères)')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/signup', { email, password, full_name: fullName })
      // Dev bypass: server returns access_token immediately (no email verification needed)
      if (data.access_token) {
        login(data.access_token, data.user)
        toast.success(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
        if (!data.user.niveau) setStep('niveau')
        else if (!data.user.filiere) setStep('filiere')
        else router.push('/home')
      } else {
        setPendingEmail(data.email)
        setAuthMode('verify-pending')
        toast.success('Email de vérification envoyé !')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Erreur lors de la création du compte.')
    } finally { setLoading(false) }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      login(data.access_token, data.user)
      toast.success(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
      if (!data.user.niveau) setStep('niveau')
      else if (!data.user.filiere) setStep('filiere')
      else router.push('/home')
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setPendingEmail(email); setAuthMode('verify-pending')
        toast.error('Vérifiez votre email avant de vous connecter.')
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
      toast.success('Email renvoyé !')
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
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh', background: C.bg,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '24px 20px',
  }

  return (
    <div style={pageStyle}>

      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Progress bar */}
        <div style={{ width: '100%', height: 3, background: C.divider, borderRadius: 99, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ height: '100%', background: C.primary, borderRadius: 99, width: `${(stepNum / 3) * 100}%`, transition: 'width .5s ease' }} />
        </div>

        {/* Back */}
        {canGoBack && (
          <button onClick={() => {
            if (step === 'filiere') setStep('niveau')
            else if (authMode === 'login' || authMode === 'signup') { setAuthMode('options'); resetForm() }
            else if (authMode === 'forgot') { setAuthMode('login'); resetForm() }
            else setStep('auth')
          }} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>
            <ArrowLeft size={15} /> Retour
          </button>
        )}

        <KrescoLogo size={52} className="mb-5" />

        {/* ── AUTH STEP ── */}
        {step === 'auth' && (
          <>
            {/* ── Options ── */}
            {authMode === 'options' && (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 4px', textAlign: 'center' }}>
                  Bienvenue sur Kresco
                </h1>
                <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, textAlign: 'center', lineHeight: 1.5 }}>
                  Connectez-vous pour accéder à vos cours du Bac.
                </p>

                {/* Figma 3 social buttons */}
                <div style={{ width: '100%', display: 'flex', gap: 11, marginBottom: 4 }}>
                  <GoogleOverlayBtn loading={loading} overlayRef={googleOverlayCallback} />
                  <SocialBtn icon={<FacebookIcon />} label="Facebook (bientôt)" disabled />
                  <SocialBtn icon={<AppleIcon />} label="Apple (bientôt)" disabled />
                </div>

                {loading && <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Connexion...</p>}

                {/* OR divider */}
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                  <div style={{ flex: 1, height: 1, background: C.divider }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.divider }}>or</span>
                  <div style={{ flex: 1, height: 1, background: C.divider }} />
                </div>

                <button onClick={() => { setAuthMode('signup'); resetForm() }} style={outlineBtn}>
                  Créer un compte
                </button>
                <button onClick={() => { setAuthMode('login'); resetForm() }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: 14, fontSize: 14, color: C.muted }}>
                  Déjà un compte ? <span style={{ color: C.primary, fontWeight: 600 }}>Se connecter</span>
                </button>
              </>
            )}

            {/* ── Sign up ── */}
            {authMode === 'signup' && (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 4px', textAlign: 'center' }}>Sign up</h1>
                <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, textAlign: 'center' }}>Rejoignez Kresco gratuitement.</p>

                {/* Social row on signup too */}
                <div style={{ width: '100%', display: 'flex', gap: 11, marginBottom: 20 }}>
                  <GoogleOverlayBtn loading={loading} overlayRef={googleOverlayCallback} />
                  <SocialBtn icon={<FacebookIcon />} label="Facebook" disabled />
                  <SocialBtn icon={<AppleIcon />} label="Apple" disabled />
                </div>

                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, height: 1, background: C.divider }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.divider }}>or</span>
                  <div style={{ flex: 1, height: 1, background: C.divider }} />
                </div>

                <form onSubmit={handleSignup} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Nom complet</label>
                    <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ahmed Benali" required
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = C.inputFocus)} onBlur={e => (e.target.style.borderColor = C.inputBorder)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = C.inputFocus)} onBlur={e => (e.target.style.borderColor = C.inputBorder)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Mot de passe</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Min. 6 caractères" required minLength={6}
                        style={{ ...inputStyle, paddingRight: 44 }}
                        onFocus={e => (e.target.style.borderColor = C.inputFocus)} onBlur={e => (e.target.style.borderColor = C.inputBorder)} />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4, opacity: loading ? 0.6 : 1 }}>
                    {loading ? 'Création...' : 'Créer mon compte'}
                  </button>
                </form>
                <p style={{ marginTop: 18, fontSize: 14, color: C.muted }}>
                  Déjà un compte ?{' '}
                  <button onClick={() => { setAuthMode('login'); resetForm() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontWeight: 600, fontSize: 14 }}>
                    Se connecter
                  </button>
                </p>
              </>
            )}

            {/* ── Verify pending ── */}
            {authMode === 'verify-pending' && (
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.selBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Mail size={28} color={C.primary} />
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 10px' }}>Vérifiez votre email</h1>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
                  Nous avons envoyé un lien à <strong style={{ color: C.text }}>{pendingEmail}</strong>.
                  <br />Cliquez dessus pour activer votre compte.
                </p>
                <button onClick={handleResend} disabled={loading} style={{ ...outlineBtn, marginBottom: 14, opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Envoi...' : 'Renvoyer l\'email'}
                </button>
                <button onClick={() => { setAuthMode('options'); resetForm() }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: C.muted }}>
                  Retour à l&apos;accueil
                </button>
              </div>
            )}

            {/* ── Login ── */}
            {authMode === 'login' && (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 4px', textAlign: 'center' }}>Log in</h1>
                <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, textAlign: 'center' }}>Content de vous revoir !</p>

                {/* Social row on login too */}
                <div style={{ width: '100%', display: 'flex', gap: 11, marginBottom: 20 }}>
                  <GoogleOverlayBtn loading={loading} overlayRef={googleOverlayCallback} />
                  <SocialBtn icon={<FacebookIcon />} label="Facebook" disabled />
                  <SocialBtn icon={<AppleIcon />} label="Apple" disabled />
                </div>

                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, height: 1, background: C.divider }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.divider }}>or</span>
                  <div style={{ flex: 1, height: 1, background: C.divider }} />
                </div>

                <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = C.inputFocus)} onBlur={e => (e.target.style.borderColor = C.inputBorder)} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Mot de passe</label>
                      <button type="button" onClick={() => { setAuthMode('forgot'); resetForm() }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.primary, fontWeight: 500 }}>
                        Mot de passe oublié ?
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Votre mot de passe" required
                        style={{ ...inputStyle, paddingRight: 44 }}
                        onFocus={e => (e.target.style.borderColor = C.inputFocus)} onBlur={e => (e.target.style.borderColor = C.inputBorder)} />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4, opacity: loading ? 0.6 : 1 }}>
                    {loading ? 'Connexion...' : 'Se connecter'}
                  </button>
                </form>

                <p style={{ marginTop: 18, fontSize: 14, color: C.muted }}>
                  Pas encore de compte ?{' '}
                  <button onClick={() => { setAuthMode('signup'); resetForm() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontWeight: 600, fontSize: 14 }}>
                    Créer un compte
                  </button>
                </p>
              </>
            )}

            {/* ── Forgot password ── */}
            {authMode === 'forgot' && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 6px', textAlign: 'center' }}>Mot de passe oublié</h1>
                <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, textAlign: 'center', lineHeight: 1.5 }}>
                  Entrez votre email, nous vous enverrons un lien de réinitialisation.
                </p>
                <form onSubmit={handleForgot} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = C.inputFocus)} onBlur={e => (e.target.style.borderColor = C.inputBorder)} />
                  </div>
                  <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4, opacity: loading ? 0.6 : 1 }}>
                    {loading ? 'Envoi...' : 'Envoyer le lien'}
                  </button>
                </form>
                <button onClick={() => { setAuthMode('login'); resetForm() }}
                  style={{ marginTop: 18, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: C.primary, fontWeight: 500 }}>
                  Retour à la connexion
                </button>
              </>
            )}

            {/* ── Forgot sent ── */}
            {authMode === 'forgot-sent' && (
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.selBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 10px' }}>Email envoyé !</h1>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
                  Si un compte existe avec cette adresse, vous recevrez un lien sous peu.
                </p>
                <button onClick={() => { setAuthMode('login'); resetForm() }} style={primaryBtn}>
                  Retour à la connexion
                </button>
              </div>
            )}
          </>
        )}

        {/* ── NIVEAU ── */}
        {step === 'niveau' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 6px', textAlign: 'center' }}>Quel est votre niveau ?</h1>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, textAlign: 'center' }}>Cela nous aide à personnaliser votre expérience.</p>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {NIVEAUX.map(n => (
                <button key={n.id} onClick={() => setSelectedLevel(n.id)} style={{
                  width: '100%', textAlign: 'left', padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
                  border: `2px solid ${selectedLevel === n.id ? C.selBorder : C.inputBorder}`,
                  background: selectedLevel === n.id ? C.selBg : 'transparent',
                  color: selectedLevel === n.id ? C.primary : C.text,
                  fontSize: 15, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  {n.label}
                  {selectedLevel === n.id && <Check size={16} />}
                </button>
              ))}
            </div>
            <button onClick={() => selectedLevel && setStep('filiere')} disabled={!selectedLevel}
              style={{ ...primaryBtn, opacity: selectedLevel ? 1 : 0.4 }}>
              Continuer
            </button>
          </>
        )}

        {/* ── FILIERE ── */}
        {step === 'filiere' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 6px', textAlign: 'center' }}>Quelle est votre filière ?</h1>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 20, textAlign: 'center' }}>Sélectionnez votre spécialité du Bac.</p>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', marginBottom: 24, paddingRight: 4 }}>
              {SPECIALITES.map(spec => (
                <button key={spec} onClick={() => setSelectedSpec(spec)} style={{
                  width: '100%', textAlign: 'left', padding: '13px 16px', borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                  border: `2px solid ${selectedSpec === spec ? C.selBorder : C.inputBorder}`,
                  background: selectedSpec === spec ? C.selBg : 'transparent',
                  color: selectedSpec === spec ? C.primary : C.text,
                  fontSize: 14, fontWeight: selectedSpec === spec ? 600 : 400,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  {spec}
                  {selectedSpec === spec && <Check size={14} style={{ flexShrink: 0 }} />}
                </button>
              ))}
            </div>
            <button onClick={saveOnboarding} disabled={!selectedSpec || loading}
              style={{ ...primaryBtn, opacity: !selectedSpec || loading ? 0.4 : 1 }}>
              {loading ? 'Sauvegarde...' : 'Commencer'}
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <p style={{ position: 'absolute', bottom: 20, fontSize: 12, color: C.muted, textAlign: 'center', padding: '0 16px' }}>
        By using Kresco services, you agree to our{' '}
        <a href="#" style={{ color: C.hint, textDecoration: 'underline' }}>Terms</a>
        {' '}and{' '}
        <a href="#" style={{ color: C.hint, textDecoration: 'underline' }}>Privacy</a>.
      </p>
    </div>
  )
}
