import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import nextConfig, {
  optimizePackageImports,
} from '../next.config.mjs'
import {
  buildImageRemotePatterns,
  shouldEnableBackendRewrites,
  shouldEnableLocalRewrites,
} from '../next.config.mjs'

const FRONTEND_ROOT = fileURLToPath(new URL('..', import.meta.url))
type HeaderEntry = { key: string; value: string }
type HeaderRule = { headers?: HeaderEntry[] }
type RewriteRule = { source: string; destination: string }

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

  it('allows production backend rewrites only for non-local HTTPS origins', () => {
    expect(shouldEnableBackendRewrites('https://api.example.com/staging')).toBe(true)
    expect(shouldEnableBackendRewrites('http://api.example.com')).toBe(false)
    expect(shouldEnableBackendRewrites('https://localhost:8000')).toBe(false)
    expect(shouldEnableBackendRewrites('https://127.0.0.1:8000')).toBe(false)
    expect(shouldEnableBackendRewrites('https://kresco.ngrok.app')).toBe(false)
    expect(shouldEnableBackendRewrites('not-a-url')).toBe(false)
  })

  it('does not emit HTTPS localhost backend rewrites in production', async () => {
    await expect(configuredRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'production',
      KRESCO_ENABLE_LOCAL_REWRITES: undefined,
      KRESCO_LOCAL_BACKEND_ORIGIN: undefined,
      KRESCO_BACKEND_ORIGIN: 'https://localhost:8000',
    })).resolves.toEqual([])
  })

  it('does not emit localhost rewrites for production-marked builds even when local flags are present', async () => {
    await expect(configuredRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'production',
      KRESCO_ENABLE_LOCAL_REWRITES: 'true',
      KRESCO_LOCAL_BACKEND_ORIGIN: 'http://127.0.0.1:8000',
      KRESCO_BACKEND_ORIGIN: undefined,
    })).resolves.toEqual([])
  })

  it('emits localhost rewrites only for development-marked integration builds', async () => {
    await expect(configuredRewritesWithEnv({
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
    await expect(configuredRewritesWithEnv({
      NODE_ENV: 'production',
      KRESCO_ENV: 'production',
      KRESCO_ENABLE_LOCAL_REWRITES: 'true',
      KRESCO_LOCAL_BACKEND_ORIGIN: 'http://127.0.0.1:8000',
      KRESCO_BACKEND_ORIGIN: 'https://api.kresco.example/backend/',
    })).resolves.toEqual([
      { source: '/api/:path*', destination: 'https://api.kresco.example/backend/api/:path*' },
      { source: '/media/:path*', destination: 'https://api.kresco.example/backend/media/:path*' },
    ])
  })

  it('keeps the strict CSP in proxy.ts instead of emitting a weaker global next.config header', async () => {
    const headers = await configuredHeaders()

    expect(headers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Content-Security-Policy' }),
    ]))
    expect(headers).toEqual(expect.arrayContaining([
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ]))
  })

  it('keeps the root layout request-bound so strict CSP nonces hydrate pages', () => {
    const source = readFileSync(join(FRONTEND_ROOT, 'app', 'layout.tsx'), 'utf8')

    expect(source).toContain("from 'next/headers'")
    expect(source).toContain('await headers()')
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
