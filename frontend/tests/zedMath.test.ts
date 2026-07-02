import { describe, expect, it } from 'vitest'

import { completeMathExpression, evaluateMathExpression } from '@/lib/zedMath'

describe('evaluateMathExpression', () => {
  it('keeps exponent parsing right-associative', () => {
    expect(evaluateMathExpression('2^3^2')).toBe('512')
  })

  it('normalizes JavaScript-style exponent input', () => {
    expect(evaluateMathExpression('2**3')).toBe('8')
  })

  it('completes missing trailing parentheses before evaluation', () => {
    expect(completeMathExpression('sqrt(sqrt(6')).toBe('sqrt(sqrt(6))')
    expect(evaluateMathExpression('sqrt(sqrt(6')).toBe('1.56508458007')
  })

  it('handles deep exponent chains without recursive stack overflow', () => {
    const expression = Array.from({ length: 600 }, () => '1').join('^')

    expect(evaluateMathExpression(expression)).toBe('1')
  })
})
