import { describe, expect, it, vi } from 'vitest'

import {
  MANUAL_PAYMENT_PROOF_ERROR,
  getManualPaymentProofErrorMessage,
  submitManualPaymentProof,
} from '@/lib/manualPayments'

describe('manual payment proof submission', () => {
  it('posts normalized proof metadata to the manual payment proof endpoint', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue({
        data: {
          id: 42,
          payment_method: 'cashplus',
          status: 'pending_manual_review',
          reference_code: 'KRESCO-CASH-42',
          metadata: {
            proofs: [{ provider_reference: 'CASH-RECEIPT-1' }],
          },
        },
      }),
    }

    await expect(submitManualPaymentProof(apiClient, 42, {
      proof_kind: 'cashplus_receipt',
      provider_reference: ' CASH-RECEIPT-1 ',
      proof_url: ' ',
      payer_name: ' Parent Name ',
      notes: ' Agence Maarif ',
    })).resolves.toEqual({
      status: 'success',
      transaction: expect.objectContaining({
        id: 42,
        status: 'pending_manual_review',
        reference_code: 'KRESCO-CASH-42',
      }),
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/payments/manual-payment-requests/42/proof',
      {
        proof_kind: 'cashplus_receipt',
        provider_reference: 'CASH-RECEIPT-1',
        proof_url: undefined,
        payer_name: 'Parent Name',
        notes: 'Agence Maarif',
      },
    )
  })

  it('preserves backend proof errors when available', async () => {
    const error = { response: { data: { detail: 'Manual payment is expired.' } } }

    expect(getManualPaymentProofErrorMessage(error)).toBe('Manual payment is expired.')
    await expect(submitManualPaymentProof({
      post: vi.fn().mockRejectedValue(error),
    }, 42, {
      provider_reference: 'CASH-RECEIPT-1',
    })).resolves.toEqual({
      status: 'error',
      message: 'Manual payment is expired.',
    })
  })

  it('falls back to a safe generic proof error', async () => {
    expect(getManualPaymentProofErrorMessage(new Error('network'))).toBe(MANUAL_PAYMENT_PROOF_ERROR)
  })
})
