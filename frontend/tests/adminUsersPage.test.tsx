// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminUsersPage from '@/app/admin/users/page'
import AdminUsersStaffPage from '@/app/admin/users/staff/page'
import AdminUsersStudentsPage from '@/app/admin/users/students/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  patchJson: vi.fn(),
  sendFirebasePasswordReset: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  postJson: mocks.postJson,
  patchJson: mocks.patchJson,
}))

vi.mock('@/lib/firebaseAuth', () => ({
  sendFirebasePasswordReset: mocks.sendFirebasePasswordReset,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockImplementation((url: string) => {
    if (url.startsWith('/courses/subjects')) return Promise.resolve(subjectsFixture)
    if (url.startsWith('/payments/finance/manual-access-grants')) return Promise.resolve(manualAccessGrantsFixture)
    return Promise.resolve(usersFixture)
  })
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
  mocks.patchJson.mockResolvedValue({
    ...usersFixture.users[0],
    full_name: 'Users Student Updated',
    email: 'users-student-updated@example.com',
    tier: 'vip',
    is_pro: true,
    is_email_verified: false,
  })
  mocks.sendFirebasePasswordReset.mockResolvedValue(undefined)
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
  it('renders the account overview without mixing staff into student counts', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Users and access')
      expect(container.textContent).toContain('Account mix')
      expect(container.textContent).toContain('Access controls')
      expect(container.textContent).toContain('Access health')
      expect(container.textContent).toContain('Paid no access')
      expect(container.textContent).toContain('Plan mismatch')
      expect(container.textContent).toContain('Staff roles')
      expect(container.textContent).toContain('Student accounts')
      expect(container.textContent).not.toContain('Staff / pro')
      expect(container.textContent).not.toContain('Risk mix')
      expect(container.textContent).not.toContain(`plat${'inum'}`)
      expect(container.textContent).not.toContain('legacy_top')
      expect(container.textContent).not.toContain('Grant permission')
      expect(container.textContent).not.toContain('Users Staff')
      expect(container.textContent).toContain('99 MAD')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/users-access?limit=150')
    })
  })

  it('renders a focused student account route with edit and access actions', async () => {
    const { container } = renderPage(<AdminUsersPage view="students" studentMode="detail" studentId="10" />)

    await waitFor(() => {
      expect(container.textContent).toContain('Student accounts')
      expect(container.textContent).toContain('Access actions')
      expect(container.textContent).toContain('Account')
      expect(container.textContent).toContain('Subject access')
      expect(container.textContent).toContain('Payments')
      expect(container.textContent).toContain('Progress')
      expect(container.textContent).toContain('Messages')
      expect(container.textContent).toContain('Send reset email')
      expect(container.textContent).toContain('Copy trace')
      expect(container.textContent).toContain('Staff checklist')
      expect(container.textContent).toContain('Review payments')
      expect(container.textContent).toContain('Review progress')
      expect(container.textContent).toContain('Private messages')
      expect(container.textContent).toContain('Account details')
      expect(container.textContent).toContain('AI month')
      expect(container.textContent).toContain('7 units')
      expect(container.textContent).toContain('Users Student')
      expect(container.textContent).not.toContain('Users Staff')
    })

    expect(findLink(container, 'Account').getAttribute('href')).toBe('#student-account-details')
    expect(findLink(container, 'Subject access').getAttribute('href')).toBe('#student-subject-access')
    expect(findLink(container, 'Payments').getAttribute('href')).toBe('/admin/finance?student_id=10&q=users-student%40example.com')
    expect(findLink(container, 'Progress').getAttribute('href')).toBe('/admin/students?student_id=10&q=users-student%40example.com')
    expect(findLink(container, 'Messages').getAttribute('href')).toBe('/admin/communications?student_id=10&q=users-student%40example.com')

    clickButton(container, 'Copy trace')

    await waitFor(() => {
      expect(container.textContent).toContain('Copied trace')
    })

    clickButton(container, 'Send reset email')

    await waitFor(() => {
      expect(mocks.sendFirebasePasswordReset).toHaveBeenCalledWith('users-student@example.com')
      expect(container.textContent).toContain('Reset email sent')
    })

    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="Student full name"]')
    const emailInput = container.querySelector<HTMLInputElement>('input[aria-label="Student email"]')
    const planSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Student plan"]')
    if (!nameInput || !emailInput || !planSelect) throw new Error('Expected student editor controls')

    setInputValue(nameInput, 'Users Student Updated')
    setInputValue(emailInput, 'users-student-updated@example.com')
    setSelectValue(planSelect, 'vip')
    clickButton(container, 'Save account')

    await waitFor(() => {
      expect(mocks.patchJson).toHaveBeenCalledWith('/admin/users-access/students/10', {
        full_name: 'Users Student Updated',
        email: 'users-student-updated@example.com',
        niveau: '2BAC',
        filiere: 'SM',
        tier: 'vip',
        is_active: true,
        is_email_verified: true,
      })
      expect(container.textContent).toContain('Users Student Updated')
      expect(container.textContent).toContain('VIP')
    })

    mocks.patchJson.mockResolvedValueOnce({
      ...usersFixture.users[0],
      full_name: 'Users Student Updated',
      email: 'users-student-updated@example.com',
      tier: 'vip',
      is_pro: true,
      is_email_verified: true,
    })
    clickButton(container, 'Verify email')

    await waitFor(() => {
      expect(mocks.patchJson).toHaveBeenLastCalledWith('/admin/users-access/students/10', {
        is_email_verified: true,
      })
      expect(container.textContent).toContain('Email verified')
    })

    await waitForButtonEnabled(container, 'Set Basic plan')
    mocks.patchJson.mockResolvedValueOnce({
      ...usersFixture.users[0],
      full_name: 'Users Student Updated',
      email: 'users-student-updated@example.com',
      tier: 'basic',
      is_pro: false,
      is_email_verified: true,
    })
    clickButton(container, 'Set Basic plan')

    await waitFor(() => {
      expect(mocks.patchJson).toHaveBeenLastCalledWith('/admin/users-access/students/10', {
        tier: 'basic',
      })
      expect(container.textContent).toContain('Basic set')
    })

    await waitForButtonEnabled(container, 'Suspend account')
    mocks.patchJson.mockResolvedValueOnce({
      ...usersFixture.users[0],
      full_name: 'Users Student Updated',
      email: 'users-student-updated@example.com',
      tier: 'basic',
      is_pro: false,
      is_email_verified: true,
      is_active: false,
    })
    clickButton(container, 'Suspend account')

    await waitFor(() => {
      expect(mocks.patchJson).toHaveBeenLastCalledWith('/admin/users-access/students/10', {
        is_active: false,
      })
      expect(container.textContent).toContain('Account suspended')
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Subject access')
      expect(container.textContent).toContain('Manual correction')
      expect(container.textContent).toContain('Physics')
    })
    mocks.postJson.mockResolvedValueOnce({
      id: 502,
      user_id: 10,
      subject_id: 2,
      action: 'grant',
      status: 'completed',
      entitlement_id: 902,
      starts_at: '2026-06-20T10:00:00Z',
      ends_at: '2026-08-04T10:00:00Z',
      reason: 'Manual subject correction',
      created_by_user_id: 11,
      metadata: { entitlement_created: true },
      created_at: '2026-06-20T10:01:00Z',
    })
    const subjectSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Student access subject"]')
    const durationInput = container.querySelector<HTMLInputElement>('input[aria-label="Student access duration days"]')
    const accessReasonInput = container.querySelector<HTMLInputElement>('input[aria-label="Student access reason"]')
    if (!subjectSelect || !durationInput || !accessReasonInput) throw new Error('Expected subject access controls')

    setSelectValue(subjectSelect, '2')
    setInputValue(durationInput, '45')
    setInputValue(accessReasonInput, 'Manual subject correction')
    clickButton(container, 'Grant access')

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenLastCalledWith('/payments/finance/manual-access-grants', expect.objectContaining({
        user_id: 10,
        subject_id: 2,
        action: 'grant',
        reason: 'Manual subject correction',
        starts_at: expect.any(String),
        ends_at: expect.any(String),
      }))
      expect(container.textContent).toContain('Access updated')
      expect(container.textContent).toContain('Mathematics')
    })
  })

  it('renders the student index as a searchable row table with per-student actions', async () => {
    const { container } = renderPage(<AdminUsersStudentsPage />)

    await waitFor(() => {
      expect(container.textContent).toContain('Student directory')
      expect(container.textContent).toContain('Review Student')
      expect(container.textContent).toContain('Users Student')
      expect(container.textContent).toContain('Needs review')
      expect(container.textContent).toContain('Actions')
      expect(container.textContent).not.toContain('Users Staff')
    })

    expect(findLink(container, 'New student').getAttribute('href')).toBe('/admin/users/students/new')
    expect(findLink(container, 'Edit').getAttribute('href')).toBe('/admin/users/students/10')
    expect(findLink(container, 'Progress').getAttribute('href')).toBe('/admin/students?student_id=10&q=users-student%40example.com')

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search student accounts"]')
    if (!input) throw new Error('Expected user search input')
    setInputValue(input, 'review-student')

    await waitFor(() => {
      expect(container.textContent).toContain('Review Student')
      expect(container.textContent).not.toContain('Users Studentusers-student@example.com')
    })

    setInputValue(input, 'users-staff')

    await waitFor(() => {
      expect(container.textContent).toContain('No student accounts found.')
      expect(container.textContent).not.toContain('Users Staff')
    })
  })

  it('blocks malformed student emails before creating an account', async () => {
    const { container } = renderPage(<AdminUsersPage view="students" studentMode="create" />)

    await waitFor(() => {
      expect(container.textContent).toContain('New student')
      expect(findButton(container, 'Create student')).toBeTruthy()
    })
    const createNameInput = container.querySelector<HTMLInputElement>('input[aria-label="Student full name"]')
    const createEmailInput = container.querySelector<HTMLInputElement>('input[aria-label="Student email"]')
    if (!createNameInput || !createEmailInput) throw new Error('Expected create editor controls')

    setInputValue(createNameInput, 'Bad Email Student')
    setInputValue(createEmailInput, 'not-an-email')
    clickButton(container, 'Create student')

    await waitFor(() => {
      expect(container.textContent).toContain('Student email is invalid.')
      expect(mocks.postJson).not.toHaveBeenCalledWith('/admin/users-access/students', expect.anything())
    })
  })

  it('grants and revokes staff permissions from the selected user panel', async () => {
    const { container } = renderPage(<AdminUsersStaffPage />)

    await waitFor(() => {
      expect(container.textContent).toContain('Staff management')
      expect(container.textContent).toContain('Permissions')
      expect(container.textContent).toContain('Users Staff')
      expect(container.textContent).not.toContain('Users Student')
      expect(container.textContent).toContain('support / reports')
      expect(container.textContent).toContain('Initial support access')
    })

    const permissionSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Select permission"]')
    const reasonInput = container.querySelector<HTMLInputElement>('input[aria-label="Permission audit reason"]')
    if (!permissionSelect || !reasonInput) throw new Error('Expected permission controls')
    expect(Array.from(permissionSelect.options).some((option) => option.value === 'finance:staff_codes')).toBe(true)

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

function renderPage(element: React.ReactElement = <AdminUsersPage />) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
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
  const button = findButton(container, label)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function findButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => (
    candidate.getAttribute('aria-label')?.includes(label) || candidate.textContent?.includes(label)
  ))
  if (!button) throw new Error(`Expected button: ${label}`)
  return button
}

function findLink(container: HTMLElement, label: string) {
  const link = Array.from(container.querySelectorAll('a')).find((candidate) => (
    candidate.textContent?.includes(label)
  ))
  if (!link) throw new Error(`Expected link: ${label}`)
  return link
}

async function waitForButtonEnabled(container: HTMLElement, label: string) {
  await waitFor(() => {
    expect(findButton(container, label).disabled).toBe(false)
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
    total_users: 2,
    active_users: 1,
    verified_users: 1,
    staff_users: 2,
    pro_users: 1,
    active_entitlements: 1,
    users_with_active_entitlements: 1,
    active_permissions: 1,
    paid_users: 1,
    paid_revenue_centimes: 9900,
  },
  users_by_role: { student: 2 },
  users_by_tier: { pro: 1, basic: 1 },
  entitlements_by_status: { active: 1 },
  permissions_by_status: { active: 1 },
  users: [
    {
      user_id: 10,
      full_name: 'Users Student',
      email: 'users-student@example.com',
      role: 'student',
      tier: 'legacy_top',
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
      ai_quota_used_month: 7,
      latest_payment_at: '2026-06-20T09:00:00Z',
      last_login: '2026-06-20T08:00:00Z',
      created_at: '2026-06-01T08:00:00Z',
    },
    {
      user_id: 14,
      full_name: 'Review Student',
      email: 'review-student@example.com',
      role: 'student',
      tier: 'basic',
      niveau: '2BAC',
      filiere: 'SP',
      is_active: false,
      is_email_verified: false,
      is_staff: false,
      is_superuser: false,
      is_pro: false,
      active_entitlements: 0,
      total_entitlements: 0,
      active_permissions: 0,
      active_permission_names: [],
      permissions: [],
      payment_count: 0,
      paid_revenue_centimes: 0,
      ai_quota_used_month: 0,
      latest_payment_at: null,
      last_login: null,
      created_at: '2026-06-05T08:00:00Z',
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
      ai_quota_used_month: 0,
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
      ai_quota_used_month: 0,
      latest_payment_at: null,
      last_login: null,
      created_at: '2026-06-03T08:00:00Z',
    },
  ],
}

const subjectsFixture = [
  {
    id: 1,
    title: 'Physics',
    description: '',
    chapter_count: 8,
    lesson_count: 20,
  },
  {
    id: 2,
    title: 'Mathematics',
    description: '',
    chapter_count: 10,
    lesson_count: 28,
  },
]

const manualAccessGrantsFixture = [
  {
    id: 501,
    user_id: 10,
    subject_id: 1,
    action: 'grant',
    status: 'completed',
    entitlement_id: 901,
    starts_at: '2026-06-01T08:00:00Z',
    ends_at: '2026-07-01T08:00:00Z',
    reason: 'Manual correction',
    created_by_user_id: 11,
    metadata: { entitlement_created: true },
    created_at: '2026-06-01T08:00:00Z',
  },
]
