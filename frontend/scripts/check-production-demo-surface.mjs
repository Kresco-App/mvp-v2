import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ROUTES = Object.freeze([
  '/',
  '/pricing',
  '/onboarding',
  '/auth/reset-password',
  '/auth/verify-email',
  '/professor/login',
  '/home',
  '/courses',
  '/calendar',
  '/exam-bank',
  '/live',
  '/professor',
  '/admin',
])

export const BASE_URL_ENV_KEYS = Object.freeze([
  'KRESCO_PRODUCTION_BASE_URL',
  'FRONTEND_PRODUCTION_BASE_URL',
  'PRODUCTION_BASE_URL',
])

const ROUTES_ENV_KEY = 'KRESCO_PRODUCTION_SURFACE_ROUTES'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_REFERENCES = 160

export const DISALLOWED_SURFACE_RULES = Object.freeze([
  {
    id: 'demo-login-surface',
    description: 'demo login surface text',
    pattern: /\b(?:local\s+demo\s+login|demo[-_\s]+login|student\+demo@example\.com|professor\+demo@example\.com)\b/i,
  },
  {
    id: 'demo-video-surface',
    description: 'demo video fallback text',
    pattern: /\b(?:lecteur\s+vid(?:e|\u00e9)o\s+de\s+d(?:e|\u00e9)mo|vrai\s+id\s+vid(?:e|\u00e9)o|local\s+demo\s+video|demo\s+video\s+stream)\b/i,
  },
  {
    id: 'mock-vdocipher-otp',
    description: 'mock VdoCipher OTP placeholder',
    pattern: /\bmock-otp-token\b/i,
  },
  {
    id: 'mock-vdocipher-playback',
    description: 'mock VdoCipher playback placeholder',
    pattern: /\bmock-playback(?:-info)?\b/i,
  },
  {
    id: 'mock-vdocipher-video-id',
    description: 'mock VdoCipher video id',
    pattern: /\bdemo-preview\b/i,
  },
  {
    id: 'mock-youtube-video-id',
    description: 'known mock YouTube video id',
    pattern: /\b(?:dQw4w9WgXcQ|M7lc1UVf-VE)\b/,
  },
  {
    id: 'local-api-or-media-origin',
    description: 'localhost API/media origin',
    pattern: /(?:https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)(?::\d+)?\/(?:api|media)\b|https?%3A%2F%2F(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|%5B%3A%3A1%5D)(?:%3A\d+)?%2F(?:api|media)\b)/i,
  },
  {
    id: 'local-tunnel-origin',
    description: 'local tunnel origin',
    pattern: /\b(?:ngrok(?:-free)?\.dev|ngrok\.io|localhost:\d{2,5}|127\.0\.0\.1:\d{2,5})\b/i,
  },
  {
    id: 'local-fallback-env-flag',
    description: 'local fallback feature flag',
    pattern: /\b(?:NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO|KRESCO_ENABLE_LOCAL_IMAGE_HOSTS|KRESCO_ENABLE_LOCAL_REWRITES|KRESCO_LOCAL_BACKEND_ORIGIN)\b/,
  },
])

export function parseProductionDemoSurfaceArgs(argv = [], env = process.env) {
  const errors = []
  const routes = []
  let baseUrlValue = ''
  let json = false
  let timeoutMs = DEFAULT_TIMEOUT_MS
  let maxReferences = DEFAULT_MAX_REFERENCES

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--json') {
      json = true
      continue
    }

    if (arg === '--base-url') {
      const value = argv[index + 1]
      index += 1
      if (!hasValue(value)) errors.push('--base-url requires a value.')
      else baseUrlValue = value
      continue
    }

    if (arg.startsWith('--base-url=')) {
      baseUrlValue = arg.slice('--base-url='.length)
      if (!hasValue(baseUrlValue)) errors.push('--base-url requires a value.')
      continue
    }

    if (arg === '--route') {
      const value = argv[index + 1]
      index += 1
      if (!hasValue(value)) errors.push('--route requires a value.')
      else routes.push(value)
      continue
    }

    if (arg.startsWith('--route=')) {
      const value = arg.slice('--route='.length)
      if (!hasValue(value)) errors.push('--route requires a value.')
      else routes.push(value)
      continue
    }

    if (arg === '--timeout-ms') {
      const value = argv[index + 1]
      index += 1
      timeoutMs = parsePositiveIntegerFlag('--timeout-ms', value, errors)
      continue
    }

    if (arg.startsWith('--timeout-ms=')) {
      timeoutMs = parsePositiveIntegerFlag('--timeout-ms', arg.slice('--timeout-ms='.length), errors)
      continue
    }

    if (arg === '--max-references') {
      const value = argv[index + 1]
      index += 1
      maxReferences = parsePositiveIntegerFlag('--max-references', value, errors)
      continue
    }

    if (arg.startsWith('--max-references=')) {
      maxReferences = parsePositiveIntegerFlag('--max-references', arg.slice('--max-references='.length), errors)
      continue
    }

    if (!arg.startsWith('-') && !baseUrlValue) {
      baseUrlValue = arg
      continue
    }

    errors.push(`Unknown argument: ${arg.startsWith('-') ? arg.split('=', 1)[0] : 'positional value'}`)
  }

  if (!baseUrlValue) {
    baseUrlValue = firstEnvValue(env, BASE_URL_ENV_KEYS)
  }

  if (routes.length === 0 && hasValue(env[ROUTES_ENV_KEY])) {
    routes.push(...String(env[ROUTES_ENV_KEY]).split(/[,\s]+/).filter(Boolean))
  }

  const base = normalizeProductionBaseUrl(baseUrlValue)
  if (!base.ok) errors.push(...base.errors)

  const normalizedRoutes = []
  const routeCandidates = routes.length > 0 ? routes : DEFAULT_ROUTES
  for (const route of routeCandidates) {
    const normalized = normalizeRoute(route)
    if (normalized.ok) {
      normalizedRoutes.push(normalized.route)
    } else {
      errors.push(...normalized.errors)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    config: errors.length === 0
      ? {
          baseUrl: base.url,
          routes: normalizedRoutes,
          json,
          timeoutMs,
          maxReferences,
        }
      : null,
  }
}

export async function runProductionDemoSurfaceCheck({
  baseUrl,
  routes = DEFAULT_ROUTES,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxReferences = DEFAULT_MAX_REFERENCES,
} = {}) {
  const startedAt = new Date().toISOString()
  const base = baseUrl instanceof URL ? baseUrl : normalizeProductionBaseUrl(String(baseUrl ?? '')).url
  const result = {
    ok: false,
    startedAt,
    baseUrl: base ? sanitizeUrlForOutput(base) : '',
    routes: [],
    counts: {
      routesFetched: 0,
      referencesFetched: 0,
      findings: 0,
      errors: 0,
    },
    pages: [],
    references: [],
    findings: [],
    errors: [],
  }

  if (!base) {
    result.errors.push({ source: 'configuration', message: 'A production base URL is required.' })
    finalizeResult(result)
    return result
  }

  if (typeof fetchImpl !== 'function') {
    result.errors.push({ source: 'configuration', message: 'A fetch implementation is required.' })
    finalizeResult(result)
    return result
  }

  const seenReferences = new Set()

  for (const routeValue of routes) {
    const normalizedRoute = normalizeRoute(routeValue)
    if (!normalizedRoute.ok) {
      for (const message of normalizedRoute.errors) {
        result.errors.push({ source: 'configuration', message })
      }
      continue
    }

    const route = normalizedRoute.route
    result.routes.push(route)

    const pageUrl = new URL(route, base)
    const pageSource = sanitizeUrlForOutput(pageUrl)
    let page
    try {
      page = await fetchTextResource(pageUrl, {
        fetchImpl,
        timeoutMs,
        purpose: 'page',
      })
    } catch (error) {
      result.errors.push({
        source: pageSource,
        route,
        message: safeFetchErrorMessage(error),
      })
      continue
    }

    result.counts.routesFetched += 1
    const pageSummary = {
      route,
      source: pageSource,
      finalUrl: sanitizeUrlForOutput(page.finalUrl),
      status: page.status,
      contentType: page.contentType,
      referencedTextAssets: [],
    }
    result.pages.push(pageSummary)

    if (!isAllowedPageStatus(page.status)) {
      result.errors.push({
        source: pageSource,
        route,
        message: `Unexpected HTTP status ${page.status}.`,
      })
    }

    if (!isSameOrigin(page.finalUrl, base)) {
      result.errors.push({
        source: pageSource,
        route,
        message: 'Route redirected outside the configured production origin.',
      })
      continue
    }

    result.findings.push(...scanTextForDisallowedSurface(page.body, {
      route,
      source: pageSource,
      kind: 'html',
    }))

    const references = collectSameOriginTextReferences(page.body, page.finalUrl, base)
    pageSummary.referencedTextAssets = references.map((reference) => sanitizeUrlForOutput(reference))

    for (const referenceUrl of references) {
      const referenceKey = referenceUrl.toString()
      if (seenReferences.has(referenceKey)) continue

      if (seenReferences.size >= maxReferences) {
        result.errors.push({
          source: sanitizeUrlForOutput(referenceUrl),
          route,
          message: `Referenced text asset limit exceeded; increase --max-references above ${maxReferences}.`,
        })
        continue
      }

      seenReferences.add(referenceKey)
      const referenceSource = sanitizeUrlForOutput(referenceUrl)
      let reference
      try {
        reference = await fetchTextResource(referenceUrl, {
          fetchImpl,
          timeoutMs,
          purpose: 'reference',
        })
      } catch (error) {
        result.errors.push({
          source: referenceSource,
          route,
          message: safeFetchErrorMessage(error),
        })
        continue
      }

      result.counts.referencesFetched += 1
      result.references.push({
        source: referenceSource,
        finalUrl: sanitizeUrlForOutput(reference.finalUrl),
        status: reference.status,
        contentType: reference.contentType,
      })

      if (!isSuccessfulStatus(reference.status)) {
        result.errors.push({
          source: referenceSource,
          route,
          message: `Referenced text asset returned HTTP status ${reference.status}.`,
        })
      }

      if (!isSameOrigin(reference.finalUrl, base)) {
        result.errors.push({
          source: referenceSource,
          route,
          message: 'Referenced text asset redirected outside the configured production origin.',
        })
        continue
      }

      result.findings.push(...scanTextForDisallowedSurface(reference.body, {
        route,
        source: referenceSource,
        kind: 'reference',
      }))
    }
  }

  finalizeResult(result)
  return result
}

export function scanTextForDisallowedSurface(text, source) {
  const findings = []
  const value = String(text ?? '')

  for (const rule of DISALLOWED_SURFACE_RULES) {
    if (!rule.pattern.test(value)) continue
    findings.push({
      ruleId: rule.id,
      description: rule.description,
      source: source.source,
      route: source.route,
      kind: source.kind,
    })
  }

  return findings
}

export function collectSameOriginTextReferences(html, pageUrl, baseUrl) {
  const references = new Map()
  const htmlText = String(html ?? '')
  const attributePattern = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  const srcSetPattern = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

  for (const match of htmlText.matchAll(attributePattern)) {
    addReferenceCandidate(match[1] ?? match[2] ?? match[3], pageUrl, baseUrl, references)
  }

  for (const match of htmlText.matchAll(srcSetPattern)) {
    const rawSrcSet = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? '')
    for (const candidate of rawSrcSet.split(',')) {
      addReferenceCandidate(candidate.trim().split(/\s+/, 1)[0], pageUrl, baseUrl, references)
    }
  }

  return [...references.values()]
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const parsed = parseProductionDemoSurfaceArgs(argv, env)

  if (!parsed.ok) {
    const failure = {
      ok: false,
      errors: parsed.errors.map((message) => ({ source: 'configuration', message })),
    }
    writeResult(failure, { json: argv.includes('--json'), stdout, stderr })
    return 1
  }

  const result = await runProductionDemoSurfaceCheck({
    ...parsed.config,
    fetchImpl,
  })
  writeResult(result, { json: parsed.config.json, stdout, stderr })
  return result.ok ? 0 : 1
}

function writeResult(result, { json, stdout, stderr }) {
  if (json) {
    writeLine(stdout, JSON.stringify(result, null, 2))
    return
  }

  if (result.ok) {
    writeLine(
      stdout,
      `Production demo surface scanner passed: ${result.counts.routesFetched} route(s), ${result.counts.referencesFetched} referenced text asset(s), no banned demo/mock/local strings.`,
    )
    return
  }

  writeLine(stderr, 'Production demo surface scanner failed.')
  for (const error of result.errors ?? []) {
    writeLine(stderr, `- error ${error.source}: ${error.message}`)
  }
  for (const finding of result.findings ?? []) {
    writeLine(stderr, `- finding ${finding.ruleId} in ${finding.kind} ${finding.source} (${finding.route})`)
  }
}

async function fetchTextResource(url, { fetchImpl, timeoutMs, purpose }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain,text/css,application/javascript,application/json,*/*;q=0.1',
        'User-Agent': 'kresco-production-demo-surface-scanner/1.0',
      },
      signal: controller.signal,
    })

    const status = Number(response?.status ?? 0)
    const contentType = headerValue(response?.headers, 'content-type')
    const finalUrl = new URL(response?.url || url.toString())
    const shouldReadBody = purpose === 'page' || isTextualContentType(contentType) || isLikelyTextReference(url)
    const body = shouldReadBody && typeof response?.text === 'function'
      ? await response.text()
      : ''

    return {
      body,
      contentType,
      finalUrl,
      status,
    }
  } finally {
    clearTimeout(timer)
  }
}

function addReferenceCandidate(rawValue, pageUrl, baseUrl, references) {
  const value = decodeHtmlAttribute(rawValue)
  if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('javascript:')) {
    return
  }

  let url
  try {
    url = new URL(value, pageUrl)
  } catch {
    return
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return
  if (!isSameOrigin(url, baseUrl)) return
  if (!isLikelyTextReference(url)) return

  url.hash = ''
  references.set(url.toString(), url)
}

function isLikelyTextReference(url) {
  const pathname = url.pathname.toLowerCase()
  if (pathname.startsWith('/api/') || pathname.startsWith('/media/')) return false
  if (pathname.startsWith('/_next/static/')) return /\.(?:js|mjs|css|json|txt|map)$/.test(pathname)
  return /\.(?:js|mjs|css|json|txt|html|xml|svg)$/.test(pathname)
}

function isTextualContentType(contentType) {
  const type = String(contentType ?? '').split(';', 1)[0].trim().toLowerCase()
  if (!type) return false
  if (type.startsWith('text/')) return true
  if (type.endsWith('+json') || type.endsWith('+xml')) return true
  return [
    'application/javascript',
    'application/json',
    'application/manifest+json',
    'application/x-javascript',
    'application/xml',
    'image/svg+xml',
  ].includes(type)
}

function headerValue(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') return headers.get(name) ?? headers.get(name.toLowerCase()) ?? ''
  return headers[name] ?? headers[name.toLowerCase()] ?? ''
}

function normalizeProductionBaseUrl(value) {
  const errors = []
  if (!hasValue(value)) {
    return {
      ok: false,
      errors: [`A production base URL is required. Pass --base-url or set one of: ${BASE_URL_ENV_KEYS.join(', ')}.`],
      url: null,
    }
  }

  let url
  try {
    url = new URL(String(value).trim())
  } catch {
    return {
      ok: false,
      errors: ['Production base URL must be a valid absolute URL.'],
      url: null,
    }
  }

  if (url.protocol !== 'https:') {
    errors.push('Production base URL must use HTTPS.')
  }
  if (url.username || url.password || url.search || url.hash) {
    errors.push('Production base URL must not include credentials, query strings, or fragments.')
  }
  if (url.pathname && url.pathname !== '/') {
    errors.push('Production base URL must be the production origin only, without an application path.')
  }
  if (isLocalHostname(url.hostname)) {
    errors.push('Production base URL must not point to localhost, loopback, or local tunnel hosts.')
  }

  url.pathname = '/'
  url.search = ''
  url.hash = ''

  return {
    ok: errors.length === 0,
    errors,
    url: errors.length === 0 ? url : null,
  }
}

function normalizeRoute(value) {
  const route = String(value ?? '').trim()
  const errors = []

  if (!route) {
    errors.push('Route values must not be empty.')
  } else if (!route.startsWith('/') || route.startsWith('//')) {
    errors.push('Route must be a root-relative path.')
  } else {
    const parsed = new URL(route, 'https://kresco.invalid')
    if (parsed.search || parsed.hash) {
      errors.push(`Route must not include query strings or fragments: ${parsed.pathname}`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    route,
  }
}

function parsePositiveIntegerFlag(name, value, errors) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${name} requires a positive integer.`)
    return name === '--timeout-ms' ? DEFAULT_TIMEOUT_MS : DEFAULT_MAX_REFERENCES
  }
  return parsed
}

function firstEnvValue(env, keys) {
  for (const key of keys) {
    if (hasValue(env[key])) return String(env[key])
  }
  return ''
}

function isAllowedPageStatus(status) {
  return isSuccessfulStatus(status) || status === 401 || status === 403
}

function isSuccessfulStatus(status) {
  return status >= 200 && status < 400
}

function isSameOrigin(url, baseUrl) {
  return url.origin === baseUrl.origin
}

function sanitizeUrlForOutput(value) {
  const url = value instanceof URL ? new URL(value.toString()) : new URL(String(value))
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.toString()
}

function safeFetchErrorMessage(error) {
  if (error?.name === 'AbortError') return 'Request timed out.'
  return 'Fetch failed.'
}

function decodeHtmlAttribute(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

function isLocalHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase().replace(/^\[|\]$/g, '')
  return (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized === '0.0.0.0'
    || normalized.startsWith('127.')
    || normalized.includes('ngrok')
  )
}

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function finalizeResult(result) {
  result.counts.findings = result.findings.length
  result.counts.errors = result.errors.length
  result.ok = result.findings.length === 0 && result.errors.length === 0
}

function writeLine(stream, line) {
  stream?.write?.(`${line}\n`)
}

const directRunPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
const modulePath = fileURLToPath(import.meta.url)

if (directRunPath && directRunPath === modulePath) {
  const exitCode = await main()
  process.exitCode = exitCode
}
