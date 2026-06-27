// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminShell from '@/components/admin/AdminShell'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  pathname: '/admin',
  routerPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@/components/AuthGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

vi.mock('@/components/KrescoWordmark', () => ({
  default: () => React.createElement('span', null, 'Kresco'),
}))

vi.mock('@/lib/store', () => ({
  useAuthStore: (
    selector: (state: {
      user: { full_name: string; email: string }
      logout: () => Promise<boolean>
    }) => unknown,
  ) =>
    selector({
      user: { full_name: 'Founder Operator', email: 'founder@kresco.test' },
      logout: mocks.logout,
    }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.pathname = '/admin'
  mocks.logout.mockResolvedValue(true)
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

describe('AdminShell', () => {
  it('uses a permanent sidebar rail instead of a mobile topbar', () => {
    const { container } = renderShell()

    const sidebar = container.querySelector('aside')
    const shell = sidebar?.parentElement
    expect(shell?.className).toContain('[--admin-accent:var(--primary)]')
    expect(sidebar?.className).toContain('w-[76px]')
    expect(sidebar?.className).toContain('lg:w-[272px]')
    expect(container.querySelector('header')).toBeNull()
    const navigation = container.querySelector('[aria-label="Admin navigation"]')
    expect(navigation).toBeTruthy()
    expect(navigation?.querySelector('a[href="/admin"]')?.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('a[href="/admin/finance"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/staff-payments"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/communications"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/reviews"]')).toBeTruthy()
    expect(container.querySelector('a[aria-label="Operations"]')?.getAttribute('href')).toBe('/admin/activity')
    expect(container.querySelector('a[aria-label="Health"]')).toBeNull()
    expect(container.querySelector('a[aria-label="Audit"]')).toBeNull()
    expect(navigation?.querySelector('a[href="/admin"]')?.className).toContain('text-[color:var(--admin-accent)]')
    expect(container.textContent).not.toContain('Founder workspace')
    expect(container.textContent).not.toContain('Operations command center')
    expect(container.textContent).toContain('Founder analytics')
  })

  it('signs the operator out from the compact rail control', () => {
    const { container } = renderShell()
    const signOutButton = container.querySelector<HTMLButtonElement>('button[title="Sign out"]')
    expect(signOutButton).toBeTruthy()

    act(() => {
      signOutButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(mocks.routerPush).toHaveBeenCalledWith('/auth/login')
  })

  it('opens finance subnavigation on finance pages', () => {
    mocks.pathname = '/admin/finance/expenses'
    const { container } = renderShell()

    const financeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Finance"]')
    expect(financeButton?.getAttribute('aria-expanded')).toBe('true')
    expect(financeButton?.getAttribute('aria-controls')).toBe('admin-subnav-admin-finance')
    expect(container.querySelector('#admin-subnav-admin-finance')?.getAttribute('aria-hidden')).toBe('false')
    expect(container.querySelector('a[href="/admin/finance"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/finance/expenses"]')?.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('a[href="/admin/finance/revenue"]')).toBeTruthy()
  })

  it('opens accounts subnavigation on account pages', () => {
    mocks.pathname = '/admin/users/staff'
    const { container } = renderShell()

    const accountsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Accounts"]')
    expect(accountsButton?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('a[href="/admin/users"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/users/students"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/users/staff"]')?.getAttribute('aria-current')).toBe('page')
  })

  it('opens reviews subnavigation on video feedback pages', () => {
    mocks.pathname = '/admin/reviews/video-feedback'
    const { container } = renderShell()

    const reviewsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Reviews"]')
    expect(reviewsButton?.getAttribute('aria-expanded')).toBe('true')
    expect(reviewsButton?.getAttribute('aria-controls')).toBe('admin-subnav-admin-reviews')
    expect(container.querySelector('a[href="/admin/reviews"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/reviews/video-feedback"]')?.getAttribute('aria-current')).toBe('page')
  })

  it('toggles accordion parents without routing away', () => {
    const { container } = renderShell()
    const financeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Finance"]')
    const accountsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Accounts"]')
    const financeGroup = financeButton?.closest('.t-acc')
    const financePanel = container.querySelector('#admin-subnav-admin-finance')

    expect(financeGroup?.getAttribute('data-open')).toBe('false')
    expect(financePanel?.className).toContain('t-acc-panel')
    expect(financePanel?.className).toContain('absolute')
    expect(financePanel?.className).toContain('lg:static')
    expect(financePanel?.querySelector('.t-acc-panel-inner')).toBeTruthy()
    expect(financeButton?.querySelector('.t-acc-chevron')).toBeTruthy()
    expect(financeButton?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('a[href="/admin/finance"]')?.getAttribute('tabindex')).toBe('-1')

    act(() => {
      financeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(financeGroup?.getAttribute('data-open')).toBe('true')
    expect(financeButton?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('a[href="/admin/finance"]')?.getAttribute('tabindex')).toBeNull()
    expect(mocks.routerPush).not.toHaveBeenCalled()

    act(() => {
      accountsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(financeButton?.getAttribute('aria-expanded')).toBe('false')
    expect(financeGroup?.getAttribute('data-open')).toBe('false')
    expect(accountsButton?.getAttribute('aria-expanded')).toBe('true')
  })
})

function renderShell() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(
      React.createElement(AdminShell, null, React.createElement('main', null, 'Founder analytics')),
    )
  })

  return { container, root }
}
