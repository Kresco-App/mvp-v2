import { describe, expect, it, vi } from 'vitest'

import {
  approveManualPaymentTransaction,
  importManualPaymentReconciliation,
  listManualPaymentTransactions,
  manualPaymentsPath,
  parseManualPaymentImportRows,
  reconcileManualPaymentTransaction,
  rejectManualPaymentTransaction,
} from '@/lib/adminFinance'

describe('admin finance payment client', () => {
  it('builds the staff manual payment queue path with status and limit', () => {
    expect(manualPaymentsPath('pending_manual_review', 25)).toBe('/payments/manual-payment-requests?status=pending_manual_review&limit=25')
  })

  it('lists manual payment transactions through the staff endpoint', async () => {
    const apiClient = {
      get: vi.fn().mockResolvedValue({ data: [{ id: 1, reference_code: 'KRESCO-BANK-1' }] }),
    }

    await expect(listManualPaymentTransactions(apiClient, 'mismatch', 50)).resolves.toEqual([
      { id: 1, reference_code: 'KRESCO-BANK-1' },
    ])

    expect(apiClient.get).toHaveBeenCalledWith('/payments/manual-payment-requests?status=mismatch&limit=50')
  })

  it('posts approve and reject review decisions with trimmed reasons', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue({ data: { id: 7, status: 'paid' } }),
    }

    await approveManualPaymentTransaction(apiClient, 7, { reason: ' confirmed in bank ' })
    await rejectManualPaymentTransaction(apiClient, 8, { reason: ' duplicate receipt ' })

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/payments/manual-payment-requests/7/approve',
      { reason: 'confirmed in bank' },
    )
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/payments/manual-payment-requests/8/reject',
      { reason: 'duplicate receipt' },
    )
  })

  it('posts single reconciliation and normalized import rows', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue({ data: { id: 9, status: 'paid' } }),
    }

    await reconcileManualPaymentTransaction(apiClient, {
      payment_method: 'cashplus',
      reference_code: ' KRESCO-CASH-9 ',
      amount_centimes: 9900,
      provider_reference: ' CASH-REF-9 ',
      reason: ' cash report ',
    })
    await importManualPaymentReconciliation(apiClient, {
      payment_method: 'ashplus',
      source_name: ' ash-report ',
      rows: parseManualPaymentImportRows('[{"reference_code":" KRESCO-ASH-1 ","amount_centimes":9900,"provider_reference":" ASH-1 "}]'),
    })

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/payments/manual-payment-requests/reconcile',
      {
        payment_method: 'cashplus',
        reference_code: 'KRESCO-CASH-9',
        amount_centimes: 9900,
        provider_reference: 'CASH-REF-9',
        reason: 'cash report',
        collected_at: undefined,
      },
    )
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/payments/manual-payment-reconciliation-imports',
      {
        payment_method: 'ashplus',
        source_name: 'ash-report',
        rows: [{
          reference_code: 'KRESCO-ASH-1',
          amount_centimes: 9900,
          provider_reference: 'ASH-1',
          reason: 'Finance import row',
          collected_at: undefined,
          raw_row: undefined,
        }],
      },
    )
  })

  it('rejects malformed import JSON before calling the API', () => {
    expect(() => parseManualPaymentImportRows('{"rows":[{"reference_code":"x"}]}')).toThrow('Invalid reconciliation row 1.')
    expect(() => parseManualPaymentImportRows('{"rows":["not-an-object"]}')).toThrow('Invalid reconciliation row 1.')
    expect(() => parseManualPaymentImportRows('{"items":[]}')).toThrow('Import JSON must be an array or an object with rows.')
  })
})
