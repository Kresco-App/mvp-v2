import { test, expect } from '@playwright/test'

const isDev = process.env.KRESCO_ENV === 'development'
const fakeStripe = process.env.FAKE_STRIPE_CHECKOUT === 'true'

test.describe('Purchase flow (fake Stripe checkout)', () => {
  test.skip(!isDev || !fakeStripe, 'Skipped – requires development mode with FAKE_STRIPE_CHECKOUT=true')

  test('navigate to pricing, click checkout, and verify redirect', async ({ page }) => {
    // 1. Navigate to the pricing page
    await page.goto('/pricing')
    await expect(page.locator('h1, [data-testid="pricing-heading"]')).toBeVisible()

    // 2. Click the first checkout / subscribe button
    const checkoutButton = page.getByRole('button', { name: /checkout|subscribe|buy|get started/i }).first()
    await expect(checkoutButton).toBeVisible()
    await checkoutButton.click()

    // 3. With the fake-Stripe flag the app should redirect to a
    //    success / confirmation page instead of real Stripe.
    await page.waitForURL(/\/(success|confirmation|dashboard)/, { timeout: 15_000 })
    expect(page.url()).toMatch(/\/(success|confirmation|dashboard)/)
  })
})
