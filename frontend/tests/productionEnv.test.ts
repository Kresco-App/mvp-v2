import { describe, expect, it } from 'vitest'

import { parseEnvFile, validateFrontendProductionEnv } from '@/lib/productionEnv.mjs'

const VALID_PRODUCTION_ENV = {
  NEXT_PUBLIC_API_BASE_URL: 'https://api.kresco.example/api',
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
  NEXT_PUBLIC_ABLY_ENABLED: 'true',
  NEXT_PUBLIC_RELEASE_SHA: '0123456789abcdef0123456789abcdef01234567',
  JWT_SECRET_KEY: 'production-jwt-secret-shared-with-backend-32-bytes',
}

describe('frontend production environment validation', () => {
  it('accepts the required production public configuration', () => {
    expect(validateFrontendProductionEnv(VALID_PRODUCTION_ENV)).toEqual([])
  })

  it('requires all production frontend variables that power visible features', () => {
    const errors = validateFrontendProductionEnv({})

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('NEXT_PUBLIC_API_BASE_URL'),
      expect.stringContaining('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
      expect.stringContaining('NEXT_PUBLIC_ABLY_ENABLED'),
      expect.stringContaining('NEXT_PUBLIC_RELEASE_SHA'),
      expect.stringContaining('JWT_SECRET_KEY'),
    ]))
  })

  it('rejects local, relative, and non-HTTPS backend API URLs in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: '/api/',
    })).toContain('NEXT_PUBLIC_API_BASE_URL must be an absolute HTTPS URL in production.')

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8000/api',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_API_BASE_URL must use HTTPS in production.',
      'NEXT_PUBLIC_API_BASE_URL must not point to localhost or tunnel origins in production.',
    ]))
  })

  it('rejects API URLs that omit the backend api path', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: 'https://api.kresco.example',
    })).toContain('NEXT_PUBLIC_API_BASE_URL must include the backend /api path.')
  })

  it('requires realtime to be explicitly enabled in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_ABLY_ENABLED: 'false',
    })).toContain('NEXT_PUBLIC_ABLY_ENABLED must be true in production.')
  })

  it('rejects local rewrite overrides in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      KRESCO_ENABLE_LOCAL_REWRITES: 'true',
      KRESCO_LOCAL_BACKEND_ORIGIN: 'http://127.0.0.1:8000',
    })).toEqual(expect.arrayContaining([
      'KRESCO_ENABLE_LOCAL_REWRITES must not be true in production frontend deployments.',
      'KRESCO_LOCAL_BACKEND_ORIGIN must not point to localhost or tunnel origins in production.',
    ]))
  })

  it('requires the server-side JWT secret for proxy route authorization', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      JWT_SECRET_KEY: 'change-me',
    })).toContain('JWT_SECRET_KEY must match the backend JWT secret and be at least 32 characters.')

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      JWT_SECRET_KEY: 'too-short',
    })).toContain('JWT_SECRET_KEY must match the backend JWT secret and be at least 32 characters.')
  })

  it('requires a concrete release identifier for production correlation', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_RELEASE_SHA: 'unknown',
    })).toContain('NEXT_PUBLIC_RELEASE_SHA must identify the deployed commit or build.')

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_RELEASE_SHA: '123456',
    })).toContain('NEXT_PUBLIC_RELEASE_SHA must identify the deployed commit or build.')
  })

  it('rejects local demo media feature flags in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO: 'true',
      KRESCO_ENABLE_LOCAL_IMAGE_HOSTS: 'true',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO must not be true in production frontend deployments.',
      'KRESCO_ENABLE_LOCAL_IMAGE_HOSTS must not be true in production frontend deployments.',
    ]))
  })

  it('parses quoted env files without exposing values in validation code', () => {
    expect(parseEnvFile([
      '# pulled by Vercel',
      'NEXT_PUBLIC_API_BASE_URL="https://api.kresco.example/api"',
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID='google-client-id.apps.googleusercontent.com'",
      'NEXT_PUBLIC_ABLY_ENABLED=true',
      'NEXT_PUBLIC_RELEASE_SHA=0123456789abcdef0123456789abcdef01234567',
      'JWT_SECRET_KEY=production-jwt-secret-shared-with-backend-32-bytes',
    ].join('\n'))).toEqual(VALID_PRODUCTION_ENV)
  })
})
