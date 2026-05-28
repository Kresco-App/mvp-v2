import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Next segment error telemetry', () => {
  it('reports segment-level errors to the client telemetry endpoint', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'error.tsx'), 'utf8')

    expect(source).toContain("import { useEffect } from 'react'")
    expect(source).toContain("import { reportClientError } from '@/lib/clientTelemetry'")
    expect(source).toContain("source: 'next-segment-error'")
    expect(source).toContain('digest: error.digest')
  })
})
