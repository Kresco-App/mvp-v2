import { getApps, initializeApp, type FirebaseApp } from '@firebase/app'
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
} from '@firebase/auth'

const FIREBASE_APP_NAME = 'kresco-web'

type FirebasePublicAuthConfig = {
  apiKey: string
  appId: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
}

export class FirebaseEmailNotVerifiedError extends Error {
  email: string

  constructor(email: string) {
    super('Firebase email is not verified.')
    this.name = 'FirebaseEmailNotVerifiedError'
    this.email = email
  }
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

export function isFirebaseAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return firebasePublicAuthConfig(env) !== null
}

export const isFirebaseGoogleAuthConfigured = isFirebaseAuthConfigured

export function getFirebaseApp(config: FirebasePublicAuthConfig): FirebaseApp {
  return getApps().find((app) => app.name === FIREBASE_APP_NAME) ?? initializeApp(config, FIREBASE_APP_NAME)
}

function getConfiguredFirebaseAuth() {
  const config = firebasePublicAuthConfig()
  if (!config) {
    throw new Error('Firebase Auth is not configured.')
  }
  return getAuth(getFirebaseApp(config))
}

function actionCodeSettings(pathname: '/auth/verify-email' | '/auth/reset-password') {
  if (typeof window === 'undefined') return undefined
  return {
    handleCodeInApp: true,
    url: new URL(pathname, window.location.origin).toString(),
  }
}

async function sendCurrentUserEmailVerification(user: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user']) {
  await sendEmailVerification(user, actionCodeSettings('/auth/verify-email'))
}

export async function createFirebaseEmailUser(email: string, password: string, fullName: string) {
  const auth = getConfiguredFirebaseAuth()
  const result = await createUserWithEmailAndPassword(auth, email, password)
  const displayName = fullName.trim()
  if (displayName) {
    await updateProfile(result.user, { displayName })
  }
  await sendCurrentUserEmailVerification(result.user)
  await signOut(auth)
  return result.user.email || email
}

export async function getFirebaseEmailPasswordIdToken(email: string, password: string) {
  const auth = getConfiguredFirebaseAuth()
  const result = await signInWithEmailAndPassword(auth, email, password)
  await result.user.reload()
  if (!result.user.emailVerified) {
    await sendCurrentUserEmailVerification(result.user).catch(() => undefined)
    await signOut(auth)
    throw new FirebaseEmailNotVerifiedError(result.user.email || email)
  }
  return result.user.getIdToken(true)
}

export async function sendFirebasePasswordReset(email: string) {
  await sendPasswordResetEmail(getConfiguredFirebaseAuth(), email, actionCodeSettings('/auth/reset-password'))
}

export async function resendFirebaseEmailVerification(email: string, password: string) {
  const auth = getConfiguredFirebaseAuth()
  const result = await signInWithEmailAndPassword(auth, email, password)
  await result.user.reload()
  if (result.user.emailVerified) {
    await signOut(auth)
    return
  }
  await sendCurrentUserEmailVerification(result.user)
  await signOut(auth)
}

export async function applyFirebaseEmailVerification(oobCode: string) {
  await applyActionCode(getConfiguredFirebaseAuth(), oobCode)
}

export async function confirmFirebasePasswordReset(oobCode: string, password: string) {
  const auth = getConfiguredFirebaseAuth()
  await verifyPasswordResetCode(auth, oobCode)
  await confirmPasswordReset(auth, oobCode, password)
}

export async function signOutFirebaseAuth() {
  const config = firebasePublicAuthConfig()
  if (!config) return
  await signOut(getAuth(getFirebaseApp(config)))
}

export function isFirebaseEmailNotVerifiedError(error: unknown): error is FirebaseEmailNotVerifiedError {
  return error instanceof FirebaseEmailNotVerifiedError
}

export async function getFirebaseGoogleIdToken() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const result = await signInWithPopup(getConfiguredFirebaseAuth(), provider)
  return result.user.getIdToken()
}
