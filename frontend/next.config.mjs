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
  } catch {
    return false
  }
}

export function buildImageRemotePatterns(nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv === 'production') return productionImageRemotePatterns
  return [...productionImageRemotePatterns, ...localImageRemotePatterns]
}

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    optimizePackageImports,
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
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }]
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
