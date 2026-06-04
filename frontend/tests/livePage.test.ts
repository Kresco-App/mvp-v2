import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('student live sessions page', () => {
  it('keeps realtime fallback polling and wraps long descriptions', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/(dashboard)/live/page.tsx'), 'utf8')

    expect(source).toContain('fallback: { intervalMs: 5000, poll: refresh }')
    expect(source).toContain('max-w-[520px] break-words')
  })
})
