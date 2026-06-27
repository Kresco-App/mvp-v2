export type FirebasePublicAuthConfig = {
  apiKey: string
  appId: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
}

type FirebasePublicAuthEnv = Record<string, string | undefined>

function envValue(value: string | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function defaultFirebasePublicAuthEnv(): FirebasePublicAuthEnv {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  }
}

export function firebasePublicAuthConfig(env: FirebasePublicAuthEnv = defaultFirebasePublicAuthEnv()): FirebasePublicAuthConfig | null {
  const apiKey = envValue(env.NEXT_PUBLIC_FIREBASE_API_KEY)
  const authDomain = envValue(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)
  const projectId = envValue(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  const appId = envValue(env.NEXT_PUBLIC_FIREBASE_APP_ID)

  if (!apiKey || !authDomain || !projectId || !appId) return null

  return {
    apiKey,
    appId,
    authDomain,
    projectId,
    storageBucket: envValue(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) || undefined,
    messagingSenderId: envValue(env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) || undefined,
  }
}

export function isFirebaseAuthConfigured(env?: FirebasePublicAuthEnv) {
  return firebasePublicAuthConfig(env) !== null
}

export const isFirebaseGoogleAuthConfigured = isFirebaseAuthConfigured
