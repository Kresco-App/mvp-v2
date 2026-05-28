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
})
