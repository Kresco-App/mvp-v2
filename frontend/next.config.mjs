import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const emptyCanvasModule = path.join(__dirname, 'lib/empty-canvas.cjs')
const localBackendOrigin = process.env.KRESCO_LOCAL_BACKEND_ORIGIN ?? 'http://127.0.0.1:8000'
const enableLocalRewrites = process.env.NODE_ENV !== 'production' || process.env.KRESCO_ENABLE_LOCAL_REWRITES === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
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
