import path from 'node:path'
import { fileURLToPath } from 'node:url'

import nextEnv from '@next/env'

import { validateFrontendProductionEnv } from '../lib/productionEnv.mjs'

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { loadEnvConfig } = nextEnv
const FIXTURE_ENV = {
  NEXT_PUBLIC_API_BASE_URL: 'https://api.kresco.example/api',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'firebase-web-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'kresco-prod.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'kresco-prod',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:418905339056:web:5ff922f6917acc61c3b775',
  NEXT_PUBLIC_FIRESTORE_DATABASE: '(default)',
  NEXT_PUBLIC_REALTIME_PROVIDER: 'firestore',
  NEXT_PUBLIC_RELEASE_SHA: '0123456789abcdef0123456789abcdef01234567',
  NEXT_PUBLIC_SITE_URL: 'https://kresco.ma',
  NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: 'kresco.ma',
}

loadEnvConfig(FRONTEND_ROOT, false, {
  info() {},
  error(message) {
    console.error(message)
  },
})
if (process.argv.includes('--fixture')) {
  for (const [key, value] of Object.entries(FIXTURE_ENV)) {
    process.env[key] = value
  }
}

const errors = validateFrontendProductionEnv(process.env)
if (errors.length > 0) {
  console.error('Frontend production environment is invalid:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Frontend production environment validates.')
