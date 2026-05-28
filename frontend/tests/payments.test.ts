import { describe, expect, it, vi } from 'vitest'

import {
  PAYMENT_ERROR_MESSAGE,
  PRO_CHECKOUT_PLAN,
  createProCheckoutSession,
  getPaymentErrorMessage,
  paymentVerificationIdempotencyKey,
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
      null,
      { params: { plan: PRO_CHECKOUT_PLAN } },
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
