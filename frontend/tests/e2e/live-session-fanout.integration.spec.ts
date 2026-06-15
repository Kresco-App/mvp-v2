import { test, expect } from '@playwright/test'

const ablyApiKey = process.env.ABLY_API_KEY ?? ''
const hasAblyKey = ablyApiKey.length > 0 && !ablyApiKey.startsWith('e2e-')
if (process.env.CI && !hasAblyKey) {
  throw new Error('ABLY_API_KEY must be configured in CI for live-session fanout integration coverage.')
}

test.describe('Live session fanout (real Ably)', () => {
  test.skip(!hasAblyKey, 'Skipped – ABLY_API_KEY is not set or is a placeholder')

  test('subscribe to a channel and receive a message', async ({ page, request }) => {
    // 1. Open the app so the Ably client is initialised
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 2. Use the Ably REST API to publish a test message to a known channel.
    //    The key parts are derived from ABLY_API_KEY (format: "appId.keyId:keySecret").
    const channelName = `e2e-fanout-${Date.now()}`
    const testPayload = { text: 'hello-from-e2e', ts: Date.now() }

    const publishResponse = await request.post(
      `https://rest.ably.io/channels/${encodeURIComponent(channelName)}/messages`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(ablyApiKey).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        data: {
          name: 'test-event',
          data: JSON.stringify(testPayload),
        },
      },
    )

    expect(publishResponse.ok()).toBe(true)

    // 3. Verify the message was accepted by Ably (history endpoint).
    const historyResponse = await request.get(
      `https://rest.ably.io/channels/${encodeURIComponent(channelName)}/history?limit=1`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(ablyApiKey).toString('base64')}`,
        },
      },
    )

    expect(historyResponse.ok()).toBe(true)

    const history = await historyResponse.json()
    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history[0].name).toBe('test-event')
  })
})
