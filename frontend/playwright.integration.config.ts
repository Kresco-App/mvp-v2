import { defineConfig, devices } from '@playwright/test'

const backendPort = Number(process.env.KRESCO_E2E_BACKEND_PORT ?? 8010)
const frontendPort = Number(process.env.KRESCO_E2E_FRONTEND_PORT ?? 3101)
const backendOrigin = `http://127.0.0.1:${backendPort}`
const frontendOrigin = `http://127.0.0.1:${frontendPort}`
const localE2eDatabaseUrl = 'sqlite+aiosqlite:///./e2e.sqlite3'
if (process.env.CI && !process.env.KRESCO_E2E_DATABASE_URL) {
  throw new Error('KRESCO_E2E_DATABASE_URL is required for CI integration tests.')
}
const e2eDatabaseUrl = process.env.KRESCO_E2E_DATABASE_URL ?? localE2eDatabaseUrl
const jwtSecretKey = process.env.JWT_SECRET_KEY ?? 'test-secret-key-for-ci-32-bytes-minimum'
const e2eAblyApiKey = process.env.ABLY_API_KEY ?? 'e2e-app.e2e-key:e2e-secret-for-local-integration'

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
      command: `cd ../backend && python scripts/prepare_e2e_db.py && python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port ${backendPort}`,
      url: `${backendOrigin}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'test-admin-password',
        CORS_ALLOWED_ORIGINS: frontendOrigin,
        CORS_ALLOW_ORIGIN_REGEX: '',
        DATABASE_URL: e2eDatabaseUrl,
        FRONTEND_URL: frontendOrigin,
        ABLY_API_KEY: e2eAblyApiKey,
        ABLY_TOKEN_TTL_SECONDS: process.env.ABLY_TOKEN_TTL_SECONDS ?? '3600',
        JWT_SECRET_KEY: jwtSecretKey,
        KRESCO_AUTH_LOGIN_RATE_LIMIT: '30/minute',
        KRESCO_E2E_DATABASE_URL: e2eDatabaseUrl,
        KRESCO_ENV: 'development',
        MEDIA_STORAGE_BACKEND: 's3-mock',
        MEDIA_S3_BUCKET: 'kresco-e2e-media',
        MEDIA_S3_REGION: 'us-east-1',
        MEDIA_S3_PREFIX: 'e2e',
        MEDIA_S3_MOCK_ROOT: './e2e-s3',
      },
    },
    {
      command: `npm run start -- --hostname 127.0.0.1 --port ${frontendPort}`,
      url: frontendOrigin,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        ABLY_API_KEY: e2eAblyApiKey,
        KRESCO_ENV: 'development',
        KRESCO_ENABLE_LOCAL_REWRITES: 'true',
        KRESCO_LOCAL_BACKEND_ORIGIN: backendOrigin,
        JWT_SECRET_KEY: jwtSecretKey,
        NEXT_PUBLIC_REALTIME_PROVIDER: process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? 'off',
        NEXT_PUBLIC_ABLY_ENABLED: process.env.NEXT_PUBLIC_ABLY_ENABLED ?? 'false',
        NEXT_PUBLIC_API_BASE_URL: '/api/',
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
