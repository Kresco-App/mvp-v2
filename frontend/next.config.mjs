import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const emptyCanvasModule = path.join(__dirname, 'lib/empty-canvas.cjs')
export const optimizePackageImports = ['lucide-react', 'framer-motion', 'recharts']

const productionImageRemotePatterns = [
  { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
  { protocol: 'https', hostname: '*.googleusercontent.com' },
  { protocol: 'https', hostname: 'images.unsplash.com' },
  { protocol: 'https', hostname: 'i.ytimg.com' },
  { protocol: 'https', hostname: '*.ytimg.com' },
]

const localImageRemotePatterns = [
  { protocol: 'http', hostname: '127.0.0.1' },
  { protocol: 'http', hostname: 'localhost' },
]

const LOCAL_HOST_PATTERN = /(^|\.)localhost$|^127\.|^\[?::1\]?$/
const LOCAL_OR_TUNNEL_PATTERN = /localhost|127\.0\.0\.1|\[::1\]|ngrok/i

export function shouldEnableLocalRewrites(
  nodeEnv = process.env.NODE_ENV,
  localRewriteFlag = process.env.KRESCO_ENABLE_LOCAL_REWRITES,
  krescoEnv = process.env.KRESCO_ENV,
) {
  if (nodeEnv === 'production' && krescoEnv !== 'development') return false
  if (localRewriteFlag === 'true') return true
  return nodeEnv !== 'production' && localRewriteFlag !== 'false'
}

export function shouldEnableBackendRewrites(value = process.env.KRESCO_BACKEND_ORIGIN) {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:'
      && parsed.pathname.replace(/\/+$/, '') === ''
      && parsed.search === ''
      && parsed.hash === ''
      && !LOCAL_HOST_PATTERN.test(parsed.hostname)
      && !LOCAL_OR_TUNNEL_PATTERN.test(value)
  } catch {
    return false
  }
}

export function buildImageRemotePatterns(nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv === 'production') return productionImageRemotePatterns
  return [...productionImageRemotePatterns, ...localImageRemotePatterns]
}

export function buildSecurityHeaders(
  nodeEnv = process.env.NODE_ENV,
  hstsIncludeSubdomains = process.env.KRESCO_HSTS_INCLUDE_SUBDOMAINS,
) {
  const hstsValue = hstsIncludeSubdomains === 'true' ? 'max-age=31536000; includeSubDomains' : 'max-age=31536000'
  return [
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
    ...(nodeEnv === 'production'
      ? [{ key: 'Strict-Transport-Security', value: hstsValue }]
      : []),
  ]
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    optimizePackageImports,
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
    sri: {
      algorithm: 'sha256',
    },
  },
  images: {
    remotePatterns: buildImageRemotePatterns(),
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      canvas: emptyCanvasModule,
    },
  },
  async headers() {
    return [{ source: '/(.*)', headers: buildSecurityHeaders() }]
  },
  async rewrites() {
    const localBackendOrigin = process.env.KRESCO_LOCAL_BACKEND_ORIGIN ?? 'http://127.0.0.1:8000'
    const backendOrigin = process.env.KRESCO_BACKEND_ORIGIN ?? ''
    const enableLocalRewrites = shouldEnableLocalRewrites(
      process.env.NODE_ENV,
      process.env.KRESCO_ENABLE_LOCAL_REWRITES,
      process.env.KRESCO_ENV,
    )
    const enableBackendRewrites = shouldEnableBackendRewrites(backendOrigin)

    if (!enableBackendRewrites && !enableLocalRewrites) return []
    const rewriteOrigin = (enableBackendRewrites ? backendOrigin : localBackendOrigin).replace(/\/+$/, '')

    return [
      {
        source: '/api/:path*',
        destination: `${rewriteOrigin}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${rewriteOrigin}/media/:path*`,
      },
    ]
  },
  webpack: (config) => {
    config.resolve.alias.canvas = emptyCanvasModule
    return config
  },
}

export default nextConfig
