// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import StaffPaymentsPage from '@/app/staff/payments/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  clipboardWriteText: vi.fn(),
  logout: vi.fn(),
  routerPush: vi.fn(),
  isLoggingOut: false,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@/components/KrescoWordmark', () => ({
  default: () => <span>Kresco</span>,
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

vi.mock('@/lib/store', () => ({
  useAuthStore: (
    selector: (state: {
      logout: () => Promise<boolean>
      isLoggingOut: boolean
    }) => unknown,
  ) =>
    selector({
      logout: mocks.logout,
      isLoggingOut: mocks.isLoggingOut,
    }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.isLoggingOut = false
  mocks.logout.mockResolvedValue(true)
  mockStaffApiResponses()
  mocks.clipboardWriteText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: mocks.clipboardWriteText,
    },
  })
  mocks.postJson.mockImplementation(async (path: string, input: Record<string, unknown>) => {
    if (path === '/staff/payments/requests') {
      return {
        ...staffRequestFixture,
        ...input,
        id: 77,
        code: { ...staffRequestFixture.code, code: 'KRESCO-ONE-77' },
      }
    }
    throw new Error(`Unexpected POST ${path}`)
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

describe('StaffPaymentsPage', () => {
  it('renders quota, allowed templates, and recent generated codes', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Monthly quota')
      expect(container.textContent).toContain('4 / 50')
      expect(container.textContent).toContain('Codes left')
      expect(container.textContent).toContain('Generate payment code')
      expect(container.textContent).toContain('Pro monthly')
      expect(container.textContent).toContain('Recent codes')
      expect(container.textContent).toContain('KRESCO-CODE-42')
    })

    expect(mocks.getJson).toHaveBeenCalledWith('/staff/payments/dashboard?limit=60')
  })

  it('shows the current staff account, portal link, and signs out', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Amina Staff')
      expect(container.textContent).toContain('staff@kresco.local')
    })

    const portalLink = container.querySelector<HTMLAnchorElement>('a[aria-label="Open admin portal"]')
    expect(portalLink?.getAttribute('href')).toContain('/admin')

    await clickButton(container, 'Sign out')

    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(mocks.routerPush.mock.calls[0]?.[0]).toContain('next=%2Fstaff%2Fpayments')
  })

  it('shows a sign-in action when the staff account cannot be loaded', async () => {
    mockStaffApiResponses({ profileError: new Error('Unauthorized') })
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Sign in required')
    })

    const signInLink = container.querySelector<HTMLAnchorElement>('a[aria-label="Sign in"]')
    expect(signInLink?.getAttribute('href')).toContain('next=%2Fstaff%2Fpayments')
  })

  it('requires transfer verification before generating a one-use code', async () => {
    const { container } = renderPage()

    await fillRequiredPaymentFields(container)
    await clickButton(container, 'Generate one-use code')

    expect(mocks.postJson).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Confirm the transfer reference and amount before generating a code.')
  })

  it('submits a verified transfer and displays the generated code', async () => {
    const { container } = renderPage()

    await fillRequiredPaymentFields(container)
    await toggleCheckbox(container, 'Transfer verified')
    await clickButton(container, 'Generate one-use code')

    expect(mocks.postJson).toHaveBeenCalledWith('/staff/payments/requests', {
      template_id: 5,
      payment_method: 'bank_transfer',
      provider_reference: 'BANK-REF-77',
      amount_centimes: 9900,
      student_name: 'Sara Benali',
      student_phone: '+212600000000',
      student_email: 'sara@example.com',
      proof_url: undefined,
      notes: undefined,
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('One-use code generated.')
    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-ONE-77')
      expect(container.textContent).toContain('Generated code')
    })
  })

  it('blocks generation when the staff quota is exhausted', async () => {
    mockStaffApiResponses({
      dashboard: {
        ...staffDashboardFixture,
        profile: {
          ...staffDashboardFixture.profile,
          used_codes_this_month: 50,
          remaining_codes_this_month: 0,
        },
      },
    })
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Monthly code quota is exhausted.')
      expect(container.textContent).toContain('No codes left')
    })
  })

  it('opens a selectable staff allowance request from the header action', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Request more codes')
    })
    await clickButton(container, 'Request more codes')

    expect(container.textContent).toContain('Allowance request')
    expect(container.textContent).toContain('WhatsApp Staff')
    expect(allowanceRequestText(container).value).toContain('Codes left: 46')

    const requestText = allowanceRequestText(container)
    await act(async () => {
      requestText.focus()
      await flushPromises()
    })
    expect(document.activeElement).toBe(requestText)
    expect(requestText.selectionStart).toBe(0)
    expect(requestText.selectionEnd).toBe(requestText.value.length)
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }
  act(() => {
    root.render(<StaffPaymentsPage />)
  })
  return { container, root }
}

function mockStaffApiResponses({
  dashboard = staffDashboardFixture,
  profile = staffAccountFixture,
  profileError,
}: {
  dashboard?: typeof staffDashboardFixture
  profile?: typeof staffAccountFixture
  profileError?: unknown
} = {}) {
  mocks.getJson.mockImplementation(async (path: string) => {
    if (path === '/staff/payments/dashboard?limit=60') return dashboard
    if (path === '/profile/me') {
      if (profileError) throw profileError
      return profile
    }
    throw new Error(`Unexpected GET ${path}`)
  })
}

async function fillRequiredPaymentFields(container: HTMLElement) {
  await waitFor(() => {
    expect(container.textContent).toContain('Generate payment code')
  })
  await setField(container, 'Transfer reference', ' BANK-REF-77 ')
  await setField(container, 'Student name', ' Sara Benali ')
  await setField(container, 'Phone', '+212600000000')
  await setField(container, 'Email', 'sara@example.com')
}

async function setField(container: HTMLElement, label: string, value: string) {
  const field = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  expect(field, `missing field ${label}`).not.toBeNull()
  const prototype = field instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : field instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  await act(async () => {
    setter?.call(field, value)
    field?.dispatchEvent(new Event('input', { bubbles: true }))
    field?.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  })
}

async function toggleCheckbox(container: HTMLElement, label: string) {
  const checkbox = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | null
  expect(checkbox, `missing checkbox ${label}`).not.toBeNull()
  await act(async () => {
    checkbox?.click()
    await flushPromises()
  })
}

async function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
  expect(button, `missing button ${text}`).toBeTruthy()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  })
}

function allowanceRequestText(container: HTMLElement) {
  const requestText = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Allowance request text"]')
  expect(requestText, 'missing allowance request text').not.toBeNull()
  return requestText as HTMLTextAreaElement
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 20; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await flushPromises()
      })
    }
  }
  throw lastError
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

const staffRequestFixture = {
  id: 42,
  staff_user_id: 31,
  template_id: 5,
  redemption_code_id: 8,
  payment_method: 'bank_transfer',
  provider_reference: 'BANK-REF-42',
  amount_centimes: 9900,
  currency: 'MAD',
  status: 'code_generated',
  student_name: 'Sara Benali',
  student_phone: '+212600000000',
  student_email: 'sara@example.com',
  proof_url: '',
  notes: '',
  requires_review: false,
  metadata: {},
  created_at: '2026-06-19T12:00:00Z',
  updated_at: '2026-06-19T12:00:00Z',
  code: {
    id: 8,
    code: 'KRESCO-CODE-42',
    template_id: 5,
    generated_by_user_id: 31,
    redeemed_by_user_id: null,
    plan: 'pro',
    tier: 'pro',
    subject_ids: [],
    duration_days: 30,
    amount_centimes: 9900,
    currency: 'MAD',
    status: 'generated',
    expires_at: null,
    redeemed_at: null,
    created_at: '2026-06-19T12:00:00Z',
  },
}

const staffAccountFixture = {
  id: 31,
  email: 'staff@kresco.local',
  full_name: 'Amina Staff',
  avatar_url: '',
  banner_url: '',
  role: 'staff',
  is_staff: true,
  is_pro: false,
  niveau: '',
  filiere: '',
  is_email_verified: true,
  created_at: '2026-06-18T09:00:00Z',
}

const staffDashboardFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  profile: {
    user_id: 31,
    display_name: 'WhatsApp Staff',
    status: 'active',
    monthly_code_limit: 50,
    monthly_amount_limit_centimes: 500000,
    allowed_template_ids: [5],
    used_codes_this_month: 4,
    remaining_codes_this_month: 46,
    used_amount_this_month_centimes: 39600,
    remaining_amount_this_month_centimes: 460400,
  },
  templates: [
    {
      id: 5,
      name: 'Pro monthly',
      plan: 'pro',
      tier: 'pro',
      subject_scope: 'all',
      subject_ids: [],
      duration_days: 30,
      amount_centimes: 9900,
      currency: 'MAD',
      status: 'active',
      created_by_user_id: 1,
      metadata: {},
      created_at: '2026-06-19T12:00:00Z',
      updated_at: '2026-06-19T12:00:00Z',
    },
  ],
  requests: [
    staffRequestFixture,
  ],
}
