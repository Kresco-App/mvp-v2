import { describe, expect, it, vi } from 'vitest'

import {
  approveManualPaymentTransaction,
  financeLedgerEntriesCsv,
  financeLedgerPath,
  importManualPaymentReconciliation,
  listFinanceLedgerEntries,
  listManualPaymentTransactions,
  listManualPaymentReconciliationImports,
  listPaymentProviderEvents,
  manualPaymentImportSummariesCsv,
  manualPaymentReconciliationImportsPath,
  manualPaymentsPath,
  paymentProviderEventsCsv,
  paymentProviderEventsPath,
  parseManualPaymentImportRows,
  reconcileManualPaymentTransaction,
  rejectManualPaymentTransaction,
} from '@/lib/adminFinance'

describe('admin finance payment client', () => {
  it('builds the staff manual payment queue path with status and limit', () => {
    expect(manualPaymentsPath('pending_manual_review', 25)).toBe('/payments/manual-payment-requests?status=pending_manual_review&limit=25')
    expect(financeLedgerPath(10, 42)).toBe('/payments/finance/ledger?limit=10&transaction_id=42')
    expect(paymentProviderEventsPath(10, 42)).toBe('/payments/finance/provider-events?limit=10&transaction_id=42')
    expect(manualPaymentReconciliationImportsPath(5)).toBe('/payments/manual-payment-reconciliation-imports?limit=5')
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

  it('lists finance audit rows through staff endpoints', async () => {
    const apiClient = {
      get: vi.fn()
        .mockResolvedValueOnce({ data: [{ id: 1, entry_type: 'payment_confirmed' }] })
        .mockResolvedValueOnce({ data: [{ id: 2, event_type: 'manual.approved' }] })
        .mockResolvedValueOnce({ data: [{ id: 3, source_name: 'bank-report' }] }),
    }

    await expect(listFinanceLedgerEntries(apiClient, 25, 7)).resolves.toEqual([{ id: 1, entry_type: 'payment_confirmed' }])
    await expect(listPaymentProviderEvents(apiClient, 25, 7)).resolves.toEqual([{ id: 2, event_type: 'manual.approved' }])
    await expect(listManualPaymentReconciliationImports(apiClient, 10)).resolves.toEqual([{ id: 3, source_name: 'bank-report' }])

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/payments/finance/ledger?limit=25&transaction_id=7')
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/payments/finance/provider-events?limit=25&transaction_id=7')
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/payments/manual-payment-reconciliation-imports?limit=10')
  })

  it('serializes finance audit CSV with escaped structured values', () => {
    expect(financeLedgerEntriesCsv([{
      id: 1,
      transaction_id: 7,
      user_id: 9,
      entry_type: 'payment_confirmed',
      amount_centimes: 9900,
      currency: 'MAD',
      reason: 'confirmed, with receipt',
      metadata: { actor_user_id: 3, note: 'quote "ok"' },
      created_at: '2026-06-15T10:00:00Z',
    }])).toContain('"confirmed, with receipt","{""actor_user_id"":3,""note"":""quote \\""ok\\""""}"')
    expect(paymentProviderEventsCsv([{
      id: 2,
      transaction_id: null,
      provider: 'bank_transfer',
      event_id: '=HYPERLINK("https://example.test")',
      event_type: 'manual.reconciliation_unmatched',
      status: 'failed',
      payload: { reference_code: 'missing' },
      received_at: '2026-06-15T10:00:00Z',
      processed_at: null,
    }])).toContain(`"'=HYPERLINK(""https://example.test"")"`)
    expect(manualPaymentImportSummariesCsv([{
      id: 3,
      provider: 'bank_transfer',
      payment_method: 'bank_transfer',
      source_name: 'bank report',
      status: 'processed',
      row_count: 1,
      matched_count: 1,
      mismatch_count: 0,
      unmatched_count: 0,
      duplicate_count: 0,
      error_count: 0,
      created_by_user_id: 4,
      created_at: '2026-06-15T10:00:00Z',
    }])).toContain('bank report')
  })
})
