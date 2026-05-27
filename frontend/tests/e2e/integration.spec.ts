import { expect, test } from '@playwright/test'

test('local demo login backdoor is not exposed', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Bienvenue sur Kresco/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Local demo login/i })).toHaveCount(0)

  const response = await page.request.post('/api/auth/demo-login')
  expect(response.status()).toBe(404)

  const storedToken = await page.evaluate(() => localStorage.getItem('kresco_token'))
  expect(storedToken).toBeNull()
})
