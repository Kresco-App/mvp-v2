'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import { patchJson, postJson } from '@/lib/apiClient'
import { resolveAuthSuccess } from '@/lib/authPolicy'
import { isStoredAuthSnapshot } from '@/lib/authSession'
import { useAuthStore } from '@/lib/store'
import { apiDataErrorMessage, apiErrorStatus } from '@/lib/apiData'
import { isFirebaseGoogleAuthConfigured } from '@/lib/firebaseConfig'

export type AuthStep = 'auth' | 'niveau' | 'filiere'
export type AuthMode = 'options' | 'login' | 'signup' | 'verify-pending' | 'forgot' | 'forgot-sent'
export type AuthPendingAction = 'google' | 'signup' | 'login' | 'forgot' | 'resend'

type OnboardingUserLike = {
  niveau?: string | null
  filiere?: string | null
}

type AuthResolutionHandler = (nextUser: unknown, mode?: 'push' | 'replace') => void

const UNVERIFIED_EMAIL_LOGIN_DETAIL = 'Veuillez verifier votre email avant de vous connecter'
const AUTH_ACTION_TIMEOUT_MS = 20_000

class AuthActionTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthActionTimeoutError'
  }
}

function withAuthActionTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AuthActionTimeoutError(message))
    }, AUTH_ACTION_TIMEOUT_MS)
  })

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

export function normalizeEmailInput(value: string) {
  return value.trim().toLowerCase()
}

export function isUnverifiedEmailLoginError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const response = (error as { response?: { status?: number; data?: { detail?: unknown } } }).response
  return response?.status === 403 && response.data?.detail === UNVERIFIED_EMAIL_LOGIN_DETAIL
}

export function loginErrorMessage(error: unknown) {
  if (isCredentialErrorLike(error)) return 'Email ou mot de passe incorrect.'

  const status = apiErrorStatus(error)
  if (status && status >= 500) {
    return apiDataErrorMessage(error, 'Serveur indisponible. Verifiez que le backend est lance.')
  }
  return apiDataErrorMessage(error, 'Email ou mot de passe incorrect.')
}

function isCredentialErrorLike(error: unknown) {
  const code = (error as { code?: unknown })?.code
  if (typeof code === 'string') {
    return [
      'auth/invalid-credential',
      'auth/invalid-email',
      'auth/missing-password',
      'auth/user-not-found',
      'auth/wrong-password',
    ].includes(code)
  }

  if (error instanceof Error) {
    return /auth\/(invalid-credential|invalid-email|missing-password|user-not-found|wrong-password)/i.test(error.message)
  }

  return false
}

function isFirebaseEmailNotVerifiedErrorLike(error: unknown): error is { email: string } {
  return (
    error instanceof Error &&
    error.name === 'FirebaseEmailNotVerifiedError' &&
    typeof (error as { email?: unknown }).email === 'string'
  )
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

function useAuthFlowRouter() {
  const [step, setStep] = useState<AuthStep>('auth')
  const [authMode, setAuthMode] = useState<AuthMode>('options')

  const canGoBack = step !== 'auth' || !['options', 'verify-pending', 'forgot-sent'].includes(authMode)
  const stepNum = step === 'auth' ? 1 : step === 'niveau' ? 2 : 3
  const progressWidthClass = stepNum === 1 ? 'w-1/3' : stepNum === 2 ? 'w-2/3' : 'w-full'

  return {
    authMode,
    canGoBack,
    progressWidthClass,
    setAuthMode,
    setStep,
    step,
  }
}

function useOnboardingForm({
  nextDestination,
  setStep,
}: {
  nextDestination: string | null
  setStep: (step: AuthStep) => void
}) {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const [loading, setLoading] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState('')
  const [selectedSpec, setSelectedSpec] = useState('')

  const hydrateOnboardingUser = useCallback((nextUser: OnboardingUserLike, nextStep: AuthStep) => {
    const onboardingSelections = getOnboardingSelections(nextUser)
    setSelectedLevel(onboardingSelections.selectedLevel)
    setSelectedSpec(onboardingSelections.selectedSpec)
    setStep(nextStep)
  }, [setStep])

  useEffect(() => {
    if (!user || isStoredAuthSnapshot(user)) return
    const resolution = resolveAuthSuccess(user, nextDestination)
    if (resolution.action !== 'onboarding') return

    hydrateOnboardingUser(user, resolution.step)
  }, [hydrateOnboardingUser, nextDestination, user])

  async function saveOnboarding() {
    if (!canSubmitOnboarding(selectedLevel, selectedSpec, loading)) {
      showToastError('Selectionnez votre niveau et votre filiere.')
      return
    }

    setLoading(true)
    try {
      const data = await patchJson<any>('/profile/me', { niveau: selectedLevel, filiere: selectedSpec })
      updateUser({ niveau: data.niveau, filiere: data.filiere })
      const resolution = resolveAuthSuccess(data, nextDestination)
      router.push(resolution.action === 'redirect' ? resolution.destination : '/home')
    } catch {
      showToastError('Erreur lors de la sauvegarde.')
      setLoading(false)
    }
  }

  return {
    hydrateOnboardingUser,
    loading,
    saveOnboarding,
    selectedLevel,
    selectedSpec,
    setSelectedLevel,
    setSelectedSpec,
  }
}

function useAuthForm({
  onAuthResolution,
  setAuthMode,
}: {
  onAuthResolution: AuthResolutionHandler
  setAuthMode: (mode: AuthMode) => void
}) {
  const login = useAuthStore((state) => state.login)
  const hiddenGoogleRef = useRef<HTMLDivElement>(null)
  const googleRedirectHandledRef = useRef(false)
  const googleFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingActionRef = useRef<AuthPendingAction | null>(null)
  const [pendingAction, setPendingAction] = useState<AuthPendingAction | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const [authErrorVersion, setAuthErrorVersion] = useState(0)
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setGoogleReady(isFirebaseGoogleAuthConfigured())
  }, [])

  useEffect(() => {
    pendingActionRef.current = pendingAction
  }, [pendingAction])

  useEffect(() => {
    return () => {
      if (googleFallbackTimerRef.current) clearTimeout(googleFallbackTimerRef.current)
    }
  }, [])

  const completeFirebaseSession = useCallback(async (credential: string) => {
    const data = await postJson<any>('/auth/firebase-session', { credential })
    login(data.user, data.csrf_token)
    showToastSuccess(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
    onAuthResolution(data.user)
  }, [login, onAuthResolution])

  useEffect(() => {
    if (!googleReady || googleRedirectHandledRef.current) return
    googleRedirectHandledRef.current = true

    let alive = true
    async function consumeGoogleRedirect() {
      try {
        const { getFirebaseGoogleRedirectIdToken } = await import('@/lib/firebaseAuth')
        const credential = await getFirebaseGoogleRedirectIdToken()
        if (!credential || !alive) return
        setPendingAction('google')
        setAuthErrorMessage(null)
        await completeFirebaseSession(credential)
      } catch (err: any) {
        if (alive) {
          const message = apiDataErrorMessage(err, 'Connexion Google echouee.')
          setAuthErrorMessage(message)
          showToastError(message)
        }
      } finally {
        if (alive) setPendingAction(null)
      }
    }

    void consumeGoogleRedirect()
    return () => { alive = false }
  }, [completeFirebaseSession, googleReady])

  async function triggerGoogle() {
    if (!googleReady || pendingAction) return
    pendingActionRef.current = 'google'
    setPendingAction('google')
    if (googleFallbackTimerRef.current) clearTimeout(googleFallbackTimerRef.current)
    googleFallbackTimerRef.current = setTimeout(() => {
      googleFallbackTimerRef.current = null
      if (pendingActionRef.current === 'google') {
        const message = 'Connexion Google interrompue. Reessayez ou utilisez votre email.'
        setAuthErrorMessage(message)
        showToastError(message)
        pendingActionRef.current = null
        setPendingAction(null)
      }
    }, 12000)
    try {
      const { startFirebaseGoogleRedirect } = await import('@/lib/firebaseAuth')
      await startFirebaseGoogleRedirect()
    } catch (err: any) {
      const message = apiDataErrorMessage(err, 'Connexion Google echouee.')
      setAuthErrorMessage(message)
      showToastError(message)
    } finally {
      if (googleFallbackTimerRef.current) {
        clearTimeout(googleFallbackTimerRef.current)
        googleFallbackTimerRef.current = null
      }
      pendingActionRef.current = null
      setPendingAction(null)
    }
  }

  function clearPendingGoogleAction() {
    if (pendingActionRef.current !== 'google') return
    if (googleFallbackTimerRef.current) {
      clearTimeout(googleFallbackTimerRef.current)
      googleFallbackTimerRef.current = null
    }
    pendingActionRef.current = null
    setPendingAction((current) => (current === 'google' ? null : current))
  }

  function resetForm() {
    clearPendingGoogleAction()
    setEmail('')
    setPassword('')
    setFullName('')
    setShowPassword(false)
    setAuthErrorVersion(0)
    setAuthErrorMessage(null)
  }

  function updateEmail(value: string) {
    setEmail(value)
    if (authErrorMessage) setAuthErrorMessage(null)
  }

  function updatePassword(value: string) {
    setPassword(value)
    if (authErrorMessage) setAuthErrorMessage(null)
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (pendingAction) return
    setAuthErrorMessage(null)
    if (!fullName.trim()) return showToastError('Entrez votre nom complet')
    if (password.length < 8) return showToastError('Mot de passe trop court (min. 8 caracteres)')
    setPendingAction('signup')
    try {
      const { createFirebaseEmailUser } = await import('@/lib/firebaseAuth')
      const normalizedEmail = normalizeEmailInput(email)
      const firebaseEmail = await withAuthActionTimeout(
        createFirebaseEmailUser(normalizedEmail, password, fullName),
        'Creation du compte trop longue. Reessayez.',
      )
      setPendingEmail(normalizeEmailInput(firebaseEmail))
      setAuthMode('verify-pending')
      showToastSuccess('Email de verification envoye !')
    } catch (err: any) {
      showToastError(apiDataErrorMessage(err, 'Erreur lors de la creation du compte.'))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (pendingAction) return
    setAuthErrorMessage(null)
    setPendingAction('login')
    try {
      const { getFirebaseEmailPasswordIdToken } = await import('@/lib/firebaseAuth')
      const normalizedEmail = normalizeEmailInput(email)
      const credential = await withAuthActionTimeout(
        getFirebaseEmailPasswordIdToken(normalizedEmail, password),
        'Connexion trop longue. Reessayez.',
      )
      const data = await withAuthActionTimeout(
        postJson<any>('/auth/firebase-session', { credential }),
        'Connexion trop longue. Reessayez.',
      )
      login(data.user, data.csrf_token)
      showToastSuccess(`Bienvenue, ${data.user.full_name?.split(' ')[0] || ''} !`)
      onAuthResolution(data.user)
    } catch (err: any) {
      if (isFirebaseEmailNotVerifiedErrorLike(err) || isUnverifiedEmailLoginError(err)) {
        const message = 'Verifiez votre email avant de vous connecter.'
        setPendingEmail(normalizeEmailInput(isFirebaseEmailNotVerifiedErrorLike(err) ? err.email : email))
        setAuthMode('verify-pending')
        setAuthErrorMessage(message)
        showToastError(message)
      } else {
        const message = loginErrorMessage(err)
        setAuthErrorVersion((version) => version + 1)
        setAuthErrorMessage(message)
        showToastError(message)
      }
    } finally {
      setPendingAction(null)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    if (pendingAction) return
    setAuthErrorMessage(null)
    setPendingAction('forgot')
    try {
      const { sendFirebasePasswordReset } = await import('@/lib/firebaseAuth')
      await withAuthActionTimeout(
        sendFirebasePasswordReset(normalizeEmailInput(email)),
        'Envoi trop long. Reessayez.',
      )
      setAuthMode('forgot-sent')
    } catch (err) {
      showToastError(apiDataErrorMessage(err, 'Impossible d\'envoyer le lien de reinitialisation.'))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleResend() {
    if (pendingAction) return
    if (!pendingEmail) return
    if (!password) {
      showToastError("Entrez votre mot de passe pour renvoyer l'email.")
      return
    }
    setPendingAction('resend')
    try {
      const { resendFirebaseEmailVerification } = await import('@/lib/firebaseAuth')
      await withAuthActionTimeout(
        resendFirebaseEmailVerification(normalizeEmailInput(pendingEmail), password),
        'Envoi trop long. Reessayez.',
      )
      showToastSuccess('Email renvoye !')
    } catch {
      showToastError('Impossible d\'envoyer l\'email.')
    } finally {
      setPendingAction(null)
    }
  }

  return {
    email,
    fullName,
    googleReady,
    handleForgot,
    handleLogin,
    handleResend,
    handleSignup,
    hiddenGoogleRef,
    authErrorVersion,
    authErrorMessage,
    loading: Boolean(pendingAction),
    password,
    pendingAction,
    pendingEmail,
    resetForm,
    setEmail: updateEmail,
    setFullName,
    setPassword: updatePassword,
    setShowPassword,
    showPassword,
    triggerGoogle,
  }
}

export function useAuthPageController() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextDestination = searchParams.get('next')
  const flow = useAuthFlowRouter()
  const onboarding = useOnboardingForm({
    nextDestination,
    setStep: flow.setStep,
  })
  const { hydrateOnboardingUser } = onboarding

  const handleAuthResolution = useCallback<AuthResolutionHandler>((nextUser, mode = 'push') => {
    const resolution = resolveAuthSuccess(
      nextUser as { role?: string; niveau?: string; filiere?: string },
      nextDestination,
    )
    if (resolution.action === 'onboarding') {
      hydrateOnboardingUser(nextUser as OnboardingUserLike, resolution.step)
      return
    }

    if (mode === 'replace') router.replace(resolution.destination)
    else router.push(resolution.destination)
  }, [hydrateOnboardingUser, nextDestination, router])

  const authForm = useAuthForm({
    onAuthResolution: handleAuthResolution,
    setAuthMode: flow.setAuthMode,
  })
  const loading = authForm.loading || onboarding.loading

  function showSignup() {
    flow.setAuthMode('signup')
    authForm.resetForm()
  }

  function showLogin() {
    flow.setAuthMode('login')
    authForm.resetForm()
  }

  function showForgot() {
    flow.setAuthMode('forgot')
    authForm.resetForm()
  }

  function showOptions() {
    flow.setAuthMode('options')
    authForm.resetForm()
  }

  function goBack() {
    if (flow.step === 'filiere') flow.setStep('niveau')
    else if (flow.authMode === 'login' || flow.authMode === 'signup') showOptions()
    else if (flow.authMode === 'forgot') showLogin()
    else flow.setStep('auth')
  }

  function goToFiliere() {
    if (onboarding.selectedLevel) flow.setStep('filiere')
  }

  return {
    authMode: flow.authMode,
    canGoBack: flow.canGoBack,
    email: authForm.email,
    fullName: authForm.fullName,
    goBack,
    goToFiliere,
    googleReady: authForm.googleReady,
    handleForgot: authForm.handleForgot,
    handleLogin: authForm.handleLogin,
    handleResend: authForm.handleResend,
    handleSignup: authForm.handleSignup,
    hiddenGoogleRef: authForm.hiddenGoogleRef,
    authErrorVersion: authForm.authErrorVersion,
    authErrorMessage: authForm.authErrorMessage,
    loading,
    password: authForm.password,
    pendingAction: authForm.pendingAction,
    pendingEmail: authForm.pendingEmail,
    progressWidthClass: flow.progressWidthClass,
    saveOnboarding: onboarding.saveOnboarding,
    selectedLevel: onboarding.selectedLevel,
    selectedSpec: onboarding.selectedSpec,
    setEmail: authForm.setEmail,
    setFullName: authForm.setFullName,
    setPassword: authForm.setPassword,
    setSelectedLevel: onboarding.setSelectedLevel,
    setSelectedSpec: onboarding.setSelectedSpec,
    setShowPassword: authForm.setShowPassword,
    showForgot,
    showLogin,
    showOptions,
    showPassword: authForm.showPassword,
    showSignup,
    step: flow.step,
    triggerGoogle: authForm.triggerGoogle,
  }
}

export type AuthPageController = ReturnType<typeof useAuthPageController>
