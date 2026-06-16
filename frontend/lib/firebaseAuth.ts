import { getApps, initializeApp, type FirebaseApp } from '@firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup } from '@firebase/auth'

const FIREBASE_APP_NAME = 'kresco-web'

type FirebasePublicAuthConfig = {
  apiKey: string
  appId: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
}

function envValue(value: string | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

export function firebasePublicAuthConfig(env: NodeJS.ProcessEnv = process.env): FirebasePublicAuthConfig | null {
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

export function isFirebaseGoogleAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return firebasePublicAuthConfig(env) !== null
}

function firebaseApp(config: FirebasePublicAuthConfig): FirebaseApp {
  return getApps().find((app) => app.name === FIREBASE_APP_NAME) ?? initializeApp(config, FIREBASE_APP_NAME)
}

export async function getFirebaseGoogleIdToken() {
  const config = firebasePublicAuthConfig()
  if (!config) {
    throw new Error('Firebase Auth is not configured.')
  }

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const result = await signInWithPopup(getAuth(firebaseApp(config)), provider)
  return result.user.getIdToken()
}
