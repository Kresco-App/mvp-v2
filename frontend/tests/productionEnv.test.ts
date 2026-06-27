import { describe, expect, it } from 'vitest'

import { parseEnvFile, validateFrontendProductionEnv } from '@/lib/productionEnv.mjs'

const VALID_PRODUCTION_ENV = {
  NEXT_PUBLIC_API_BASE_URL: '/api/',
  KRESCO_BACKEND_ORIGIN: 'https://api.kresco.ma',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'firebase-web-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'kresco-prod.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'kresco-prod',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:418905339056:web:5ff922f6917acc61c3b775',
  NEXT_PUBLIC_FIRESTORE_DATABASE: '(default)',
  NEXT_PUBLIC_REALTIME_PROVIDER: 'firestore',
  NEXT_PUBLIC_RELEASE_SHA: '0123456789abcdef0123456789abcdef01234567',
  NEXT_PUBLIC_SITE_URL: 'https://kresco.ma',
  NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: 'kresco.ma',
}

describe('frontend production environment validation', () => {
  it('accepts the required production public configuration', () => {
    expect(validateFrontendProductionEnv(VALID_PRODUCTION_ENV)).toEqual([])
  })

  it('requires all production frontend variables that power visible features', () => {
    const errors = validateFrontendProductionEnv({})

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('NEXT_PUBLIC_API_BASE_URL'),
      expect.stringContaining('NEXT_PUBLIC_FIREBASE_API_KEY'),
      expect.stringContaining('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
      expect.stringContaining('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
      expect.stringContaining('NEXT_PUBLIC_FIREBASE_APP_ID'),
      expect.stringContaining('NEXT_PUBLIC_REALTIME_PROVIDER'),
      expect.stringContaining('NEXT_PUBLIC_RELEASE_SHA'),
      expect.stringContaining('NEXT_PUBLIC_SITE_URL'),
      expect.stringContaining('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN'),
    ]))
  })

  it('rejects jq null sentinel strings before Docker can bake them into the frontend', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_FIREBASE_API_KEY: 'null',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'undefined',
      NEXT_PUBLIC_FIRESTORE_DATABASE: 'null',
      NEXT_PUBLIC_RELEASE_SHA: 'null',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_FIREBASE_API_KEY must be configured for production frontend deployments.',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID must be configured for production frontend deployments.',
      'NEXT_PUBLIC_RELEASE_SHA must be configured for production frontend deployments.',
      'NEXT_PUBLIC_FIRESTORE_DATABASE must be configured when NEXT_PUBLIC_REALTIME_PROVIDER is firestore.',
    ]))
  })

  it('rejects local, relative, and non-HTTPS backend API URLs in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: '/api/',
      KRESCO_BACKEND_ORIGIN: '',
    })).toContain('KRESCO_BACKEND_ORIGIN must be configured when NEXT_PUBLIC_API_BASE_URL is /api in production.')

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8000/api',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_API_BASE_URL must use HTTPS in production.',
      'NEXT_PUBLIC_API_BASE_URL must not point to localhost or tunnel origins in production.',
    ]))

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: '/api/',
      KRESCO_BACKEND_ORIGIN: 'https://api.kresco.ma/backend',
    })).toContain('KRESCO_BACKEND_ORIGIN must be an origin only, without a path, query, or hash.')
  })

  it('accepts same-origin API URLs when a production backend rewrite origin is configured', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: '/api/',
      KRESCO_BACKEND_ORIGIN: 'https://api.kresco.ma',
    })).toEqual([])
  })

  it('validates same-origin backend rewrites from the provided env object instead of process env', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: '/api/',
      KRESCO_BACKEND_ORIGIN: 'https://api.kresco.ma',
    })).not.toContain('KRESCO_BACKEND_ORIGIN must be configured when NEXT_PUBLIC_API_BASE_URL is /api in production.')
  })

  it('rejects backend rewrite origins outside the auth cookie domain', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: '/api/',
      KRESCO_BACKEND_ORIGIN: 'https://kresco-backend-staging-abc123-ew.a.run.app',
    })).toContain('KRESCO_BACKEND_ORIGIN must stay within NEXT_PUBLIC_AUTH_COOKIE_DOMAIN.')

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: 'https://kresco-backend-staging-abc123-ew.a.run.app/api',
    })).toContain('NEXT_PUBLIC_API_BASE_URL must stay within NEXT_PUBLIC_AUTH_COOKIE_DOMAIN.')
  })

  it('rejects API URLs that omit the backend api path', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: 'https://api.kresco.example',
    })).toContain('NEXT_PUBLIC_API_BASE_URL must include the backend /api path.')
  })

  it('requires a supported realtime provider in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_REALTIME_PROVIDER: 'off',
    })).toContain('NEXT_PUBLIC_REALTIME_PROVIDER must be firestore in production.')
  })

  it('requires Firestore database config for Firestore realtime', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_FIRESTORE_DATABASE: '',
    })).toContain('NEXT_PUBLIC_FIRESTORE_DATABASE must be configured when NEXT_PUBLIC_REALTIME_PROVIDER is firestore.')
  })

  it('rejects non-Firestore realtime providers in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_REALTIME_PROVIDER: 'websocket-vendor',
    })).toContain('NEXT_PUBLIC_REALTIME_PROVIDER must be firestore in production.')
  })

  it('rejects local or placeholder Firebase auth values in production', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'http://localhost:9099',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'placeholder',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be a hostname, not a URL.',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID must not use local or placeholder values in production.',
    ]))
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

  it('validates production subdomain auth metadata', () => {
    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: 'https://kresco.ma',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_SITE_URL must use HTTPS in production.',
      'NEXT_PUBLIC_SITE_URL must not point to localhost or tunnel origins in production.',
      'NEXT_PUBLIC_AUTH_COOKIE_DOMAIN must be a bare registrable domain such as kresco.ma.',
    ]))

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_SITE_URL: 'https://staging.kresco.ma',
      NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: 'staging.kresco.ma',
      KRESCO_BACKEND_ORIGIN: 'https://api.staging.kresco.ma',
    })).toEqual([])

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_SITE_URL: 'https://not-kresco.example',
    })).toContain('NEXT_PUBLIC_SITE_URL must stay within NEXT_PUBLIC_AUTH_COOKIE_DOMAIN.')

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_SITE_URL: 'https://kresco.lvh.me',
      NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: 'kresco.lvh.me',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_SITE_URL must not point to localhost or tunnel origins in production.',
      'NEXT_PUBLIC_AUTH_COOKIE_DOMAIN must not point to localhost or tunnel domains in production.',
    ]))

    expect(validateFrontendProductionEnv({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_SITE_URL: 'https://kresco.test',
      NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: 'kresco.test',
      KRESCO_BACKEND_ORIGIN: 'https://api.kresco.test',
    })).toEqual(expect.arrayContaining([
      'NEXT_PUBLIC_SITE_URL must not point to localhost or tunnel origins in production.',
      'NEXT_PUBLIC_AUTH_COOKIE_DOMAIN must not point to localhost or tunnel domains in production.',
      'KRESCO_BACKEND_ORIGIN must not point to localhost or tunnel origins in production.',
    ]))
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
      '# deployment environment',
      'NEXT_PUBLIC_API_BASE_URL="https://api.kresco.example/api"',
      'KRESCO_BACKEND_ORIGIN=https://api.kresco.ma',
      "NEXT_PUBLIC_FIREBASE_API_KEY='firebase-web-api-key'",
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=kresco-prod.firebaseapp.com',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID=kresco-prod',
      'NEXT_PUBLIC_FIREBASE_APP_ID=1:418905339056:web:5ff922f6917acc61c3b775',
      'NEXT_PUBLIC_FIRESTORE_DATABASE=(default)',
      'NEXT_PUBLIC_REALTIME_PROVIDER=firestore',
      'NEXT_PUBLIC_RELEASE_SHA=0123456789abcdef0123456789abcdef01234567',
      'NEXT_PUBLIC_SITE_URL=https://kresco.ma',
      'NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=kresco.ma',
    ].join('\n'))).toEqual({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_API_BASE_URL: 'https://api.kresco.example/api',
    })
  })
})
