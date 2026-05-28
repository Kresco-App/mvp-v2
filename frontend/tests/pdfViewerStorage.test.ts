import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'


describe('PdfViewer storage policy', () => {
  it('persists only validated PDF blobs for offline reopening', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewer.tsx'), 'utf8')

    expect(source).toMatch(/blob:\s*Blob/)
    expect(source).toContain('put(document)')
    expect(source).toContain('Document sauvegarde hors ligne')
    expect(source).toContain('document.blob && await hasPdfMagicBytes(document.blob)')
    expect(source).not.toContain('sessionBlobsRef')
  })

  it('checks PDF magic bytes before creating blob URLs and keeps the iframe sandboxed', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewer.tsx'), 'utf8')

    expect(source).toContain('hasPdfMagicBytes')
    expect(source).toContain("0x25, 0x50, 0x44, 0x46, 0x2d")
    expect(source).toContain('sandbox="allow-downloads"')
    expect(source).not.toContain('allow-scripts')
    expect(source).not.toContain('allow-same-origin')
  })
})
