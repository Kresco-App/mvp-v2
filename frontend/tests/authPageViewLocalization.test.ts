import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('auth page localization wiring', () => {
  it('does not render localization references as literal button labels', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'auth', 'AuthPageView.tsx'), 'utf8')

    expect(source).not.toContain('label="{localizedCopy')
    expect(source).toContain('label={localizedCopy.auth.continueWithGoogle}')
    expect(source).not.toContain('label="Google"')
  })

  it('keeps auth page utility copy localized and avoids dead legal links', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'auth', 'AuthPageView.tsx'), 'utf8')
    const localization = readFileSync(join(process.cwd(), 'lib', 'localization.ts'), 'utf8')

    expect(source).toContain('localizedCopy.auth.or')
    expect(source).toContain('localizedCopy.auth.termsSummary')
    expect(source).not.toContain('href="#"')
    expect(source).not.toContain('Terms')
    expect(source).not.toContain('Privacy')
    expect(localization).toContain("signUpTitle: 'Inscription'")
    expect(localization).toContain("logInTitle: 'Connexion'")
  })

  it('keeps professor login errors and password placeholders in the auth copy table', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'professor', 'login', 'page.tsx'), 'utf8')

    expect(source).toContain('localizedCopy.auth.professorOnlyError')
    expect(source).toContain('localizedCopy.auth.verifyEmailBeforeLogin')
    expect(source).toContain('localizedCopy.auth.passwordPlaceholder')
    expect(source).not.toContain('Could not sign in.')
    expect(source).not.toContain('This login is only for professor accounts.')
    expect(source).not.toContain('placeholder="Password"')
  })

  it('requires both onboarding selections before enabling the filiere save button', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'auth', 'AuthPageView.tsx'), 'utf8')

    expect(source).toContain('canSubmitOnboarding(selectedLevel, selectedSpec, loading)')
    expect(source).not.toContain('disabled={!selectedSpec || loading}')
  })

  it('keeps Google loading separate from email signup copy', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'auth', 'AuthPageView.tsx'), 'utf8')

    expect(source).toContain("pendingAction === 'signup' ? <LoadingText label={localizedCopy.auth.creating} />")
    expect(source).toContain("pendingAction === 'google' &&")
  })
})
