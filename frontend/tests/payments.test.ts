// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import {
  PAYMENT_ERROR_MESSAGE,
  PRO_CHECKOUT_PLAN,
  createProPaymentRequest,
  createProCheckoutSession,
  getPaymentErrorMessage,
  paymentVerificationIdempotencyKey,
  submitProviderPaymentForm,
  verifyCheckoutSession,
} from '@/lib/payments'

describe('payment success verification', () => {
  it('rejects missing checkout session ids without calling the API', async () => {
    const apiClient = { get: vi.fn() }

    await expect(verifyCheckoutSession(apiClient, '')).resolves.toEqual({ status: 'error' })
    await expect(verifyCheckoutSession(apiClient, null)).resolves.toEqual({ status: 'error' })
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('encodes checkout session ids and returns the Pro user patch on paid sessions', async () => {
    const apiClient = {
      get: vi.fn().mockResolvedValue({ data: { is_pro: true } }),
    }

    await expect(verifyCheckoutSession(apiClient, ' cs_test/needs encoding ')).resolves.toEqual({
      status: 'success',
      userPatch: { is_pro: true },
    })
    expect(apiClient.get).toHaveBeenCalledWith(
      '/payments/verify-session?session_id=cs_test%2Fneeds%20encoding',
      { headers: { 'Idempotency-Key': 'verify-cs_test_needs_encoding' } },
    )
  })

  it('builds stable bounded idempotency keys for verification calls', () => {
    expect(paymentVerificationIdempotencyKey(' cs_test/needs encoding ')).toBe('verify-cs_test_needs_encoding')
    expect(paymentVerificationIdempotencyKey(`cs_${'x'.repeat(300)}`).length).toBeLessThanOrEqual(160)
  })

  it('treats unpaid sessions and provider failures as errors', async () => {
    await expect(verifyCheckoutSession(
      { get: vi.fn().mockResolvedValue({ data: { is_pro: false } }) },
      'cs_unpaid',
    )).resolves.toEqual({ status: 'error' })

    await expect(verifyCheckoutSession(
      { get: vi.fn().mockRejectedValue(new Error('network')) },
      'cs_error',
    )).resolves.toEqual({ status: 'error' })
  })
})

describe('Pro checkout creation', () => {
  it('creates one-time Pro checkout sessions through the backend', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.test/session' } }),
    }

    await expect(createProCheckoutSession(apiClient)).resolves.toEqual({
      status: 'success',
      checkoutUrl: 'https://checkout.stripe.test/session',
    })
    expect(apiClient.post).toHaveBeenCalledWith(
      '/payments/create-checkout-session',
      {
        plan: PRO_CHECKOUT_PLAN,
        success_path: '/payment-success?session_id={CHECKOUT_SESSION_ID}',
        cancel_path: '/pricing',
      },
    )
  })

  it('passes caller return paths to checkout creation', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.test/session' } }),
    }

    await expect(createProCheckoutSession(apiClient, {
      successPath: '/payment-success?return_to=%2Ftopics%2F42',
      cancelPath: '/topics/42',
    })).resolves.toEqual({
      status: 'success',
      checkoutUrl: 'https://checkout.stripe.test/session',
    })
    expect(apiClient.post).toHaveBeenCalledWith(
      '/payments/create-checkout-session',
      {
        plan: PRO_CHECKOUT_PLAN,
        success_path: '/payment-success?return_to=%2Ftopics%2F42',
        cancel_path: '/topics/42',
      },
    )
  })

  it('returns a safe error when checkout creation does not return a URL', async () => {
    await expect(createProCheckoutSession({
      post: vi.fn().mockResolvedValue({ data: {} }),
    })).resolves.toEqual({
      status: 'error',
      message: PAYMENT_ERROR_MESSAGE,
    })
  })

  it('preserves backend checkout error details without hardcoding Stripe in the component', async () => {
    const error = { response: { data: { detail: 'Stripe checkout is not configured.' } } }

    expect(getPaymentErrorMessage(error)).toBe('Stripe checkout is not configured.')
    await expect(createProCheckoutSession({
      post: vi.fn().mockRejectedValue(error),
    })).resolves.toEqual({
      status: 'error',
      message: 'Stripe checkout is not configured.',
    })
  })
})

describe('provider-neutral payment requests', () => {
  it('creates CMI payment requests and returns provider form metadata', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue({
        data: {
          id: 12,
          payment_method: 'cmi',
          status: 'pending_provider',
          plan: 'pro',
          amount_centimes: 9900,
          currency: 'MAD',
          reference_code: 'KRESCO-CMI-12',
          instructions: {
            action_url: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
            form_fields: {
              clientid: 'cmi-client',
              oid: 'KRESCO-CMI-12',
              hash: 'signed-hash',
            },
          },
          created_at: '2026-06-15T00:00:00Z',
          expires_at: '2026-06-16T00:00:00Z',
        },
      }),
    }

    await expect(createProPaymentRequest(apiClient, 'cmi')).resolves.toEqual({
      status: 'provider_redirect',
      actionUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
      formFields: {
        clientid: 'cmi-client',
        oid: 'KRESCO-CMI-12',
        hash: 'signed-hash',
      },
      request: expect.objectContaining({
        payment_method: 'cmi',
        reference_code: 'KRESCO-CMI-12',
      }),
    })
    expect(apiClient.post).toHaveBeenCalledWith(
      '/payments/payment-requests',
      {
        plan: PRO_CHECKOUT_PLAN,
        payment_method: 'cmi',
      },
    )
  })

  it('creates manual payment requests without treating them as instant checkout', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue({
        data: {
          id: 21,
          payment_method: 'cashplus',
          status: 'pending_manual_review',
          plan: 'pro',
          amount_centimes: 9900,
          currency: 'MAD',
          reference_code: 'KRESCO-CASH-21',
          instructions: {
            title: 'CashPlus',
            steps: ['Use the reference code when paying through CashPlus.'],
          },
          created_at: '2026-06-15T00:00:00Z',
          expires_at: '2026-06-16T00:00:00Z',
        },
      }),
    }

    await expect(createProPaymentRequest(apiClient, 'cashplus')).resolves.toEqual({
      status: 'pending_manual_review',
      request: expect.objectContaining({
        payment_method: 'cashplus',
        status: 'pending_manual_review',
        reference_code: 'KRESCO-CASH-21',
      }),
    })
  })

  it('fails safely when CMI does not return form-post metadata', async () => {
    await expect(createProPaymentRequest({
      post: vi.fn().mockResolvedValue({
        data: {
          id: 12,
          payment_method: 'cmi',
          status: 'pending_provider',
          plan: 'pro',
          amount_centimes: 9900,
          currency: 'MAD',
          reference_code: 'KRESCO-CMI-12',
          instructions: {},
          created_at: '2026-06-15T00:00:00Z',
          expires_at: null,
        },
      }),
    }, 'cmi')).resolves.toEqual({
      status: 'error',
      message: PAYMENT_ERROR_MESSAGE,
    })
  })

  it('builds a hidden provider form before submitting to CMI', () => {
    const submit = vi.fn()
    const originalSubmit = HTMLFormElement.prototype.submit
    HTMLFormElement.prototype.submit = submit
    document.body.innerHTML = ''

    try {
      submitProviderPaymentForm('https://testpayment.cmi.co.ma/fim/est3Dgate', {
        clientid: 'cmi-client',
        oid: 'KRESCO-CMI-12',
      })
    } finally {
      HTMLFormElement.prototype.submit = originalSubmit
    }

    const form = document.body.querySelector('form')
    expect(form?.method).toBe('post')
    expect(form?.action).toBe('https://testpayment.cmi.co.ma/fim/est3Dgate')
    expect(form?.querySelector<HTMLInputElement>('input[name="clientid"]')?.value).toBe('cmi-client')
    expect(form?.querySelector<HTMLInputElement>('input[name="oid"]')?.value).toBe('KRESCO-CMI-12')
    expect(submit).toHaveBeenCalledOnce()
  })
})
