// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  canSubmitOnboarding,
  getOnboardingSelections,
  isUnverifiedEmailLoginError,
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
})

describe('auth page onboarding state', () => {
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

  it('keeps the forgot-password form open when the backend rejects the request', async () => {
    mocks.postJson.mockRejectedValue({
      response: { data: { detail: 'Forgot password unavailable' } },
    })

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
    expect(mocks.toastError).toHaveBeenCalledWith('Forgot password unavailable')
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
