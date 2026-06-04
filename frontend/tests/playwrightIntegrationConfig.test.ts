import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'


describe('Playwright integration config', () => {
  it('keeps realtime enabled for backend-backed integration coverage', () => {
    const source = readFileSync(resolve(process.cwd(), 'playwright.integration.config.ts'), 'utf8')

    expect(source).not.toContain("NEXT_PUBLIC_ABLY_ENABLED: 'false'")
    expect(source).toContain("NEXT_PUBLIC_ABLY_ENABLED: process.env.NEXT_PUBLIC_ABLY_ENABLED ?? 'true'")
    expect(source).toContain('ABLY_API_KEY')
    expect(source).toContain('JWT_SECRET_KEY: jwtSecretKey')
  })

  it('requires an explicit e2e database URL in CI', () => {
    const source = readFileSync(resolve(process.cwd(), 'playwright.integration.config.ts'), 'utf8')

    expect(source).toContain('process.env.CI && !process.env.KRESCO_E2E_DATABASE_URL')
    expect(source).toContain('KRESCO_E2E_DATABASE_URL is required for CI integration tests.')
    expect(source).toContain("const localE2eDatabaseUrl = 'sqlite+aiosqlite:///./e2e.sqlite3'")
  })
})
