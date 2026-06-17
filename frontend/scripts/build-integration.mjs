import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const backendPort = process.env.KRESCO_E2E_BACKEND_PORT ?? '8010'
const backendOrigin = process.env.KRESCO_LOCAL_BACKEND_ORIGIN ?? `http://127.0.0.1:${backendPort}`
const nextCliPath = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url))

const result = spawnSync(process.execPath, [nextCliPath, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    KRESCO_ENV: 'development',
    KRESCO_ENABLE_LOCAL_REWRITES: 'true',
    KRESCO_LOCAL_BACKEND_ORIGIN: backendOrigin,
    NEXT_PUBLIC_API_BASE_URL: '/api/',
  },
})

if (result.error) {
  console.error(result.error)
}

process.exit(result.status ?? 1)
