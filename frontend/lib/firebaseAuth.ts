import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  PhoneAuthProvider,
  RecaptchaVerifier,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePhoneNumber,
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

const FIREBASE_SMS_RECAPTCHA_CONTAINER_ID = 'kresco-firebase-sms-recaptcha'

let smsRecaptchaVerifier: RecaptchaVerifier | null = null
let smsRecaptchaContainerId: string | null = null

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

function ensureSmsRecaptchaContainer(containerId: string) {
  if (typeof document === 'undefined') {
    throw new Error('Firebase SMS verification requires a browser.')
  }
  let container = document.getElementById(containerId)
  if (!container) {
    container = document.createElement('div')
    container.id = containerId
    container.setAttribute('aria-hidden', 'true')
    Object.assign(container.style, {
      height: '1px',
      left: '0',
      opacity: '0',
      overflow: 'hidden',
      position: 'fixed',
      top: '0',
      width: '1px',
      zIndex: '-1',
    })
    document.body.appendChild(container)
  }
  return container
}

export function resetFirebaseSmsVerifier() {
  smsRecaptchaVerifier?.clear()
  smsRecaptchaVerifier = null
  smsRecaptchaContainerId = null
}

export function getFirebaseSmsRecaptchaVerifier(containerId = FIREBASE_SMS_RECAPTCHA_CONTAINER_ID) {
  const auth = getConfiguredFirebaseAuth()
  ensureSmsRecaptchaContainer(containerId)
  if (!smsRecaptchaVerifier || smsRecaptchaContainerId !== containerId) {
    resetFirebaseSmsVerifier()
    smsRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
    smsRecaptchaContainerId = containerId
  }
  return smsRecaptchaVerifier
}

export async function startFirebaseSmsVerification(phoneNumber: string, containerId = FIREBASE_SMS_RECAPTCHA_CONTAINER_ID) {
  const normalizedPhoneNumber = phoneNumber.trim()
  if (!normalizedPhoneNumber) {
    throw new Error('Phone number is required.')
  }
  const provider = new PhoneAuthProvider(getConfiguredFirebaseAuth())
  return provider.verifyPhoneNumber(normalizedPhoneNumber, getFirebaseSmsRecaptchaVerifier(containerId))
}

export async function linkFirebaseSmsVerification(verificationId: string, code: string) {
  const auth = getConfiguredFirebaseAuth()
  const user = auth.currentUser
  if (!user) {
    throw new Error('A signed-in Firebase user is required to link SMS verification.')
  }
  const credential = PhoneAuthProvider.credential(verificationId.trim(), code.trim())
  await linkWithCredential(user, credential)
  await user.reload()
  return user.phoneNumber || null
}

export async function updateFirebaseSmsVerification(verificationId: string, code: string) {
  const auth = getConfiguredFirebaseAuth()
  const user = auth.currentUser
  if (!user) {
    throw new Error('A signed-in Firebase user is required to update SMS verification.')
  }
  const credential = PhoneAuthProvider.credential(verificationId.trim(), code.trim())
  await updatePhoneNumber(user, credential)
  await user.reload()
  return user.phoneNumber || null
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
