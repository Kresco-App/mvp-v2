import { describe, expect, it } from 'vitest'

import { isActiveNavHref } from '@/lib/navigationPolicy'

describe('navigation policy', () => {
  it('matches nested routes by default', () => {
    expect(isActiveNavHref('/courses/42', '/courses')).toBe(true)
    expect(isActiveNavHref('/courses', '/courses')).toBe(true)
    expect(isActiveNavHref('/coursework', '/courses')).toBe(false)
  })

  it('supports exact-match shell roots', () => {
    expect(isActiveNavHref('/home', '/home', ['/home'])).toBe(true)
    expect(isActiveNavHref('/home/1', '/home', ['/home'])).toBe(false)
    expect(isActiveNavHref('/professor/live', '/professor', ['/professor'])).toBe(false)
  })

  it('ignores missing hrefs', () => {
    expect(isActiveNavHref('/home', null)).toBe(false)
    expect(isActiveNavHref('/home', undefined)).toBe(false)
  })
})
