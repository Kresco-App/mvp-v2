// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminTopNav from '@/components/admin/AdminTopNav'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  listAdminChangeRequests: vi.fn(),
  logout: vi.fn(),
  pathname: '/admin',
  routerPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@/components/KrescoWordmark', () => ({
  default: () => React.createElement('span', null, 'Kresco'),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

vi.mock('@/lib/apiConfig', () => ({
  getAdminRootUrl: () => 'https://api.example.test/admin',
}))

vi.mock('@/lib/studio', () => ({
  listAdminChangeRequests: mocks.listAdminChangeRequests,
}))

vi.mock('@/lib/store', () => ({
  useAuthStore: (selector: (state: { user: { full_name: string }; logout: () => Promise<boolean> }) => unknown) =>
    selector({ user: { full_name: 'Admin Operator' }, logout: mocks.logout }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.pathname = '/admin'
  mocks.logout.mockResolvedValue(true)
  mocks.listAdminChangeRequests.mockResolvedValue([{ id: 1 }, { id: 2 }])
  mocks.getJson.mockResolvedValue(adminOverviewFixture)
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

describe('AdminTopNav', () => {
  it('shows live urgency badges for the main admin domains', async () => {
    const { container } = renderNav()

    await waitFor(() => {
      expect(linkText(container, '/admin/reviews')).toContain('2')
      expect(linkText(container, '/admin/communications')).toContain('9')
      expect(linkText(container, '/admin/finance')).toContain('4')
      expect(linkText(container, '/admin/students')).toContain('8')
      expect(container.textContent).toContain('Activité')
      expect(container.textContent).toContain('Utilisateurs')
    })

    expect(mocks.listAdminChangeRequests).toHaveBeenCalledWith('pending')
    expect(mocks.getJson).toHaveBeenCalledWith('/admin/overview')
  })

  it('keeps the same badges available in the mobile menu', async () => {
    const { container } = renderNav()

    await waitFor(() => {
      expect(linkText(container, '/admin/finance')).toContain('4')
    })

    await clickButton(container, 'Navigation')

    const financeLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href="/admin/finance"]'))
    expect(financeLinks).toHaveLength(2)
    expect(financeLinks[1].textContent).toContain('4')
  })
})

function renderNav() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminTopNav))
  })

  return { container, root }
}

function linkText(container: HTMLElement, href: string) {
  return container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)?.textContent ?? ''
}

async function clickButton(container: HTMLElement, title: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[title="${title}"]`)
  expect(button, `button ${title}`).toBeTruthy()

  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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

const adminOverviewFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  totals: {},
  content_status: {},
  access_billing: {},
  ops_readiness: {},
  progress_xp: {
    topic_item_progress_by_status: {
      in_progress: 5,
      started: 2,
      needs_review: 1,
    },
  },
  exam_bank: {},
  calendar: {},
  engagement: {},
  interactions: {},
  notifications: {},
  finance: {
    pending_manual_review: 2,
    pending_provider: 1,
    failed_or_mismatch: 1,
  },
  communications: {
    chat_unread_for_professors: 4,
    pending_live_interactions: 2,
    open_reports: 3,
  },
  admin_audit: {},
  crud_catalog: [],
}
