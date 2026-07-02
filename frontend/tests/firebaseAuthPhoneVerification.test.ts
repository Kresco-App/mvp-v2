// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  type MockFirebaseUser = {
    phoneNumber: string
    reload: ReturnType<typeof vi.fn>
    uid: string
  }
  const auth: { currentUser: MockFirebaseUser | null } = {
    currentUser: {
      phoneNumber: '+212600000000',
      reload: vi.fn().mockResolvedValue(undefined),
      uid: 'firebase-user-1',
    },
  }
  const firebaseConfig = {
    apiKey: 'public-api-key',
    appId: 'firebase-app-id',
    authDomain: 'kresco-staging.firebaseapp.com',
    projectId: 'kresco-staging',
  }
  const firebaseApp = { name: 'kresco' }
  const recaptchaInstances: Array<{
    auth: unknown
    clear: ReturnType<typeof vi.fn>
    containerOrId: HTMLElement | string
    parameters: unknown
  }> = []
  const phoneProviderInstances: Array<{
    auth: unknown
    verifyPhoneNumber: ReturnType<typeof vi.fn>
  }> = []

  class MockRecaptchaVerifier {
    auth: unknown
    clear = vi.fn()
    containerOrId: HTMLElement | string
    parameters: unknown

    constructor(authArg: unknown, containerOrId: HTMLElement | string, parameters: unknown) {
      this.auth = authArg
      this.containerOrId = containerOrId
      this.parameters = parameters
      recaptchaInstances.push(this)
    }
  }

  class MockPhoneAuthProvider {
    static credential = vi.fn((verificationId: string, code: string) => ({
      code,
      providerId: 'phone',
      verificationId,
    }))

    auth: unknown
    verifyPhoneNumber = vi.fn().mockResolvedValue('verification-id-1')

    constructor(authArg: unknown) {
      this.auth = authArg
      phoneProviderInstances.push(this)
    }
  }

  return {
    auth,
    firebaseApp,
    firebaseConfig,
    getAuth: vi.fn(() => auth),
    getFirebaseApp: vi.fn(() => firebaseApp),
    firebasePublicAuthConfig: vi.fn(() => firebaseConfig),
    linkWithCredential: vi.fn().mockResolvedValue({ user: auth.currentUser }),
    MockPhoneAuthProvider,
    MockRecaptchaVerifier,
    phoneProviderInstances,
    recaptchaInstances,
    updatePhoneNumber: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/firebaseConfig', () => ({
  firebasePublicAuthConfig: mocks.firebasePublicAuthConfig,
  isFirebaseAuthConfigured: vi.fn(() => true),
  isFirebaseGoogleAuthConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/firebaseApp', () => ({
  getFirebaseApp: mocks.getFirebaseApp,
}))

vi.mock('@firebase/auth', () => ({
  applyActionCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  getAuth: mocks.getAuth,
  getRedirectResult: vi.fn(),
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn()
  },
  linkWithCredential: mocks.linkWithCredential,
  PhoneAuthProvider: mocks.MockPhoneAuthProvider,
  RecaptchaVerifier: mocks.MockRecaptchaVerifier,
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
  updatePhoneNumber: mocks.updatePhoneNumber,
  updateProfile: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
}))

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  document.body.innerHTML = ''
  mocks.auth.currentUser = {
    phoneNumber: '+212600000000',
    reload: vi.fn().mockResolvedValue(undefined),
    uid: 'firebase-user-1',
  }
  mocks.recaptchaInstances.length = 0
  mocks.phoneProviderInstances.length = 0
  mocks.firebasePublicAuthConfig.mockReturnValue(mocks.firebaseConfig)
})

describe('Firebase SMS verification helpers', () => {
  it('starts SMS verification with an invisible Firebase reCAPTCHA verifier', async () => {
    const { startFirebaseSmsVerification } = await import('@/lib/firebaseAuth')

    const verificationId = await startFirebaseSmsVerification(' +212600000000 ')

    expect(verificationId).toBe('verification-id-1')
    expect(document.getElementById('kresco-firebase-sms-recaptcha')).not.toBeNull()
    expect(mocks.getAuth).toHaveBeenCalledWith(mocks.firebaseApp)
    expect(mocks.recaptchaInstances).toHaveLength(1)
    expect(mocks.recaptchaInstances[0]?.parameters).toEqual({ size: 'invisible' })
    expect(mocks.phoneProviderInstances[0]?.verifyPhoneNumber).toHaveBeenCalledWith(
      '+212600000000',
      mocks.recaptchaInstances[0],
    )
  })

  it('resets the previous verifier when the SMS container changes', async () => {
    const { startFirebaseSmsVerification } = await import('@/lib/firebaseAuth')

    await startFirebaseSmsVerification('+212600000000')
    await startFirebaseSmsVerification('+212600000001', 'custom-sms-container')

    expect(mocks.recaptchaInstances).toHaveLength(2)
    expect(mocks.recaptchaInstances[0]?.clear).toHaveBeenCalledTimes(1)
    expect(document.getElementById('custom-sms-container')).not.toBeNull()
  })

  it('links a verified phone credential to the signed-in Firebase user', async () => {
    const { linkFirebaseSmsVerification } = await import('@/lib/firebaseAuth')

    const phoneNumber = await linkFirebaseSmsVerification(' verification-id-1 ', ' 123456 ')

    expect(mocks.MockPhoneAuthProvider.credential).toHaveBeenCalledWith('verification-id-1', '123456')
    expect(mocks.linkWithCredential).toHaveBeenCalledWith(
      mocks.auth.currentUser!,
      expect.objectContaining({ code: '123456', verificationId: 'verification-id-1' }),
    )
    expect(mocks.auth.currentUser!.reload).toHaveBeenCalledTimes(1)
    expect(phoneNumber).toBe('+212600000000')
  })

  it('updates a signed-in user phone number through Firebase Auth', async () => {
    const { updateFirebaseSmsVerification } = await import('@/lib/firebaseAuth')

    const phoneNumber = await updateFirebaseSmsVerification('verification-id-2', '222333')

    expect(mocks.MockPhoneAuthProvider.credential).toHaveBeenCalledWith('verification-id-2', '222333')
    expect(mocks.updatePhoneNumber).toHaveBeenCalledWith(
      mocks.auth.currentUser!,
      expect.objectContaining({ code: '222333', verificationId: 'verification-id-2' }),
    )
    expect(mocks.auth.currentUser!.reload).toHaveBeenCalledTimes(1)
    expect(phoneNumber).toBe('+212600000000')
  })

  it('requires a signed-in Firebase user before linking SMS verification', async () => {
    mocks.auth.currentUser = null
    const { linkFirebaseSmsVerification } = await import('@/lib/firebaseAuth')

    await expect(linkFirebaseSmsVerification('verification-id-1', '123456')).rejects.toThrow(
      'A signed-in Firebase user is required to link SMS verification.',
    )
    expect(mocks.linkWithCredential).not.toHaveBeenCalled()
  })
})
