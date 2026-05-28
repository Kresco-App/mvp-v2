export declare const REQUIRED_FRONTEND_PRODUCTION_ENV: string[]

export declare function validateFrontendProductionEnv(
  env: Record<string, string | undefined>,
): string[]

export declare function parseEnvFile(contents: string): Record<string, string>
