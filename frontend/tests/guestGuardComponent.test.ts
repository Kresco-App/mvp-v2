// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import GuestGuard from '@/components/GuestGuard'
import { KRESCO_STORED_AUTH_SNAPSHOT } from '@/lib/authSession'

const mocks = vi.hoisted(() => {
  const authState = {
    user: null as Record<string, unknown> | null,
    token: null as string | null,
    isHydrated: true,
    hydrate: vi.fn(),
  }

  return {
    authState,
    nextDestination: null as string | null,
    routerReplace: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => ({ get: (key: string) => (key === 'next' ? mocks.nextDestination : null) }),
}))

vi.mock('@/lib/store', () => ({
  useAuthStore: (selector: (state: typeof mocks.authState) => unknown) => selector(mocks.authState),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mocks.authState.user = null
  mocks.authState.token = null
  mocks.authState.isHydrated = true
  mocks.nextDestination = null
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

describe('GuestGuard component behavior', () => {
  it('renders guest children after hydration when no session exists', async () => {
    const { container } = renderComponent(
      React.createElement(GuestGuard, null, React.createElement('main', null, 'Guest child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Guest child')
    })
    expect(mocks.authState.hydrate).not.toHaveBeenCalled()
    expect(mocks.routerReplace).not.toHaveBeenCalled()
  })

  it('hydrates the auth store only when it has not already hydrated', async () => {
    mocks.authState.isHydrated = false

    renderComponent(
      React.createElement(GuestGuard, null, React.createElement('main', null, 'Guest child')),
    )

    await waitFor(() => {
      expect(mocks.authState.hydrate).toHaveBeenCalledTimes(1)
    })
  })

  it('redirects minimal stored student snapshots to the authenticated destination', async () => {
    mocks.authState.user = {
      [KRESCO_STORED_AUTH_SNAPSHOT]: true,
      role: 'student',
    }
    mocks.authState.token = 'cookie-session'

    const { container } = renderComponent(
      React.createElement(GuestGuard, null, React.createElement('main', null, 'Guest child')),
    )

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/home')
    })
    expect(container.textContent).not.toContain('Guest child')
  })

  it('redirects incomplete students to onboarding with a safe next destination', async () => {
    mocks.authState.user = {
      role: 'student',
      niveau: '2bac',
      filiere: '',
    }
    mocks.authState.token = 'cookie-session'
    mocks.nextDestination = '/topics/42'

    const { container } = renderComponent(
      React.createElement(GuestGuard, null, React.createElement('main', null, 'Guest child')),
    )

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/onboarding?next=%2Ftopics%2F42')
    })
    expect(container.textContent).not.toContain('Guest child')
  })

  it('redirects professors to the professor workspace', async () => {
    mocks.authState.user = { role: 'professor' }
    mocks.authState.token = 'cookie-session'

    renderComponent(
      React.createElement(GuestGuard, null, React.createElement('main', null, 'Guest child')),
    )

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/professor')
    })
  })

  it('can allow authenticated students while still redirecting professors', async () => {
    mocks.authState.user = { role: 'student', niveau: '2bac', filiere: 'spc' }
    mocks.authState.token = 'cookie-session'

    const { container } = renderComponent(
      React.createElement(
        GuestGuard,
        { authenticatedRedirectMode: 'professor-only' },
        React.createElement('main', null, 'Professor login'),
      ),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Professor login')
    })
    expect(mocks.routerReplace).not.toHaveBeenCalled()
  })
})

function renderComponent(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(element)
  })

  return { container, root }
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 25; index += 1) {
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
