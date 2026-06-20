// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminUsersPage from '@/app/admin/users/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockResolvedValue(usersFixture)
  mocks.postJson.mockResolvedValue({
    id: 88,
    user_id: 11,
    permission: 'users:read',
    status: 'active',
    reason: 'Need user support visibility',
    granted_by_user_id: 1,
    created_at: '2026-06-20T10:05:00Z',
    revoked_at: null,
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

describe('AdminUsersPage', () => {
  it('renders user access summary, rows, and search filtering', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Users and access')
      expect(container.textContent).toContain('Account mix')
      expect(container.textContent).toContain('Access controls')
      expect(container.textContent).toContain('Access risk')
      expect(container.textContent).toContain('Staff no perms')
      expect(container.textContent).toContain('Permission management')
      expect(container.textContent).toContain('Users Student')
      expect(container.textContent).toContain('Users Staff')
      expect(container.textContent).toContain('support / reports')
      expect(container.textContent).toContain('99 MAD')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/users-access?limit=150')
    })

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search admin users"]')
    if (!input) throw new Error('Expected user search input')
    setInputValue(input, 'users-staff')

    await waitFor(() => {
      expect(container.textContent).toContain('1 row(s) visible')
      expect(container.textContent).toContain('Users Staff')
      expect(container.textContent).not.toContain('Users Student')
    })
  })

  it('grants and revokes staff permissions from the selected user panel', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Permission management')
      expect(container.textContent).toContain('support / reports')
      expect(container.textContent).toContain('Initial support access')
    })

    const permissionSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Select permission"]')
    const reasonInput = container.querySelector<HTMLInputElement>('input[aria-label="Permission audit reason"]')
    if (!permissionSelect || !reasonInput) throw new Error('Expected permission controls')

    setSelectValue(permissionSelect, 'users:read')
    setInputValue(reasonInput, 'Need user support visibility')
    clickButton(container, 'Grant permission')

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith('/admin/permissions', {
        user_id: 11,
        permission: 'users:read',
        reason: 'Need user support visibility',
      })
      expect(container.textContent).toContain('users / read')
    })

    mocks.postJson.mockResolvedValueOnce({
      id: 77,
      user_id: 11,
      permission: 'support:reports',
      status: 'revoked',
      reason: 'Revoked from admin users board',
      granted_by_user_id: 1,
      created_at: '2026-06-20T10:00:00Z',
      revoked_at: '2026-06-20T10:10:00Z',
    })
    clickButton(container, 'Revoke')

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith('/admin/permissions/77/revoke', {
        reason: 'Revoked from admin users board',
      })
      expect(container.textContent).not.toContain('Initial support access')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<AdminUsersPage />)
  })
  mountedRoot = { root, container }
  return { container }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
  act(() => {
    setter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => (
    candidate.textContent?.includes(label)
  ))
  if (!button) throw new Error(`Expected button: ${label}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const startedAt = Date.now()
  let lastError: unknown
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
  }
  throw lastError
}

const usersFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  summary: {
    total_users: 3,
    active_users: 2,
    verified_users: 2,
    staff_users: 2,
    pro_users: 1,
    active_entitlements: 1,
    users_with_active_entitlements: 1,
    active_permissions: 1,
    paid_users: 1,
    paid_revenue_centimes: 9900,
  },
  users_by_role: { student: 1, admin: 2 },
  users_by_tier: { pro: 1, vip: 1, basic: 1 },
  entitlements_by_status: { active: 1 },
  permissions_by_status: { active: 1 },
  users: [
    {
      user_id: 10,
      full_name: 'Users Student',
      email: 'users-student@example.com',
      role: 'student',
      tier: 'pro',
      niveau: '2BAC',
      filiere: 'SM',
      is_active: true,
      is_email_verified: true,
      is_staff: false,
      is_superuser: false,
      is_pro: true,
      active_entitlements: 1,
      total_entitlements: 1,
      active_permissions: 0,
      active_permission_names: [],
      permissions: [],
      payment_count: 1,
      paid_revenue_centimes: 9900,
      latest_payment_at: '2026-06-20T09:00:00Z',
      last_login: '2026-06-20T08:00:00Z',
      created_at: '2026-06-01T08:00:00Z',
    },
    {
      user_id: 11,
      full_name: 'Users Staff',
      email: 'users-staff@example.com',
      role: 'admin',
      tier: 'vip',
      niveau: '',
      filiere: '',
      is_active: true,
      is_email_verified: true,
      is_staff: true,
      is_superuser: false,
      is_pro: false,
      active_entitlements: 0,
      total_entitlements: 0,
      active_permissions: 1,
      active_permission_names: ['support:reports'],
      permissions: [
        {
          id: 77,
          permission: 'support:reports',
          reason: 'Initial support access',
          created_at: '2026-06-20T10:00:00Z',
        },
      ],
      payment_count: 0,
      paid_revenue_centimes: 0,
      latest_payment_at: null,
      last_login: null,
      created_at: '2026-06-02T08:00:00Z',
    },
    {
      user_id: 12,
      full_name: 'Dormant Staff',
      email: 'dormant-staff@example.com',
      role: 'admin',
      tier: 'basic',
      niveau: '',
      filiere: '',
      is_active: false,
      is_email_verified: false,
      is_staff: true,
      is_superuser: false,
      is_pro: false,
      active_entitlements: 0,
      total_entitlements: 0,
      active_permissions: 0,
      active_permission_names: [],
      permissions: [],
      payment_count: 0,
      paid_revenue_centimes: 0,
      latest_payment_at: null,
      last_login: null,
      created_at: '2026-06-03T08:00:00Z',
    },
  ],
}
