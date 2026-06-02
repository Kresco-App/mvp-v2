import type { NextConfig } from 'next'

export type ImageRemotePattern = {
  protocol: 'http' | 'https'
  hostname: string
}

export declare const optimizePackageImports: string[]
export declare function shouldEnableLocalRewrites(nodeEnv?: string, localRewriteFlag?: string): boolean
export declare function shouldEnableBackendRewrites(value?: string): boolean
export declare function buildImageRemotePatterns(nodeEnv?: string): ImageRemotePattern[]

declare const nextConfig: NextConfig
export default nextConfig
