import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Google auth callback isolation', () => {
  it('uses Firebase Auth without exposing a mutable window callback', () => {
    const source = readFileSync(join(process.cwd(), 'lib', 'authPageController.ts'), 'utf8')

    expect(source).not.toContain('window.handleGoogleCredential')
    expect(source).not.toContain('handleGoogleCredential: (response: any) => void')
    expect(source).not.toContain('accounts.google.com/gsi/client')
    expect(source).toContain('getFirebaseGoogleIdToken')
  })

  it('keeps the landing page as a thin auth shell', () => {
    const pageSource = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf8')

    expect(pageSource).toContain('useAuthPageController')
    expect(pageSource).toContain('AuthPageView')
    expect(pageSource).not.toContain("api.post('/auth/login'")
    expect(pageSource).not.toContain("document.createElement('script')")
    expect(pageSource).not.toContain("authMode === 'signup'")
  })
})
