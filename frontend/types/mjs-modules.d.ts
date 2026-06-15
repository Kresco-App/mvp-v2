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

  export const DEFAULT_ROUTES: readonly string[]
  export const BASE_URL_ENV_KEYS: readonly string[]
  export const DISALLOWED_SURFACE_RULES: readonly {
    id: string
    description: string
    pattern: RegExp
  }[]
  export function parseProductionDemoSurfaceArgs(
    argv?: string[],
    env?: Record<string, string | undefined>,
  ): {
    ok: boolean
    errors: string[]
    config: {
      baseUrl: URL
      routes: string[]
      json: boolean
      timeoutMs: number
      maxReferences: number
    } | null
  }
  export function runProductionDemoSurfaceCheck(options?: {
    baseUrl?: URL | string
    routes?: readonly string[]
    fetchImpl?: (input: string, init?: RequestInit) => Promise<any>
    timeoutMs?: number
    maxReferences?: number
  }): Promise<any>
  export function scanTextForDisallowedSurface(text: unknown, source: {
    source: string
    route: string
    kind: string
  }): any[]
  export function collectSameOriginTextReferences(html: unknown, pageUrl: URL, baseUrl: URL): URL[]
  export function main(options?: {
    argv?: string[]
    env?: Record<string, string | undefined>
    fetchImpl?: (input: string, init?: RequestInit) => Promise<any>
    stdout?: Pick<NodeJS.WriteStream, 'write'>
    stderr?: Pick<NodeJS.WriteStream, 'write'>
  }): Promise<number>
}
