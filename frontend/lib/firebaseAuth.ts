import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
} from '@firebase/auth'
import { firebasePublicAuthConfig } from './firebaseConfig'
import { getFirebaseApp } from './firebaseApp'

export {
  firebasePublicAuthConfig,
  isFirebaseAuthConfigured,
  isFirebaseGoogleAuthConfigured,
} from './firebaseConfig'
export { getFirebaseApp } from './firebaseApp'

export class FirebaseEmailNotVerifiedError extends Error {
  email: string

  constructor(email: string) {
    super('Firebase email is not verified.')
    this.name = 'FirebaseEmailNotVerifiedError'
    this.email = email
  }
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

function googleProvider() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}

export async function startFirebaseGoogleRedirect() {
  await signInWithRedirect(getConfiguredFirebaseAuth(), googleProvider())
}

export async function getFirebaseGoogleRedirectIdToken() {
  const result = await getRedirectResult(getConfiguredFirebaseAuth())
  return result ? result.user.getIdToken() : null
}

export async function getFirebaseGoogleIdToken() {
  const result = await signInWithPopup(getConfiguredFirebaseAuth(), googleProvider())
  return result.user.getIdToken()
}
