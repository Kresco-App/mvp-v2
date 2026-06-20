// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminFinancePage from '@/app/admin/finance/page'

const mocks = vi.hoisted(() => ({
  listManualPaymentTransactions: vi.fn(),
  listFinanceLedgerEntries: vi.fn(),
  listPaymentProviderEvents: vi.fn(),
  listManualPaymentReconciliationImports: vi.fn(),
  approveManualPaymentTransaction: vi.fn(),
  rejectManualPaymentTransaction: vi.fn(),
  reconcileManualPaymentTransaction: vi.fn(),
  importManualPaymentReconciliation: vi.fn(),
  parseManualPaymentImportRows: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/lib/adminFinance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adminFinance')>()
  return {
    ...actual,
    listManualPaymentTransactions: mocks.listManualPaymentTransactions,
    listFinanceLedgerEntries: mocks.listFinanceLedgerEntries,
    listPaymentProviderEvents: mocks.listPaymentProviderEvents,
    listManualPaymentReconciliationImports: mocks.listManualPaymentReconciliationImports,
    approveManualPaymentTransaction: mocks.approveManualPaymentTransaction,
    rejectManualPaymentTransaction: mocks.rejectManualPaymentTransaction,
    reconcileManualPaymentTransaction: mocks.reconcileManualPaymentTransaction,
    importManualPaymentReconciliation: mocks.importManualPaymentReconciliation,
    parseManualPaymentImportRows: mocks.parseManualPaymentImportRows,
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
  mocks.listManualPaymentTransactions.mockResolvedValue([
    {
      id: 42,
      user_id: 9,
      provider: 'cashplus',
      payment_method: 'cashplus',
      status: 'pending_manual_review',
      plan: 'pro',
      amount_centimes: 9900,
      currency: 'MAD',
      reference_code: 'KRESCO-CASH-42',
      provider_reference: null,
      instructions: {},
      created_at: '2026-06-15T00:00:00Z',
      updated_at: '2026-06-15T00:00:00Z',
      expires_at: null,
      confirmed_at: null,
      metadata: { proofs: [{ provider_reference: 'CASH-REF-42' }] },
    },
  ])
  mocks.listFinanceLedgerEntries.mockResolvedValue([
    {
      id: 101,
      transaction_id: 42,
      user_id: 9,
      entry_type: 'payment_confirmed',
      amount_centimes: 9900,
      currency: 'MAD',
      reason: 'Finance confirmation',
      metadata: { actor_user_id: 1 },
      created_at: '2026-06-15T00:01:00Z',
    },
  ])
  mocks.listPaymentProviderEvents.mockResolvedValue([
    {
      id: 201,
      transaction_id: 42,
      provider: 'cashplus',
      event_id: 'manual-approval-42',
      event_type: 'manual.approved',
      status: 'failed',
      payload: { reason: 'Finance confirmation' },
      received_at: '2026-06-15T00:01:00Z',
      processed_at: '2026-06-15T00:01:00Z',
    },
  ])
  mocks.listManualPaymentReconciliationImports.mockResolvedValue([
    {
      id: 301,
      provider: 'bank_transfer',
      payment_method: 'bank_transfer',
      source_name: 'bank-report-2026-06',
      status: 'processed',
      row_count: 2,
      matched_count: 1,
      mismatch_count: 1,
      unmatched_count: 1,
      duplicate_count: 0,
      error_count: 0,
      created_by_user_id: 1,
      created_at: '2026-06-15T00:01:00Z',
    },
  ])
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:finance-audit'),
    revokeObjectURL: vi.fn(),
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
  vi.unstubAllGlobals()
})

describe('AdminFinancePage', () => {
  it('loads the manual payment queue and approves a pending transaction', async () => {
    mocks.approveManualPaymentTransaction.mockResolvedValue({
      id: 42,
      user_id: 9,
      provider: 'cashplus',
      payment_method: 'cashplus',
      status: 'paid',
      plan: 'pro',
      amount_centimes: 9900,
      currency: 'MAD',
      reference_code: 'KRESCO-CASH-42',
      provider_reference: 'CASH-REF-42',
      instructions: {},
      created_at: '2026-06-15T00:00:00Z',
      updated_at: '2026-06-15T00:01:00Z',
      expires_at: null,
      confirmed_at: '2026-06-15T00:01:00Z',
      metadata: {},
    })

    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-CASH-42')
      expect(container.textContent).toContain('Payment status')
      expect(container.textContent).toContain('Rail mix')
      expect(container.textContent).toContain('Audit health')
      expect(container.textContent).toContain('Provider failed')
      expect(container.textContent).toContain('Import mismatch')
      expect(container.textContent).toContain('Unmatched')
      expect(container.textContent).toContain('Paid revenue')
      expect(container.textContent).toContain('proofs: 1')
      expect(container.textContent).toContain('Finance audit trail')
      expect(container.textContent).toContain('payment_confirmed')
      expect(container.textContent).toContain('manual.approved')
      expect(container.textContent).toContain('bank-report-2026-06')
    })

    await clickButton(container, 'Approve')

    expect(mocks.approveManualPaymentTransaction).toHaveBeenCalledWith(
      undefined,
      42,
      { reason: 'Finance confirmation' },
    )
    await waitFor(() => {
      expect(container.textContent).not.toContain('KRESCO-CASH-42')
      expect(container.textContent).toContain('No manual payments in this filter.')
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Payment approved.')
  })

  it('loads transaction-scoped audit rows and exports loaded CSV', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-CASH-42')
    })

    await clickButton(container, 'Audit trail')
    await waitFor(() => {
      expect(mocks.listFinanceLedgerEntries).toHaveBeenLastCalledWith(undefined, 25, 42)
      expect(mocks.listPaymentProviderEvents).toHaveBeenLastCalledWith(undefined, 25, 42)
      expect(container.textContent).toContain('Scoped to transaction #42')
      expect(mocks.listManualPaymentReconciliationImports).toHaveBeenCalledTimes(1)
      expect(container.textContent).not.toContain('bank-report-2026-06')
    })

    await clickButton(container, 'CSV')

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('ignores stale all-audit responses after selecting a transaction scope', async () => {
    const globalLedger = deferred<unknown[]>()
    const globalEvents = deferred<unknown[]>()
    mocks.listFinanceLedgerEntries
      .mockReturnValueOnce(globalLedger.promise)
      .mockResolvedValueOnce([
        {
          id: 102,
          transaction_id: 42,
          user_id: 9,
          entry_type: 'scoped_payment_confirmed',
          amount_centimes: 9900,
          currency: 'MAD',
          reason: 'Scoped row',
          metadata: {},
          created_at: '2026-06-15T00:01:00Z',
        },
      ])
    mocks.listPaymentProviderEvents
      .mockReturnValueOnce(globalEvents.promise)
      .mockResolvedValueOnce([
        {
          id: 202,
          transaction_id: 42,
          provider: 'cashplus',
          event_id: 'scoped-event',
          event_type: 'scoped.manual.approved',
          status: 'processed',
          payload: {},
          received_at: '2026-06-15T00:01:00Z',
          processed_at: '2026-06-15T00:01:00Z',
        },
      ])

    const { container } = renderPage()
    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-CASH-42')
    })

    await clickButton(container, 'Audit trail')
    await waitFor(() => {
      expect(container.textContent).toContain('scoped_payment_confirmed')
      expect(container.textContent).toContain('scoped.manual.approved')
      expect(container.textContent).toContain('Scoped to transaction #42')
    })

    await act(async () => {
      globalLedger.resolve([
        {
          id: 103,
          transaction_id: null,
          user_id: null,
          entry_type: 'global_stale_entry',
          amount_centimes: 0,
          currency: 'MAD',
          reason: 'Stale row',
          metadata: {},
          created_at: '2026-06-15T00:00:00Z',
        },
      ])
      globalEvents.resolve([
        {
          id: 203,
          transaction_id: null,
          provider: 'bank_transfer',
          event_id: 'global-stale-event',
          event_type: 'global.stale.event',
          status: 'processed',
          payload: {},
          received_at: '2026-06-15T00:00:00Z',
          processed_at: '2026-06-15T00:00:00Z',
        },
      ])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('scoped_payment_confirmed')
    expect(container.textContent).not.toContain('global_stale_entry')
    expect(container.textContent).not.toContain('global.stale.event')
  })

  it('keeps review reasons scoped to the selected payment card', async () => {
    mocks.listManualPaymentTransactions.mockResolvedValue([
      {
        id: 42,
        user_id: 9,
        provider: 'cashplus',
        payment_method: 'cashplus',
        status: 'pending_manual_review',
        plan: 'pro',
        amount_centimes: 9900,
        currency: 'MAD',
        reference_code: 'KRESCO-CASH-42',
        provider_reference: null,
        instructions: {},
        created_at: '2026-06-15T00:00:00Z',
        updated_at: '2026-06-15T00:00:00Z',
        expires_at: null,
        confirmed_at: null,
        metadata: {},
      },
      {
        id: 43,
        user_id: 10,
        provider: 'cashplus',
        payment_method: 'cashplus',
        status: 'pending_manual_review',
        plan: 'pro',
        amount_centimes: 9900,
        currency: 'MAD',
        reference_code: 'KRESCO-CASH-43',
        provider_reference: null,
        instructions: {},
        created_at: '2026-06-15T00:00:00Z',
        updated_at: '2026-06-15T00:00:00Z',
        expires_at: null,
        confirmed_at: null,
        metadata: {},
      },
    ])
    mocks.approveManualPaymentTransaction.mockResolvedValue({
      id: 43,
      user_id: 10,
      provider: 'cashplus',
      payment_method: 'cashplus',
      status: 'paid',
      plan: 'pro',
      amount_centimes: 9900,
      currency: 'MAD',
      reference_code: 'KRESCO-CASH-43',
      provider_reference: 'CASH-43',
      instructions: {},
      created_at: '2026-06-15T00:00:00Z',
      updated_at: '2026-06-15T00:01:00Z',
      expires_at: null,
      confirmed_at: '2026-06-15T00:01:00Z',
      metadata: {},
    })

    const { container } = renderPage()
    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-CASH-43')
    })

    setInputValue(container, 'input[aria-label="Review reason for KRESCO-CASH-42"]', 'wrong receipt')
    setInputValue(container, 'input[aria-label="Review reason for KRESCO-CASH-43"]', 'confirmed cashplus batch')
    await clickButtonInCard(container, 'KRESCO-CASH-43', 'Approve')

    expect(mocks.approveManualPaymentTransaction).toHaveBeenCalledWith(
      undefined,
      43,
      { reason: 'confirmed cashplus batch' },
    )
    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-CASH-42')
      expect(container.textContent).not.toContain('KRESCO-CASH-43')
    })
  })

  it('submits single reconciliation and normalized import rows', async () => {
    mocks.reconcileManualPaymentTransaction.mockResolvedValue({
      id: 50,
      user_id: 10,
      provider: 'bank_transfer',
      payment_method: 'bank_transfer',
      status: 'paid',
      plan: 'pro',
      amount_centimes: 9900,
      currency: 'MAD',
      reference_code: 'KRESCO-BANK-50',
      provider_reference: 'BANK-50',
      instructions: {},
      created_at: '2026-06-15T00:00:00Z',
      updated_at: '2026-06-15T00:01:00Z',
      expires_at: null,
      confirmed_at: '2026-06-15T00:01:00Z',
      metadata: {},
    })
    mocks.parseManualPaymentImportRows.mockReturnValue([
      { reference_code: 'KRESCO-BANK-51', amount_centimes: 9900, provider_reference: 'BANK-51' },
    ])
    mocks.importManualPaymentReconciliation.mockResolvedValue({
      matched_count: 1,
      mismatch_count: 0,
      unmatched_count: 0,
      duplicate_count: 0,
      rows: [],
    })

    const { container } = renderPage()
    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-CASH-42')
    })

    setInputValue(container, 'input[placeholder="KRESCO-BANK-..."]', 'KRESCO-BANK-50')
    setInputValue(container, 'input[placeholder="Bank/Cash receipt ref"]', 'BANK-50')
    await clickButton(container, 'Reconcile payment')

    expect(mocks.reconcileManualPaymentTransaction).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        payment_method: 'bank_transfer',
        reference_code: 'KRESCO-BANK-50',
        amount_centimes: 9900,
        provider_reference: 'BANK-50',
      }),
    )

    setInputValue(container, 'textarea', '[{"reference_code":"KRESCO-BANK-51","amount_centimes":9900,"provider_reference":"BANK-51"}]')
    await clickButton(container, 'Import rows')

    expect(mocks.parseManualPaymentImportRows).toHaveBeenCalled()
    expect(mocks.importManualPaymentReconciliation).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        payment_method: 'bank_transfer',
        rows: [{ reference_code: 'KRESCO-BANK-51', amount_centimes: 9900, provider_reference: 'BANK-51' }],
      }),
    )
    await waitFor(() => {
      expect(container.textContent).toContain('1 matched, 0 mismatched, 0 unmatched, 0 duplicate.')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminFinancePage))
  })

  return { container, root }
}

function setInputValue(container: HTMLElement, selector: string, value: string) {
  const input = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
  if (!input) throw new Error(`input not found: ${selector}`)
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  await act(async () => {
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function clickButtonInCard(container: HTMLElement, referenceCode: string, name: string) {
  const card = Array.from(container.querySelectorAll('article')).find((item) => item.textContent?.includes(referenceCode))
  if (!card) throw new Error(`card not found: ${referenceCode}`)
  const button = Array.from(card.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  await act(async () => {
    button.click()
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}
