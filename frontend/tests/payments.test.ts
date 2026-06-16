// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import {
  PAYMENT_ERROR_MESSAGE,
  PRO_CHECKOUT_PLAN,
  createProPaymentRequest,
  getCurrentProPaymentRequest,
  getPaymentErrorMessage,
  submitProviderPaymentForm,
} from '@/lib/payments'

describe('provider-neutral payment requests', () => {
  it('loads the current Pro payment request through the student endpoint', async () => {
    const apiClient = {
      get: vi.fn().mockResolvedValue({
        data: {
          id: 24,
          payment_method: 'bank_transfer',
          status: 'failed',
          plan: 'pro',
          amount_centimes: 9900,
          currency: 'MAD',
          reference_code: 'KRESCO-VIR-24',
          instructions: { title: 'Virement bancaire' },
          created_at: '2026-06-15T00:00:00Z',
          expires_at: null,
        },
      }),
    }

    await expect(getCurrentProPaymentRequest(apiClient)).resolves.toEqual(expect.objectContaining({
      id: 24,
      payment_method: 'bank_transfer',
      status: 'failed',
      reference_code: 'KRESCO-VIR-24',
    }))
    expect(apiClient.get).toHaveBeenCalledWith('/payments/payment-requests/current')
  })

  it('treats missing or unavailable current payment status as no recovered request', async () => {
    await expect(getCurrentProPaymentRequest({
      get: vi.fn().mockResolvedValue({ data: null }),
    })).resolves.toBeNull()
    await expect(getCurrentProPaymentRequest({
      get: vi.fn().mockRejectedValue(new Error('network')),
    })).resolves.toBeNull()
  })

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

  it('preserves backend payment error details', () => {
    const error = { response: { data: { detail: 'CMI checkout is not configured.' } } }

    expect(getPaymentErrorMessage(error)).toBe('CMI checkout is not configured.')
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
