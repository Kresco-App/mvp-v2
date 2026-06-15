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

  it('extracts real text and image snippets through pdf.js without reading iframe internals', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewer.tsx'), 'utf8')

    expect(source).toContain("import('pdfjs-dist')")
    expect(source).toContain('GlobalWorkerOptions.workerSrc')
    expect(source).toContain('getTextContent()')
    expect(source).toContain('page.render({ canvas, canvasContext: context, viewport }).promise')
    expect(source).toContain("canvas.toDataURL('image/png')")
    expect(source).toContain("type: 'image'")
    expect(source).toContain('MAX_SNIP_OUTPUT_PIXELS')
    expect(source).toContain('maxImageSize: MAX_PDF_IMAGE_PIXELS')
    expect(source).not.toContain('contentWindow')
    expect(source).not.toContain('contentDocument')
    expect(source).not.toContain('zone (')
  })
})
