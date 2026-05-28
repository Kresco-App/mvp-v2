import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import nextEnv from '@next/env'

import { parseEnvFile, validateFrontendProductionEnv } from '../lib/productionEnv.mjs'

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VERCEL_ENV = process.env.VERCEL_ENV || 'production'
const { loadEnvConfig } = nextEnv

loadEnvConfig(FRONTEND_ROOT, false, {
  info() {},
  error(message) {
    console.error(message)
  },
})
loadVercelPulledEnv(FRONTEND_ROOT, VERCEL_ENV, process.env)

const errors = validateFrontendProductionEnv(process.env)
if (errors.length > 0) {
  console.error('Frontend production environment is invalid:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Frontend production environment validates.')

export function loadVercelPulledEnv(projectRoot, vercelEnv, targetEnv) {
  const candidates = [
    path.join(projectRoot, '.vercel', `.env.${vercelEnv}.local`),
    path.join(projectRoot, '.vercel', '.env.production.local'),
  ]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue

    const parsed = parseEnvFile(readFileSync(candidate, 'utf-8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (!targetEnv[key]) targetEnv[key] = value
    }
  }
}
