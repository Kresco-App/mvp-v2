// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CmiFailPage from '@/app/payment/cmi/fail/page'
import CmiOkPage from '@/app/payment/cmi/ok/page'
import { useAuthStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
  }),
}))

vi.mock('@/components/AuthGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
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

describe('CMI return pages', () => {
  it('refreshes profile and shows active access after signed callback confirmation', async () => {
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

    const { container } = renderPage(React.createElement(CmiOkPage))

    await waitFor(() => {
      expect(container.textContent).toContain('Acces Pro active')
    })
    expect(mocks.getMyProfile).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().user?.is_pro).toBe(true)
    expect(useAuthStore.getState().user?.full_name).toBe('Fresh Student')
  })

  it('shows pending state when the CMI return arrives before backend confirmation is projected', async () => {
    mocks.getMyProfile.mockResolvedValueOnce({
      id: 1,
      email: 'student@example.com',
      full_name: 'Student',
      role: 'student',
      is_staff: false,
      is_pro: false,
      niveau: '1bac',
      filiere: 'SVT',
      avatar_url: '',
      banner_url: '',
      created_at: '2026-05-01T00:00:00Z',
      is_email_verified: true,
    })

    const { container } = renderPage(React.createElement(CmiOkPage))

    await waitFor(() => {
      expect(container.textContent).toContain('Paiement en confirmation')
    })
    expect(container.textContent).toContain('confirmation serveur signee')
    expect(useAuthStore.getState().user?.is_pro).toBe(false)
  })

  it('reruns profile refresh from the pending confirmation action', async () => {
    mocks.getMyProfile
      .mockResolvedValueOnce({
        id: 1,
        email: 'student@example.com',
        full_name: 'Student',
        role: 'student',
        is_staff: false,
        is_pro: false,
        niveau: '1bac',
        filiere: 'SVT',
        avatar_url: '',
        banner_url: '',
        created_at: '2026-05-01T00:00:00Z',
        is_email_verified: true,
      })
      .mockResolvedValueOnce({
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

    const { container } = renderPage(React.createElement(CmiOkPage))

    await waitFor(() => {
      expect(container.textContent).toContain('Paiement en confirmation')
    })
    await clickButton(container, 'Actualiser')

    await waitFor(() => {
      expect(container.textContent).toContain('Acces Pro active')
    })
    expect(mocks.getMyProfile).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().user?.is_pro).toBe(true)
  })

  it('does not call profile refresh on the failed CMI return page', async () => {
    const { container } = renderPage(React.createElement(CmiFailPage))

    await waitFor(() => {
      expect(container.textContent).toContain('Paiement non confirme')
    })
    expect(mocks.getMyProfile).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user?.is_pro).toBe(false)
  })
})

function renderPage(element: React.ReactElement) {
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

async function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(name),
  )
  if (!button) throw new Error(`Button not found: ${name}`)

  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
