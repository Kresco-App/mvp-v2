import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'


describe('Playwright integration config', () => {
  it('keeps realtime enabled for backend-backed integration coverage', () => {
    const source = readFileSync(resolve(process.cwd(), 'playwright.integration.config.ts'), 'utf8')

    expect(source).not.toContain("NEXT_PUBLIC_ABLY_ENABLED: 'false'")
    expect(source).toContain("NEXT_PUBLIC_ABLY_ENABLED: process.env.NEXT_PUBLIC_ABLY_ENABLED ?? 'true'")
    expect(source).toContain('ABLY_API_KEY')
    expect(source).toContain('ABLY_API_KEY is required for CI integration tests')
    expect(source).toContain('const e2eAblyApiKey =')
    expect(source).toContain('JWT_SECRET_KEY: jwtSecretKey')
    expect(source).toContain("KRESCO_LOCAL_BACKEND_ORIGIN: backendOrigin")
    expect(source).toContain("NEXT_PUBLIC_API_BASE_URL: '/api/'")
    expect(source).toContain('command: `npm run start -- --hostname 127.0.0.1 --port ${frontendPort}`')
    expect(source).not.toContain('NEXT_PUBLIC_API_BASE_URL: `${backendOrigin}/api/`')
    expect(source).not.toContain('npx next build && npm run start')
  })

  it('requires an explicit e2e database URL in CI', () => {
    const source = readFileSync(resolve(process.cwd(), 'playwright.integration.config.ts'), 'utf8')
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

    expect(source).toContain('process.env.CI && !process.env.KRESCO_E2E_DATABASE_URL')
    expect(source).toContain('KRESCO_E2E_DATABASE_URL is required for CI integration tests.')
    expect(source).toContain("const localE2eDatabaseUrl = 'sqlite+aiosqlite:///./e2e.sqlite3'")
    expect(packageJson.scripts['test:e2e:integration']).toContain('node scripts/build-integration.mjs')
  })

  it('does not enable legacy fake Stripe checkout in integration tests', () => {
    const source = readFileSync(resolve(process.cwd(), 'playwright.integration.config.ts'), 'utf8')

    expect(source).toContain("KRESCO_ENV: 'development'")
    expect(source).not.toContain('FAKE_STRIPE_CHECKOUT')
  })
})
