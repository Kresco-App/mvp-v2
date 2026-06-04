// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PaymentSuccessPage from '@/app/payment-success/page'
import { useAuthStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  routerPush: vi.fn(),
  verifyCheckoutSession: vi.fn(),
}))

const searchParams = {
  get: (key: string) => (key === 'session_id' ? 'cs_test_checkout' : null),
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useSearchParams: () => searchParams,
}))

vi.mock('@/components/AuthGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

vi.mock('@/lib/payments', () => ({
  verifyCheckoutSession: mocks.verifyCheckoutSession,
}))

vi.mock('@/lib/profile', () => ({
  getMyProfile: mocks.getMyProfile,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null

  useAuthStore.setState({
    user: {
      id: 1,
      email: 'student@example.com',
      full_name: 'Stale Student',
      role: 'student',
      is_staff: false,
      is_pro: false,
      niveau: '1bac',
      filiere: 'SVT',
      avatar_url: '',
      banner_url: '',
      created_at: '2026-05-01T00:00:00Z',
      is_email_verified: true,
    },
    token: 'cookie-session',
    isHydrated: true,
  })

  mocks.verifyCheckoutSession.mockResolvedValue({
    status: 'success',
    userPatch: { is_pro: true },
  })
  mocks.getMyProfile.mockResolvedValue({
    id: 1,
    email: 'student@example.com',
    full_name: 'Fresh Student',
    role: 'student',
    is_staff: false,
    is_pro: true,
    niveau: '2bac',
    filiere: 'Sciences Math B',
    avatar_url: '',
    banner_url: '',
    created_at: '2026-05-01T00:00:00Z',
    is_email_verified: true,
  })
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

describe('payment success verification flow', () => {
  it('refreshes the full profile before marking checkout success', async () => {
    const { container } = renderPaymentSuccessPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Bienvenue dans Kresco Pro !')
    })

    expect(mocks.verifyCheckoutSession).toHaveBeenCalledWith(expect.any(Object), 'cs_test_checkout')
    expect(mocks.getMyProfile).toHaveBeenCalled()

    const user = useAuthStore.getState().user
    expect(user?.full_name).toBe('Fresh Student')
    expect(user?.niveau).toBe('2bac')
    expect(user?.filiere).toBe('Sciences Math B')
    expect(user?.is_pro).toBe(true)
  })
})

function renderPaymentSuccessPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(PaymentSuccessPage))
  })

  return { container, root }
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
