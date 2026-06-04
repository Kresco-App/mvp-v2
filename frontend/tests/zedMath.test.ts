import { describe, expect, it } from 'vitest'

import { evaluateMathExpression } from '@/lib/zedMath'

describe('evaluateMathExpression', () => {
  it('keeps exponent parsing right-associative', () => {
    expect(evaluateMathExpression('2^3^2')).toBe('512')
  })

  it('normalizes JavaScript-style exponent input', () => {
    expect(evaluateMathExpression('2**3')).toBe('8')
  })

  it('handles deep exponent chains without recursive stack overflow', () => {
    const expression = Array.from({ length: 600 }, () => '1').join('^')

    expect(evaluateMathExpression(expression)).toBe('1')
  })
})
