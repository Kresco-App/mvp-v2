import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_ROUTES,
  collectSameOriginTextReferences,
  main,
  parseProductionDemoSurfaceArgs,
  runProductionDemoSurfaceCheck,
} from '../scripts/check-production-demo-surface.mjs'

type ResponseOptions = {
  status?: number
  contentType?: string
  url?: string
}

function textResponse(body: string, options: ResponseOptions = {}) {
  const status = options.status ?? 200
  const contentType = options.contentType ?? 'text/html; charset=utf-8'

  return {
    status,
    ok: status >= 200 && status < 300,
    url: options.url,
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'content-type' ? contentType : null
      },
    },
    text: vi.fn(async () => body),
  }
}

function sink() {
  let output = ''
  return {
    write: vi.fn((chunk: string) => {
      output += String(chunk)
      return true
    }),
    get output() {
      return output
    },
  }
}

describe('production demo surface scanner', () => {
  it('requires an explicit production base URL and rejects local origins', () => {
    const missing = parseProductionDemoSurfaceArgs([], {})
    expect(missing.ok).toBe(false)
    expect(missing.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('A production base URL is required'),
    ]))

    const local = parseProductionDemoSurfaceArgs(['--base-url', 'http://localhost:3000'], {})
    expect(local.ok).toBe(false)
    expect(local.errors).toEqual(expect.arrayContaining([
      'Production base URL must use HTTPS.',
      'Production base URL must not point to localhost, loopback, or local tunnel hosts.',
    ]))

    const fromEnv = parseProductionDemoSurfaceArgs(['--json'], {
      KRESCO_PRODUCTION_BASE_URL: 'https://kresco.example',
    })
    expect(fromEnv.ok).toBe(true)
    expect(fromEnv.config?.json).toBe(true)
    expect(fromEnv.config?.routes).toEqual(DEFAULT_ROUTES)
    expect(fromEnv.config?.baseUrl.toString()).toBe('https://kresco.example/')
  })

  it('collects only same-origin text references from HTML', () => {
    const references = collectSameOriginTextReferences(`
      <script src="/_next/static/chunks/app.js"></script>
      <link rel="stylesheet" href="/_next/static/css/app.css">
      <img src="/media/avatar.png">
      <script src="https://cdn.example.invalid/app.js"></script>
      <img srcset="/_next/static/chunks/ignored.png 1x, /_next/static/chunks/app.mjs 2x">
    `, new URL('https://kresco.example/'), new URL('https://kresco.example/'))

    expect(references.map((url) => url.toString())).toEqual([
      'https://kresco.example/_next/static/chunks/app.js',
      'https://kresco.example/_next/static/css/app.css',
      'https://kresco.example/_next/static/chunks/app.mjs',
    ])
  })

  it('fetches pages and same-origin text assets without credentials', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET')
      expect(init?.credentials).toBe('omit')
      expect(JSON.stringify(init?.headers)).not.toContain('Cookie')

      if (url === 'https://kresco.example/') {
        return textResponse('<html><script src="/_next/static/chunks/app.js"></script></html>', { url })
      }

      if (url === 'https://kresco.example/_next/static/chunks/app.js') {
        return textResponse('console.log("Kresco production")', {
          url,
          contentType: 'application/javascript',
        })
      }

      throw new Error(`Unexpected URL ${url}`)
    })

    const result = await runProductionDemoSurfaceCheck({
      baseUrl: new URL('https://kresco.example'),
      routes: ['/'],
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.counts.routesFetched).toBe(1)
    expect(result.counts.referencesFetched).toBe(1)
    expect(result.findings).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('fails when referenced text contains known mock VdoCipher placeholders', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://kresco.example/home') {
        return textResponse('<script src="/_next/static/chunks/video.js"></script>', { url })
      }

      if (url === 'https://kresco.example/_next/static/chunks/video.js') {
        return textResponse('const stream = { otp: "mock-otp-token" }', {
          url,
          contentType: 'application/javascript',
        })
      }

      throw new Error(`Unexpected URL ${url}`)
    })

    const result = await runProductionDemoSurfaceCheck({
      baseUrl: new URL('https://kresco.example'),
      routes: ['/home'],
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: 'reference',
        route: '/home',
        ruleId: 'mock-vdocipher-otp',
        source: 'https://kresco.example/_next/static/chunks/video.js',
      }),
    ])
    expect(JSON.stringify(result)).not.toContain('const stream')
  })

  it('detects French demo video fallback text without storing non-ASCII source text', async () => {
    const fetchImpl = vi.fn(async (url: string) => textResponse(
      'Lecteur vid\u00e9o de d\u00e9mo',
      { url },
    ))

    const result = await runProductionDemoSurfaceCheck({
      baseUrl: new URL('https://kresco.example'),
      routes: ['/home'],
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: 'html',
        route: '/home',
        ruleId: 'demo-video-surface',
      }),
    ])
  })

  it('supports JSON output without printing response bodies or secrets', async () => {
    const fetchImpl = vi.fn(async (url: string) => textResponse(`
      <a href="http://localhost:8000/media/avatar.png">Local demo login session_id=secret-cookie</a>
    `, { url }))
    const stdout = sink()
    const stderr = sink()

    const exitCode = await main({
      argv: ['--base-url', 'https://kresco.example', '--route', '/', '--json'],
      env: {},
      fetchImpl,
      stdout,
      stderr,
    })

    expect(exitCode).toBe(1)
    expect(stderr.output).toBe('')
    expect(stdout.output).toContain('"ok": false')
    expect(stdout.output).toContain('"ruleId": "demo-login-surface"')
    expect(stdout.output).toContain('"ruleId": "local-api-or-media-origin"')
    expect(stdout.output).not.toContain('session_id=secret-cookie')
  })
})
