import { expect, test, type Page } from '@playwright/test'

test.describe('Purchase flow (provider-neutral manual payment)', () => {
  test('creates a pending CashPlus request from pricing', async ({ page }) => {
    await loginAsSeededUser(page, 'student@example.com')

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

    const body = await response.json() as { reference_code: string; status: string }
    expect(body.status).toBe('pending_manual_review')

    await expect(page.getByText(body.reference_code)).toBeVisible()
    await expect(page.getByText(/99\.00 MAD/)).toBeVisible()
  })
})

async function loginAsSeededUser(page: Page, email: string, password = 'kresco123') {
  await page.goto('/')
  await page.getByRole('button', { name: /se connecter/i }).click()
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)

  const loginResponse = page.waitForResponse((response) => (
    response.url().includes('/api/auth/login')
      && response.request().method() === 'POST'
  ))
  await page.locator('form').filter({ has: page.locator('#login-email') }).getByRole('button', { name: /^Se connecter$/ }).click()
  const response = await loginResponse
  expect(response.status()).toBe(200)
}
