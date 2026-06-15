import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const chatPagePaths = [
  ['professor inbox', join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx')],
  ['student professor chat', join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx')],
] as const

describe('professor chat attachment images', () => {
  it.each(chatPagePaths)('renders %s attachment previews as unoptimized images', (_label, pagePath) => {
    const source = readFileSync(pagePath, 'utf8')
    const attachmentImages = Array.from(
      source.matchAll(/<Image\b[^>]*src=\{chatMediaUrl\(message\.attachment_url\)\}[^>]*\/>/g),
      (match) => match[0],
    )

    expect(attachmentImages.length).toBeGreaterThan(0)
    for (const imageTag of attachmentImages) {
      expect(imageTag).toContain('unoptimized')
    }
  })
})
