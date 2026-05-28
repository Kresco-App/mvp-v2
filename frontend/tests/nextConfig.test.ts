import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import nextConfig, {
  optimizePackageImports,
} from '../next.config.mjs'
import {
  buildImageRemotePatterns,
  shouldEnableLocalRewrites,
} from '../next.config.mjs'

const FRONTEND_ROOT = fileURLToPath(new URL('..', import.meta.url))

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    if (entry === 'node_modules' || entry === '.next') return []
    if (statSync(fullPath).isDirectory()) return sourceFilesUnder(fullPath)
    return /\.(t|j)sx?$/.test(entry) ? [fullPath] : []
  })
}

describe('Next production config boundaries', () => {
  it('does not whitelist localhost image optimization targets in production builds', () => {
    expect(buildImageRemotePatterns('production')).toEqual([
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: '*.ytimg.com' },
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

  it('keeps heavy visualization and icon imports modular', () => {
    const packageJson = JSON.parse(readFileSync(join(FRONTEND_ROOT, 'package.json'), 'utf8'))

    expect(packageJson.dependencies).not.toHaveProperty('d3')
    expect(packageJson.devDependencies).not.toHaveProperty('@types/d3')
    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      'd3-array': expect.any(String),
      'd3-ease': expect.any(String),
      'd3-scale': expect.any(String),
      'd3-selection': expect.any(String),
      'd3-transition': expect.any(String),
    }))
    expect(optimizePackageImports).toContain('lucide-react')
    expect(nextConfig.experimental?.optimizePackageImports).toContain('lucide-react')

    const barrelD3Imports = sourceFilesUnder(FRONTEND_ROOT).filter((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return /from ['"]d3['"]|import \* as d3 from ['"]d3['"]|require\(['"]d3['"]\)/.test(source)
    })
    expect(barrelD3Imports).toEqual([])
  })
})
