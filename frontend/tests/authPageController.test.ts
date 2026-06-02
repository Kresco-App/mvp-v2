import { describe, expect, it } from 'vitest'

import { isUnverifiedEmailLoginError } from '@/lib/authPageController'

describe('auth page login error handling', () => {
  it('only treats the backend unverified-email detail as an email verification error', () => {
    expect(isUnverifiedEmailLoginError({
      response: {
        status: 403,
        data: { detail: 'Veuillez verifier votre email avant de vous connecter' },
      },
    })).toBe(true)

    expect(isUnverifiedEmailLoginError({
      response: {
        status: 403,
        data: { detail: 'CSRF origin is not trusted' },
      },
    })).toBe(false)
  })

  it('does not treat unrelated auth failures as pending verification', () => {
    expect(isUnverifiedEmailLoginError({
      response: {
        status: 401,
        data: { detail: 'Email ou mot de passe incorrect' },
      },
    })).toBe(false)
    expect(isUnverifiedEmailLoginError(new Error('Network failed'))).toBe(false)
  })
})
