import { describe, expect, it } from 'vitest'

import { parseEnvFile, validateFrontendProductionEnv } from '@/lib/productionEnv.mjs'

const VALID_PRODUCTION_ENV = {
  NEXT_PUBLIC_API_BASE_URL: 'https://api.kresco.example/api',
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
  NEXT_PUBLIC_ABLY_ENABLED: 'true',
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

  it('parses quoted env files without exposing values in validation code', () => {
    expect(parseEnvFile([
      '# pulled by Vercel',
      'NEXT_PUBLIC_API_BASE_URL="https://api.kresco.example/api"',
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID='google-client-id.apps.googleusercontent.com'",
      'NEXT_PUBLIC_ABLY_ENABLED=true',
    ].join('\n'))).toEqual(VALID_PRODUCTION_ENV)
  })
})
