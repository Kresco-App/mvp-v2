import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'


describe('Playwright integration config', () => {
  it('uses Firestore/offline realtime config for backend-backed integration coverage', () => {
    const source = readFileSync(resolve(process.cwd(), 'playwright.integration.config.ts'), 'utf8')

    expect(source).toContain("NEXT_PUBLIC_REALTIME_PROVIDER: process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? 'off'")
    const removedProvider = 'AB' + 'LY'
    expect(source).not.toContain(`${removedProvider}_API_KEY`)
    expect(source).not.toContain(`NEXT_PUBLIC_${removedProvider}_ENABLED`)
    expect(source).toContain('JWT_SECRET_KEY: jwtSecretKey')
    expect(source).toContain("KRESCO_LOCAL_BACKEND_ORIGIN: backendOrigin")
    expect(source).toContain("NEXT_PUBLIC_API_BASE_URL: '/api/'")
    expect(source).toContain("command: 'node .next/standalone/server.js'")
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
})
