import { defineConfig, devices } from '@playwright/test'
import { randomBytes } from 'node:crypto'

const backendPort = Number(process.env.KRESCO_E2E_BACKEND_PORT ?? 8010)
const frontendPort = Number(process.env.KRESCO_E2E_FRONTEND_PORT ?? 3101)
const backendOrigin = `http://127.0.0.1:${backendPort}`
const frontendOrigin = `http://127.0.0.1:${frontendPort}`
const localE2eDatabaseUrl = 'sqlite+aiosqlite:///./e2e.sqlite3'
const backendPython = process.env.KRESCO_E2E_BACKEND_PYTHON ?? 'python'
if (process.env.CI && !process.env.KRESCO_E2E_DATABASE_URL) {
  throw new Error('KRESCO_E2E_DATABASE_URL is required for CI integration tests.')
}
const e2eDatabaseUrl = process.env.KRESCO_E2E_DATABASE_URL ?? localE2eDatabaseUrl

function resolveAdminPassword() {
  const configured = process.env.ADMIN_PASSWORD?.trim()
  if (configured) return configured

  const generated = `e2e-admin-${randomBytes(24).toString('hex')}`
  process.env.ADMIN_PASSWORD = generated
  return generated
}

function resolveJwtSecretKey() {
  const configured = process.env.JWT_SECRET_KEY?.trim()
  if (configured) return configured

  const generated = randomBytes(32).toString('hex')
  process.env.JWT_SECRET_KEY = generated
  return generated
}

const adminPassword = resolveAdminPassword()
const jwtSecretKey = resolveJwtSecretKey()

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /integration\.spec\.ts$/,
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: frontendOrigin,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `cd ../backend && ${backendPython} scripts/prepare_e2e_db.py && ${backendPython} -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port ${backendPort}`,
      url: `${backendOrigin}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        ADMIN_PASSWORD: adminPassword,
        CORS_ALLOWED_ORIGINS: frontendOrigin,
        CORS_ALLOW_ORIGIN_REGEX: '',
        DATABASE_URL: e2eDatabaseUrl,
        FRONTEND_URL: frontendOrigin,
        JWT_SECRET_KEY: jwtSecretKey,
        KRESCO_AUTH_LOGIN_RATE_LIMIT: '30/minute',
        KRESCO_E2E_DATABASE_URL: e2eDatabaseUrl,
        KRESCO_ENV: 'development',
        MEDIA_STORAGE_BACKEND: 'gcs-mock',
        MEDIA_GCS_BUCKET: 'kresco-e2e-media',
        MEDIA_GCS_PREFIX: 'e2e',
        MEDIA_GCS_MOCK_ROOT: './e2e-gcs',
      },
    },
    {
      command: 'node scripts/prepare-standalone-server.mjs && node .next/standalone/server.js',
      url: frontendOrigin,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        KRESCO_ENV: 'development',
        KRESCO_ENABLE_LOCAL_REWRITES: 'true',
        KRESCO_LOCAL_BACKEND_ORIGIN: backendOrigin,
        JWT_SECRET_KEY: jwtSecretKey,
        NEXT_PUBLIC_REALTIME_PROVIDER: process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? 'off',
        NEXT_PUBLIC_API_BASE_URL: '/api/',
        HOSTNAME: '127.0.0.1',
        PORT: String(frontendPort),
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
