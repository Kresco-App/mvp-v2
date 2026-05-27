import { describe, expect, it } from 'vitest'

import {
  buildImageRemotePatterns,
  shouldEnableLocalRewrites,
} from '../next.config.mjs'

describe('Next production config boundaries', () => {
  it('does not whitelist localhost image optimization targets in production builds', () => {
    expect(buildImageRemotePatterns('production')).toEqual([
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ])
  })

  it('keeps localhost image targets available only outside production builds', () => {
    expect(buildImageRemotePatterns('development')).toEqual(expect.arrayContaining([
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
    ]))
  })

  it('does not enable local API rewrites in production even if the override is set', () => {
    expect(shouldEnableLocalRewrites('production', 'true')).toBe(false)
    expect(shouldEnableLocalRewrites('development', 'true')).toBe(true)
    expect(shouldEnableLocalRewrites('development', 'false')).toBe(false)
  })
})
