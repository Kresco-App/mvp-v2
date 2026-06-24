import type { NextConfig } from 'next'

export type ImageRemotePattern = {
  protocol: 'http' | 'https'
  hostname: string
}

export type SecurityHeader = {
  key: string
  value: string
}

export declare const optimizePackageImports: string[]
export declare function shouldEnableLocalRewrites(nodeEnv?: string, localRewriteFlag?: string, krescoEnv?: string): boolean
export declare function shouldEnableBackendRewrites(value?: string): boolean
export declare function buildImageRemotePatterns(nodeEnv?: string): ImageRemotePattern[]
export declare function buildSecurityHeaders(nodeEnv?: string): SecurityHeader[]

declare const nextConfig: NextConfig
export default nextConfig
