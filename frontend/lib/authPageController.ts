'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { patchJson, postJson } from '@/lib/apiClient'
import { resolveAuthSuccess } from '@/lib/authPolicy'
import { useAuthStore } from '@/lib/store'
import { apiDataErrorMessage } from '@/lib/apiData'

declare global {
  interface Window {
    google: any
  }
}

export type AuthStep = 'auth' | 'niveau' | 'filiere'
export type AuthMode = 'options' | 'login' | 'signup' | 'verify-pending' | 'forgot' | 'forgot-sent'

type OnboardingUserLike = {
  niveau?: string | null
  filiere?: string | null
}

const UNVERIFIED_EMAIL_LOGIN_DETAIL = 'Veuillez verifier votre email avant de vous connecter'

export function normalizeEmailInput(value: string) {
  return value.trim().toLowerCase()
}

export function isUnverifiedEmailLoginError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const response = (error as { response?: { status?: number; data?: { detail?: unknown } } }).response
  return response?.status === 403 && response.data?.detail === UNVERIFIED_EMAIL_LOGIN_DETAIL
}

export function getOnboardingSelections(user: OnboardingUserLike | null | undefined) {
  return {
    selectedLevel: typeof user?.niveau === 'string' ? user.niveau.trim() : '',
    selectedSpec: typeof user?.filiere === 'string' ? user.filiere.trim() : '',
  }
}

export function canSubmitOnboarding(selectedLevel: string, selectedSpec: string, loading = false) {
  return !loading && Boolean(selectedLevel.trim()) && Boolean(selectedSpec.trim())
}

export function useAuthPageController() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextDestination = searchParams.get('next')
  const login = useAuthStore((state) => state.login)
  const token = useAuthStore((state) => state.token)
  const hydrate = useAuthStore((state) => state.hydrate)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const hiddenGoogleRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<AuthStep>('auth')
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
    const resolution = resolveAuthSuccess(
      nextUser as { role?: string; niveau?: string; filiere?: string },
      nextDestination,
    )
    if (resolution.action === 'onboarding') {
      const onboardingSelections = getOnboardingSelections(nextUser as OnboardingUserLike)
      setSelectedLevel(onboardingSelections.selectedLevel)
      setSelectedSpec(onboardingSelections.selectedSpec)
      setStep(resolution.step)
      return
    }

    if (mode === 'replace') router.replace(resolution.destination)
    else router.push(resolution.destination)
  }, [nextDestination, router])

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isHydrated) return
    if (token && user) {
      handleAuthResolution(user, 'replace')
    }
  }, [handleAuthResolution, isHydrated, token, user])

  useEffect(() => {
    const handleGoogleCredential = async (response: any) => {
      setLoading(true)
      try {
        const data = await postJson<any>('/google-login', { credential: response.credential })
        login(data.user, data.csrf_token)
        toast.success(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
        handleAuthResolution(data.user)
      } catch (err: any) {
        toast.error(apiDataErrorMessage(err, 'Connexion échouée.'))
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
          callback: handleGoogleCredential,
        })
        window.google.accounts.id.renderButton(hiddenGoogleRef.current, {
          size: 'large', width: 1, text: 'continue_with',
        })
        setGoogleReady(true)
      }
    }
    document.head.appendChild(script)
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
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

  function showSignup() {
    setAuthMode('signup')
    resetForm()
  }

  function showLogin() {
    setAuthMode('login')
    resetForm()
  }

  function showForgot() {
    setAuthMode('forgot')
    resetForm()
  }

  function showOptions() {
    setAuthMode('options')
    resetForm()
  }

  function goBack() {
    if (step === 'filiere') setStep('niveau')
    else if (authMode === 'login' || authMode === 'signup') showOptions()
    else if (authMode === 'forgot') showLogin()
    else setStep('auth')
  }

  function goToFiliere() {
    if (selectedLevel) setStep('filiere')
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return toast.error('Entrez votre nom complet')
    if (password.length < 6) return toast.error('Mot de passe trop court (min. 6 caractères)')
    setLoading(true)
    try {
      const normalizedEmail = normalizeEmailInput(email)
      const data = await postJson<any>('/auth/signup', { email: normalizedEmail, password, full_name: fullName })
      setPendingEmail(normalizeEmailInput(data.email))
      setAuthMode('verify-pending')
      toast.success('Email de vérification envoyé !')
    } catch (err: any) {
      toast.error(apiDataErrorMessage(err, 'Erreur lors de la création du compte.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const normalizedEmail = normalizeEmailInput(email)
      const data = await postJson<any>('/auth/login', { email: normalizedEmail, password })
      login(data.user, data.csrf_token)
      toast.success(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
      handleAuthResolution(data.user)
    } catch (err: any) {
      if (isUnverifiedEmailLoginError(err)) {
        setPendingEmail(normalizeEmailInput(email))
        setAuthMode('verify-pending')
        toast.error('Vérifiez votre email avant de vous connecter.')
      } else {
        toast.error(apiDataErrorMessage(err, 'Email ou mot de passe incorrect.'))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await postJson('/auth/forgot-password', { email: normalizeEmailInput(email) })
      setAuthMode('forgot-sent')
    } catch (err) {
      toast.error(apiDataErrorMessage(err, 'Impossible d\'envoyer le lien de reinitialisation.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!pendingEmail) return
    setLoading(true)
    try {
      await postJson('/auth/resend-verification', { email: normalizeEmailInput(pendingEmail) })
      toast.success('Email renvoyé !')
    } catch {
      toast.error('Impossible d\'envoyer l\'email.')
    } finally {
      setLoading(false)
    }
  }

  async function saveOnboarding() {
    if (!canSubmitOnboarding(selectedLevel, selectedSpec, loading)) {
      toast.error('Selectionnez votre niveau et votre filiere.')
      return
    }

    setLoading(true)
    try {
      const data = await patchJson<any>('/profile/me', { niveau: selectedLevel, filiere: selectedSpec })
      updateUser({ niveau: data.niveau, filiere: data.filiere })
      const resolution = resolveAuthSuccess(data, nextDestination)
      router.push(resolution.action === 'redirect' ? resolution.destination : '/home')
    } catch {
      toast.error('Erreur lors de la sauvegarde.')
      setLoading(false)
    }
  }

  const canGoBack = step !== 'auth' || !['options', 'verify-pending', 'forgot-sent'].includes(authMode)
  const stepNum = step === 'auth' ? 1 : step === 'niveau' ? 2 : 3
  const progressWidthClass = stepNum === 1 ? 'w-1/3' : stepNum === 2 ? 'w-2/3' : 'w-full'

  return {
    authMode,
    canGoBack,
    email,
    fullName,
    goBack,
    goToFiliere,
    googleReady,
    handleForgot,
    handleLogin,
    handleResend,
    handleSignup,
    hiddenGoogleRef,
    loading,
    password,
    pendingEmail,
    progressWidthClass,
    saveOnboarding,
    selectedLevel,
    selectedSpec,
    setEmail,
    setFullName,
    setPassword,
    setSelectedLevel,
    setSelectedSpec,
    setShowPassword,
    showForgot,
    showLogin,
    showOptions,
    showPassword,
    showSignup,
    step,
    triggerGoogle,
  }
}

export type AuthPageController = ReturnType<typeof useAuthPageController>
