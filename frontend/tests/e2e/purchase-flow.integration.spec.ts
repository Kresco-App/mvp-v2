import { expect, test } from '@playwright/test'
import { loginAsSeededUser } from './auth'

test.describe('Purchase flow (provider-neutral manual payment)', () => {
  test('creates a pending CashPlus request from pricing', async ({ page }) => {
    await loginAsSeededUser(page, 'basic@example.com')

    await page.goto('/pricing')
    await expect(page.getByRole('heading', { name: /tarification/i })).toBeVisible()

    await page.getByRole('button', { name: /cashplus/i }).click()

    const paymentRequest = page.waitForResponse((response) => (
      response.url().includes('/api/payments/payment-requests')
        && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: /acheter l'acces pro/i }).click()
    const response = await paymentRequest
    expect(response.status()).toBe(200)

    const body = await response.json() as { id: number; reference_code: string; status: string }
    expect(body.status).toBe('pending_manual_review')

    await expect(page.getByText(body.reference_code)).toBeVisible()
    await expect(page.getByText(/99\.00 MAD/)).toBeVisible()

    await page.locator('#manual-proof-reference').fill('CASHPLUS-E2E-RECEIPT')
    await page.locator('#manual-proof-payer').fill('E2E Parent')

    const proofRequest = page.waitForResponse((proofResponse) => (
      proofResponse.url().includes(`/api/payments/manual-payment-requests/${body.id}/proof`)
        && proofResponse.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: /envoyer le justificatif/i }).click()
    const proofResponse = await proofRequest
    expect(proofResponse.status()).toBe(200)
    const proofBody = await proofResponse.json() as { status: string }
    expect(proofBody.status).toBe('pending_manual_review')

    await expect(page.getByText(/justificatif recu/i)).toBeVisible()
  })
})
