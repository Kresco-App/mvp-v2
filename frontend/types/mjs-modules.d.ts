declare module '*.mjs' {
  const defaultExport: any
  export default defaultExport

  export const optimizePackageImports: string[]
  export function shouldEnableLocalRewrites(nodeEnv?: string, localRewriteFlag?: string): boolean
  export function shouldEnableBackendRewrites(value?: string): boolean
  export function buildImageRemotePatterns(nodeEnv?: string): Array<{ protocol: 'http' | 'https'; hostname: string }>

  export const REQUIRED_FRONTEND_PRODUCTION_ENV: string[]
  export function validateFrontendProductionEnv(env: Record<string, string | undefined>): string[]
  export function parseEnvFile(contents: string): Record<string, string>
}
