// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PricingPage from '@/app/pricing/page'
import { useAuthStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  createProPaymentRequest: vi.fn(),
  submitProviderPaymentForm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/components/AuthGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

vi.mock('@/lib/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments')>()
  return {
    ...actual,
    createProPaymentRequest: mocks.createProPaymentRequest,
    submitProviderPaymentForm: mocks.submitProviderPaymentForm,
  }
})

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

  useAuthStore.setState({
    user: {
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

describe('pricing payment request flow', () => {
  it('uses the provider-neutral CMI request path from the launch pricing CTA', async () => {
    mocks.createProPaymentRequest.mockResolvedValue({
      status: 'provider_redirect',
      actionUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
      formFields: { clientid: 'cmi-client', oid: 'KRESCO-CMI-1' },
      request: {
        id: 1,
        payment_method: 'cmi',
        status: 'pending_provider',
        plan: 'pro',
        amount_centimes: 9900,
        currency: 'MAD',
        reference_code: 'KRESCO-CMI-1',
        instructions: {},
        created_at: '2026-06-15T00:00:00Z',
        expires_at: null,
      },
    })

    const { container } = renderPricingPage()
    await clickButton(container, "Acheter l'acces Pro - 99 MAD")

    expect(mocks.createProPaymentRequest).toHaveBeenCalledWith(expect.any(Object), 'cmi')
    expect(mocks.submitProviderPaymentForm).toHaveBeenCalledWith(
      'https://testpayment.cmi.co.ma/fim/est3Dgate',
      { clientid: 'cmi-client', oid: 'KRESCO-CMI-1' },
    )
  })

  it('shows manual pending instructions without redirecting or granting access', async () => {
    mocks.createProPaymentRequest.mockResolvedValue({
      status: 'pending_manual_review',
      request: {
        id: 2,
        payment_method: 'cashplus',
        status: 'pending_manual_review',
        plan: 'pro',
        amount_centimes: 9900,
        currency: 'MAD',
        reference_code: 'KRESCO-CASH-2',
        instructions: {
          title: 'CashPlus',
          steps: ['Use the reference code when paying through CashPlus.'],
        },
        created_at: '2026-06-15T00:00:00Z',
        expires_at: null,
      },
    })

    const { container } = renderPricingPage()
    await clickButton(container, 'CashPlus')
    await clickButton(container, "Acheter l'acces Pro - 99 MAD")

    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-CASH-2')
      expect(container.textContent).toContain('99.00 MAD')
      expect(container.textContent).toContain('Use the reference code when paying through CashPlus.')
    })
    expect(mocks.createProPaymentRequest).toHaveBeenCalledWith(expect.any(Object), 'cashplus')
    expect(mocks.submitProviderPaymentForm).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user?.is_pro).toBe(false)
  })
})

function renderPricingPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(PricingPage))
  })

  return { container, root }
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
