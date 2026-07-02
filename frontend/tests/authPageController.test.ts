// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  canSubmitOnboarding,
  getOnboardingSelections,
  isUnverifiedEmailLoginError,
  loginErrorMessage,
  normalizeEmailInput,
  useAuthPageController,
} from '@/lib/authPageController'
import { KRESCO_STORED_AUTH_SNAPSHOT } from '@/lib/authSession'

const mocks = vi.hoisted(() => {
  const authState = {
    user: null as { role?: string; niveau?: string | null; filiere?: string | null } | null,
    token: null as string | null,
    isHydrated: true,
    hydrate: vi.fn(),
    login: vi.fn((user: { role?: string; niveau?: string | null; filiere?: string | null }) => {
      authState.user = user
      authState.token = 'cookie-session'
    }),
    logout: vi.fn(),
    updateUser: vi.fn((patch: Record<string, unknown>) => {
      authState.user = { ...(authState.user ?? {}), ...patch }
    }),
    isAuthenticated: true,
  }

  return {
    authState,
    routerPush: vi.fn(),
    routerReplace: vi.fn(),
    patchJson: vi.fn(),
    postJson: vi.fn(),
    createFirebaseEmailUser: vi.fn(),
    getFirebaseEmailPasswordIdToken: vi.fn(),
    getFirebaseGoogleRedirectIdToken: vi.fn(),
    isFirebaseEmailNotVerifiedError: vi.fn(),
    isFirebaseGoogleAuthConfigured: vi.fn(),
    resendFirebaseEmailVerification: vi.fn(),
    sendFirebasePasswordReset: vi.fn(),
    startFirebaseGoogleRedirect: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerReplace }),
  useSearchParams: () => ({ get: (key: string) => (key === 'next' ? null : null) }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/lib/apiClient', () => ({
  patchJson: mocks.patchJson,
  postJson: mocks.postJson,
}))

vi.mock('@/lib/firebaseAuth', () => ({
  createFirebaseEmailUser: mocks.createFirebaseEmailUser,
  getFirebaseEmailPasswordIdToken: mocks.getFirebaseEmailPasswordIdToken,
  getFirebaseGoogleRedirectIdToken: mocks.getFirebaseGoogleRedirectIdToken,
  isFirebaseEmailNotVerifiedError: mocks.isFirebaseEmailNotVerifiedError,
  resendFirebaseEmailVerification: mocks.resendFirebaseEmailVerification,
  sendFirebasePasswordReset: mocks.sendFirebasePasswordReset,
  startFirebaseGoogleRedirect: mocks.startFirebaseGoogleRedirect,
}))

vi.mock('@/lib/firebaseConfig', () => ({
  isFirebaseGoogleAuthConfigured: mocks.isFirebaseGoogleAuthConfigured,
}))

vi.mock('@/lib/store', () => ({
  useAuthStore: (selector: (state: typeof mocks.authState) => unknown) => selector(mocks.authState),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null
let latestController: ReturnType<typeof useAuthPageController> | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  latestController = null
  mocks.authState.user = null
  mocks.authState.token = null
  mocks.authState.isHydrated = true
  mocks.authState.hydrate.mockImplementation(() => undefined)
  mocks.authState.login.mockImplementation((user: { role?: string; niveau?: string | null; filiere?: string | null }) => {
    mocks.authState.user = user
    mocks.authState.token = 'cookie-session'
  })
  mocks.authState.updateUser.mockImplementation((patch: Record<string, unknown>) => {
    mocks.authState.user = { ...(mocks.authState.user ?? {}), ...patch }
  })
  mocks.patchJson.mockResolvedValue({ data: { niveau: '2bac', filiere: 'Sciences Math B' } })
  mocks.postJson.mockResolvedValue({ data: {} })
  mocks.createFirebaseEmailUser.mockResolvedValue('student@example.com')
  mocks.getFirebaseEmailPasswordIdToken.mockResolvedValue('firebase-id-token')
  mocks.getFirebaseGoogleRedirectIdToken.mockResolvedValue(null)
  mocks.isFirebaseEmailNotVerifiedError.mockReturnValue(false)
  mocks.isFirebaseGoogleAuthConfigured.mockReturnValue(true)
  mocks.resendFirebaseEmailVerification.mockResolvedValue(undefined)
  mocks.sendFirebasePasswordReset.mockResolvedValue(undefined)
  mocks.startFirebaseGoogleRedirect.mockResolvedValue(undefined)
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
  }
  mountedRoot = null
})

describe('auth page login error handling', () => {
  it('normalizes email inputs before submission', () => {
    expect(normalizeEmailInput('  USER.Name+Tag@Example.COM  ')).toBe('user.name+tag@example.com')
  })

  it('only treats the backend unverified-email detail as an email verification error', () => {
    expect(isUnverifiedEmailLoginError({
      response: {
        status: 403,
        data: { detail: 'Veuillez verifier votre email avant de vous connecter' },
      },
    })).toBe(true)

    expect(isUnverifiedEmailLoginError({
      response: {
        status: 403,
        data: { detail: 'CSRF origin is not trusted' },
      },
    })).toBe(false)
  })

  it('does not treat unrelated auth failures as pending verification', () => {
    expect(isUnverifiedEmailLoginError({
      response: {
        status: 401,
        data: { detail: 'Email ou mot de passe incorrect' },
      },
    })).toBe(false)
    expect(isUnverifiedEmailLoginError(new Error('Network failed'))).toBe(false)
  })

  it('does not present backend failures as wrong credentials', async () => {
    const backendError = { response: { status: 500, data: {} } }
    expect(loginErrorMessage(backendError)).toBe('Serveur indisponible. Verifiez que le backend est lance. (500)')
    mocks.postJson.mockRejectedValueOnce(backendError)

    renderController()

    await act(async () => {
      latestController?.showLogin()
      latestController?.setEmail('student@example.com')
      latestController?.setPassword('password123')
    })

    await act(async () => {
      await latestController?.handleLogin({
        preventDefault: () => undefined,
      } as unknown as React.FormEvent)
    })

    expect(mocks.getFirebaseEmailPasswordIdToken).toHaveBeenCalledWith('student@example.com', 'password123')
    expect(mocks.toastError).toHaveBeenCalledWith('Serveur indisponible. Verifiez que le backend est lance. (500)')
    expect(latestController?.authErrorMessage).toBe('Serveur indisponible. Verifiez que le backend est lance. (500)')
  })

  it('presents Firebase credential failures as a clean login toast', async () => {
    const firebaseError = { code: 'auth/invalid-credential', message: 'Firebase: Error (auth/invalid-credential).' }
    expect(loginErrorMessage(firebaseError)).toBe('Email ou mot de passe incorrect.')

    mocks.getFirebaseEmailPasswordIdToken.mockRejectedValueOnce(firebaseError)

    renderController()

    await act(async () => {
      latestController?.showLogin()
      latestController?.setEmail('student@example.com')
      latestController?.setPassword('bad-password')
    })

    await act(async () => {
      await latestController?.handleLogin({
        preventDefault: () => undefined,
      } as unknown as React.FormEvent)
    })

    expect(mocks.toastError).toHaveBeenCalledWith('Email ou mot de passe incorrect.')
    expect(latestController?.authErrorVersion).toBe(1)
    expect(latestController?.authErrorMessage).toBe('Email ou mot de passe incorrect.')
  })

  it('clears the visible auth error trigger when switching forms', async () => {
    mocks.getFirebaseEmailPasswordIdToken.mockRejectedValueOnce({ code: 'auth/invalid-credential' })

    renderController()

    await act(async () => {
      latestController?.showLogin()
      latestController?.setEmail('student@example.com')
      latestController?.setPassword('bad-password')
    })

    await act(async () => {
      await latestController?.handleLogin({
        preventDefault: () => undefined,
      } as unknown as React.FormEvent)
    })

    expect(latestController?.authErrorVersion).toBe(1)

    await act(async () => {
      latestController?.showSignup()
    })

    expect(latestController?.authErrorVersion).toBe(0)
  })
})

describe('auth page onboarding state', () => {
  it('exchanges a returned Firebase Google redirect credential for an app session', async () => {
    mocks.getFirebaseGoogleRedirectIdToken.mockResolvedValueOnce('firebase-google-token')
    mocks.postJson.mockResolvedValueOnce({
      user: {
        role: 'student',
        full_name: 'Google Student',
        niveau: '2bac',
        filiere: 'Sciences Math B',
      },
      csrf_token: 'csrf-token',
    })

    renderController()

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith('/auth/firebase-session', {
        credential: 'firebase-google-token',
      })
      expect(mocks.authState.login).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Google Student' }),
        'csrf-token',
      )
      expect(mocks.routerPush).toHaveBeenCalledWith('/home')
    })
  })

  it('does not infer onboarding from minimal stored auth snapshots', async () => {
    mocks.authState.user = {
      [KRESCO_STORED_AUTH_SNAPSHOT]: true,
      role: 'student',
    } as typeof mocks.authState.user
    mocks.authState.token = 'cookie-session'

    renderController()

    await waitFor(() => {
      expect(latestController?.step).toBe('auth')
    })
    expect(mocks.routerReplace).not.toHaveBeenCalled()
  })

  it('hydrates the saved niveau when resuming at the filiere step', async () => {
    mocks.authState.user = {
      role: 'student',
      niveau: '2bac',
      filiere: '',
    }
    mocks.authState.token = 'cookie-session'

    renderController()

    await waitFor(() => {
      expect(latestController?.step).toBe('filiere')
    })

    expect(latestController?.selectedLevel).toBe('2bac')
    expect(latestController?.selectedSpec).toBe('')
  })

  it('blocks filiere submission until both the level and specialty are present', () => {
    expect(canSubmitOnboarding('', 'Sciences Math B')).toBe(false)
    expect(canSubmitOnboarding('2bac', '', false)).toBe(false)
    expect(canSubmitOnboarding('2bac', 'Sciences Math B', false)).toBe(true)
    expect(getOnboardingSelections({ niveau: ' 2bac ', filiere: ' Sciences Math B ' })).toEqual({
      selectedLevel: '2bac',
      selectedSpec: 'Sciences Math B',
    })
  })

  it('keeps the forgot-password form open when Firebase rejects the request', async () => {
    mocks.sendFirebasePasswordReset.mockRejectedValue(new Error('Firebase reset unavailable'))

    renderController()

    await act(async () => {
      latestController?.showForgot()
    })

    await act(async () => {
      latestController?.setEmail('student@example.com')
    })

    await act(async () => {
      await latestController?.handleForgot({
        preventDefault: () => undefined,
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(latestController?.loading).toBe(false)
    })
    expect(latestController?.authMode).toBe('forgot')
    expect(mocks.toastError).toHaveBeenCalledWith('Firebase reset unavailable')
  })

  it('marks Google auth separately from email account creation while redirect is pending', async () => {
    mocks.startFirebaseGoogleRedirect.mockImplementationOnce(
      () => new Promise<void>(() => undefined),
    )

    renderController()

    await act(async () => {
      latestController?.showSignup()
    })

    act(() => {
      void latestController?.triggerGoogle()
    })

    await waitFor(() => {
      expect(latestController?.pendingAction).toBe('google')
      expect(latestController?.loading).toBe(true)
    })
  })

  it('recovers when the Google redirect never completes', async () => {
    vi.useFakeTimers()
    mocks.startFirebaseGoogleRedirect.mockImplementationOnce(
      () => new Promise<void>(() => undefined),
    )

    try {
      renderController()

      await act(async () => {
        latestController?.showSignup()
      })

      act(() => {
        void latestController?.triggerGoogle()
      })

      expect(latestController?.pendingAction).toBe('google')

      await act(async () => {
        vi.advanceTimersByTime(12000)
      })

      expect(latestController?.pendingAction).toBe(null)
      expect(latestController?.loading).toBe(false)
      expect(mocks.toastError).toHaveBeenCalledWith('Connexion Google interrompue. Reessayez ou utilisez votre email.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels stale Google loading when the user switches to email auth', async () => {
    vi.useFakeTimers()
    mocks.startFirebaseGoogleRedirect.mockImplementationOnce(
      () => new Promise<void>(() => undefined),
    )

    try {
      renderController()

      await act(async () => {
        latestController?.showSignup()
      })

      act(() => {
        void latestController?.triggerGoogle()
      })

      expect(latestController?.pendingAction).toBe('google')
      expect(latestController?.loading).toBe(true)

      await act(async () => {
        latestController?.showLogin()
      })

      expect(latestController?.authMode).toBe('login')
      expect(latestController?.pendingAction).toBe(null)
      expect(latestController?.loading).toBe(false)
      expect(latestController?.authErrorMessage).toBe(null)

      await act(async () => {
        vi.advanceTimersByTime(12000)
      })

      expect(mocks.toastError).not.toHaveBeenCalledWith('Connexion Google interrompue. Reessayez ou utilisez votre email.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers when email account creation never resolves', async () => {
    vi.useFakeTimers()
    mocks.createFirebaseEmailUser.mockImplementationOnce(
      () => new Promise<string>(() => undefined),
    )

    try {
      renderController()

      await act(async () => {
        latestController?.showSignup()
        latestController?.setFullName('Kresco Student')
        latestController?.setEmail('student@example.com')
        latestController?.setPassword('password123')
      })

      let signupPromise: Promise<void> | undefined
      act(() => {
        signupPromise = latestController?.handleSignup({
          preventDefault: () => undefined,
        } as unknown as React.FormEvent)
      })

      expect(latestController?.pendingAction).toBe('signup')
      expect(latestController?.loading).toBe(true)

      await act(async () => {
        await Promise.resolve()
      })
      expect(mocks.createFirebaseEmailUser).toHaveBeenCalledWith('student@example.com', 'password123', 'Kresco Student')

      await act(async () => {
        vi.advanceTimersByTime(20_000)
        await signupPromise
      })

      expect(latestController?.pendingAction).toBe(null)
      expect(latestController?.loading).toBe(false)
      expect(mocks.toastError).toHaveBeenCalledWith('Creation du compte trop longue. Reessayez.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps onboarding loading active until navigation starts after a successful save', async () => {
    renderController()

    await act(async () => {
      latestController?.setSelectedLevel('2bac')
      latestController?.setSelectedSpec('Sciences Math B')
    })

    await act(async () => {
      await latestController?.saveOnboarding()
    })

    expect(mocks.patchJson).toHaveBeenCalledWith('/profile/me', {
      niveau: '2bac',
      filiere: 'Sciences Math B',
    })
    expect(mocks.routerPush).toHaveBeenCalledWith('/home')
    expect(latestController?.loading).toBe(true)
  })
})

function renderController() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(ControllerHarness))
  })

  return { container, root }
}

function ControllerHarness() {
  const controller = useAuthPageController()
  React.useEffect(() => {
    latestController = controller
  }, [controller])
  return null
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 30; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
  }
  throw lastError
}
