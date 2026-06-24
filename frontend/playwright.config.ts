import { defineConfig, devices } from '@playwright/test'
import { randomBytes } from 'node:crypto'

function resolveJwtSecretKey() {
  const configured = process.env.JWT_SECRET_KEY?.trim()
  if (configured) return configured

  const generated = randomBytes(32).toString('hex')
  process.env.JWT_SECRET_KEY = generated
  return generated
}

const jwtSecretKey = resolveJwtSecretKey()

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /integration\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/prepare-standalone-server.mjs && node .next/standalone/server.js',
    url: 'http://127.0.0.1:3100',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: '3100',
      JWT_SECRET_KEY: jwtSecretKey,
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
