import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const emptyCanvasModule = path.join(__dirname, 'lib/empty-canvas.cjs')
const localBackendOrigin = process.env.KRESCO_LOCAL_BACKEND_ORIGIN ?? 'http://127.0.0.1:8000'
const enableLocalRewrites = shouldEnableLocalRewrites(process.env.NODE_ENV, process.env.KRESCO_ENABLE_LOCAL_REWRITES)
export const optimizePackageImports = ['lucide-react']

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

export function shouldEnableLocalRewrites(nodeEnv = process.env.NODE_ENV, localRewriteFlag = process.env.KRESCO_ENABLE_LOCAL_REWRITES) {
  return nodeEnv !== 'production' && localRewriteFlag !== 'false'
}

export function buildImageRemotePatterns(nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv === 'production') return productionImageRemotePatterns
  return [...productionImageRemotePatterns, ...localImageRemotePatterns]
}

/** @type {import('next').NextConfig} */
const nextConfig = {
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
  async rewrites() {
    if (!enableLocalRewrites) return []

    return [
      {
        source: '/api/:path*',
        destination: `${localBackendOrigin}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${localBackendOrigin}/media/:path*`,
      },
    ]
  },
  webpack: (config) => {
    config.resolve.alias.canvas = emptyCanvasModule
    return config
  },
}

export default nextConfig
