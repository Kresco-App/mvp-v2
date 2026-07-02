import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import nextConfig, {
  localDevOrigins,
  optimizePackageImports,
} from '../next.config.mjs'
import {
  buildImageRemotePatterns,
  buildSecurityHeaders,
  shouldEnableBackendRewrites,
  shouldEnableLocalRewrites,
} from '../next.config.mjs'

const FRONTEND_ROOT = fileURLToPath(new URL('..', import.meta.url))
type HeaderEntry = { key: string; value: string }
type HeaderRule = { headers?: HeaderEntry[] }
type RewriteCondition = { type: string; key: string; value: string }
type RewriteRule = { source: string; destination: string; has?: RewriteCondition[] }
const SENTRY_MONITORING_SOURCE = '/monitoring(/?)'
const expectedSentryMonitoringRewrites: RewriteRule[] = [
  {
    source: SENTRY_MONITORING_SOURCE,
    destination: 'https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/?hsts=0',
    has: [
      { type: 'query', key: 'o', value: '(?<orgid>\\d*)' },
      { type: 'query', key: 'p', value: '(?<projectid>\\d*)' },
      { type: 'query', key: 'r', value: '(?<region>[a-z]{2})' },
    ],
  },
  {
    source: SENTRY_MONITORING_SOURCE,
    destination: 'https://o:orgid.ingest.sentry.io/api/:projectid/envelope/?hsts=0',
    has: [
      { type: 'query', key: 'o', value: '(?<orgid>\\d*)' },
      { type: 'query', key: 'p', value: '(?<projectid>\\d*)' },
    ],
  },
]

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    if (entry === 'node_modules' || entry === '.next') return []
    if (statSync(fullPath).isDirectory()) return sourceFilesUnder(fullPath)
    return /\.(t|j)sx?$/.test(entry) ? [fullPath] : []
  })
}

async function configuredHeaders() {
  const rules = await nextConfig.headers?.() as HeaderRule[] | undefined
  return (rules ?? []).flatMap((rule: HeaderRule) => rule.headers ?? [])
}

async function configuredRewritesWithEnv(env: Record<string, string | undefined>) {
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  )

  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    return await nextConfig.rewrites?.() as RewriteRule[] | undefined
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

function backendRewrites(rewrites: RewriteRule[] | undefined) {
  return (rewrites ?? []).filter((rewrite) => rewrite.source !== SENTRY_MONITORING_SOURCE)
}

function sentryMonitoringRewrites(rewrites: RewriteRule[] | undefined) {
  return (rewrites ?? []).filter((rewrite) => rewrite.source === SENTRY_MONITORING_SOURCE)
}

async function configuredBackendRewritesWithEnv(env: Record<string, string | undefined>) {
  return backendRewrites(await configuredRewritesWithEnv(env))
}

describe('Next production config boundaries', () => {
  it('does not whitelist localhost image optimization targets in production builds', () => {
    expect(buildImageRemotePatterns('production')).toEqual([
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: '*.ytimg.com' },
    ])
  })

  it('keeps localhost image targets available only outside production builds', () => {
    expect(buildImageRemotePatterns('development')).toEqual(expect.arrayContaining([
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
    ]))
  })

  it('enables local API rewrites only for non-production or development-marked integration builds', () => {
    const previousKrescoEnv = process.env.KRESCO_ENV
    try {
      process.env.KRESCO_ENV = 'production'
      expect(shouldEnableLocalRewrites('production', 'true')).toBe(false)
      expect(shouldEnableLocalRewrites('production', undefined)).toBe(false)

      process.env.KRESCO_ENV = 'development'
      expect(shouldEnableLocalRewrites('production', 'true')).toBe(true)
      expect(shouldEnableLocalRewrites('development', 'true')).toBe(true)
      expect(shouldEnableLocalRewrites('development', 'false')).toBe(false)
    } finally {
      if (previousKrescoEnv === undefined) {
        delete process.env.KRESCO_ENV
      } else {
        process.env.KRESCO_ENV = previousKrescoEnv
      }
    }
  })

  it('keeps the local env example on same-origin API rewrites for subdomain auth', () => {
    const envExample = readFileSync(join(FRONTEND_ROOT, '.env.example'), 'utf8')

    expect(envExample).toContain('NEXT_PUBLIC_API_BASE_URL=/api/')
    expect(envExample).toContain('KRESCO_LOCAL_BACKEND_ORIGIN=http://127.0.0.1:8000')
    expect(envExample).toContain('NEXT_PUBLIC_SITE_URL=http://kresco.test:3000')
    expect(envExample).toContain('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=kresco.test')
    expect(envExample).toContain('http://kresco.lvh.me:3000')
    expect(envExample).not.toContain('NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api')
  })

  it('allows documented local subdomains to load Next dev assets and HMR', () => {
    expect(localDevOrigins).toEqual(expect.arrayContaining([
      'kresco.lvh.me',
      '*.kresco.lvh.me',
      'kresco.test',
      '*.kresco.test',
    ]))
    expect(nextConfig.allowedDevOrigins).toBe(localDevOrigins)
  })

  it('allows production backend rewrites only for non-local HTTPS origins', () => {
    expect(shouldEnableBackendRewrites('https://api.example.com')).toBe(true)
    expect(shouldEnableBackendRewrites('http://api.example.com')).toBe(false)
    expect(shouldEnableBackendRewrites('https://api.example.com/backend')).toBe(false)
    expect(shouldEnableBackendRewrites('https://api.example.com?target=backend')).toBe(false)
    expect(shouldEnableBackendRewrites('https://localhost:8000')).toBe(false)
    expect(shouldEnableBackendRewrites('https://127.0.0.1:8000')).toBe(false)
    expect(shouldEnableBackendRewrites('https://kresco.ngrok.app')).toBe(false)
    expect(shouldEnableBackendRewrites('not-a-url')).toBe(false)
  })

  it('does not emit HTTPS localhost backend rewrites in production', async () => {
    await expect(configuredBackendRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'production',
      KRESCO_ENABLE_LOCAL_REWRITES: undefined,
      KRESCO_LOCAL_BACKEND_ORIGIN: undefined,
      KRESCO_BACKEND_ORIGIN: 'https://localhost:8000',
    })).resolves.toEqual([])
  })

  it('does not emit localhost rewrites for production-marked builds even when local flags are present', async () => {
    await expect(configuredBackendRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'production',
      KRESCO_ENABLE_LOCAL_REWRITES: 'true',
      KRESCO_LOCAL_BACKEND_ORIGIN: 'http://127.0.0.1:8000',
      KRESCO_BACKEND_ORIGIN: undefined,
    })).resolves.toEqual([])
  })

  it('emits localhost rewrites only for development-marked integration builds', async () => {
    await expect(configuredBackendRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'development',
      KRESCO_ENABLE_LOCAL_REWRITES: 'true',
      KRESCO_LOCAL_BACKEND_ORIGIN: 'http://127.0.0.1:8010/',
      KRESCO_BACKEND_ORIGIN: undefined,
    })).resolves.toEqual([
      { source: '/api/:path*', destination: 'http://127.0.0.1:8010/api/:path*' },
      { source: '/media/:path*', destination: 'http://127.0.0.1:8010/media/:path*' },
    ])
  })

  it('prefers explicit HTTPS backend rewrites over local integration origins', async () => {
    await expect(configuredBackendRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'production',
      KRESCO_ENABLE_LOCAL_REWRITES: 'true',
      KRESCO_LOCAL_BACKEND_ORIGIN: 'http://127.0.0.1:8000',
      KRESCO_BACKEND_ORIGIN: 'https://api.kresco.example/',
    })).resolves.toEqual([
      { source: '/api/:path*', destination: 'https://api.kresco.example/api/:path*' },
      { source: '/media/:path*', destination: 'https://api.kresco.example/media/:path*' },
    ])
  })

  it('keeps Sentry monitoring tunnel rewrites isolated from backend rewrites', async () => {
    const rewrites = await configuredRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'production',
      KRESCO_ENABLE_LOCAL_REWRITES: undefined,
      KRESCO_LOCAL_BACKEND_ORIGIN: undefined,
      KRESCO_BACKEND_ORIGIN: undefined,
    })

    expect(sentryMonitoringRewrites(rewrites)).toEqual(expectedSentryMonitoringRewrites)
    expect(backendRewrites(rewrites)).toEqual([])
  })

  it('keeps the strict CSP in proxy.ts instead of emitting a weaker global next.config header', async () => {
    const headers = await configuredHeaders()

    expect(headers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Content-Security-Policy' }),
    ]))
    expect(headers).toEqual(expect.arrayContaining([
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      { key: 'Origin-Agent-Cluster', value: '?1' },
      { key: 'X-Download-Options', value: 'noopen' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      { key: 'X-XSS-Protection', value: '0' },
    ]))
  })

  it('adds conservative HSTS only for production header configs', () => {
    expect(buildSecurityHeaders('test')).not.toEqual(expect.arrayContaining([
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ]))
    expect(buildSecurityHeaders('production')).toEqual(expect.arrayContaining([
      { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    ]))
  })

  it('opts into HSTS includeSubDomains only when explicitly enabled', () => {
    const previousValue = process.env.KRESCO_HSTS_INCLUDE_SUBDOMAINS
    process.env.KRESCO_HSTS_INCLUDE_SUBDOMAINS = 'true'
    try {
      expect(buildSecurityHeaders('production')).toEqual(expect.arrayContaining([
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ]))
    } finally {
      if (previousValue === undefined) {
        delete process.env.KRESCO_HSTS_INCLUDE_SUBDOMAINS
      } else {
        process.env.KRESCO_HSTS_INCLUDE_SUBDOMAINS = previousValue
      }
    }
  })

  it('keeps the root layout request-bound so strict CSP nonces hydrate pages', () => {
    const source = readFileSync(join(FRONTEND_ROOT, 'app', 'layout.tsx'), 'utf8')

    expect(source).toContain("from 'next/headers'")
    expect(source).toContain('await headers()')
  })

  it('keeps dynamic page segments warm in the client router cache for return navigation', () => {
    expect(nextConfig.experimental?.staleTimes).toEqual({
      dynamic: 60,
      static: 300,
    })
  })

  it('keeps heavy visualization and icon imports modular', () => {
    const packageJson = JSON.parse(readFileSync(join(FRONTEND_ROOT, 'package.json'), 'utf8'))

    expect(packageJson.dependencies).not.toHaveProperty('d3')
    expect(packageJson.devDependencies).not.toHaveProperty('@types/d3')
    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      'd3-array': expect.any(String),
      'd3-ease': expect.any(String),
      'd3-scale': expect.any(String),
      'd3-selection': expect.any(String),
      'd3-transition': expect.any(String),
    }))
    expect(optimizePackageImports).toContain('lucide-react')
    expect(nextConfig.experimental?.optimizePackageImports).toContain('lucide-react')

    const barrelD3Imports = sourceFilesUnder(FRONTEND_ROOT).filter((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return /from ['"]d3['"]|import \* as d3 from ['"]d3['"]|require\(['"]d3['"]\)/.test(source)
    })
    expect(barrelD3Imports).toEqual([])
  })
})
