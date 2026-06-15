export declare const DEFAULT_ROUTES: readonly string[]

export declare const BASE_URL_ENV_KEYS: readonly string[]

export declare const DISALLOWED_SURFACE_RULES: readonly {
  id: string
  description: string
  pattern: RegExp
}[]

export declare function parseProductionDemoSurfaceArgs(
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

export declare function runProductionDemoSurfaceCheck(options?: {
  baseUrl?: URL | string
  routes?: readonly string[]
  fetchImpl?: (input: string, init?: RequestInit) => Promise<any>
  timeoutMs?: number
  maxReferences?: number
}): Promise<any>

export declare function scanTextForDisallowedSurface(text: unknown, source: {
  source: string
  route: string
  kind: string
}): any[]

export declare function collectSameOriginTextReferences(
  html: unknown,
  pageUrl: URL,
  baseUrl: URL,
): URL[]

export declare function main(options?: {
  argv?: string[]
  env?: Record<string, string | undefined>
  fetchImpl?: (input: string, init?: RequestInit) => Promise<any>
  stdout?: Pick<NodeJS.WriteStream, 'write'>
  stderr?: Pick<NodeJS.WriteStream, 'write'>
}): Promise<number>
