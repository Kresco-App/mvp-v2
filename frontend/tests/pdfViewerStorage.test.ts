import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('PdfViewer storage policy', () => {
  it('persists only validated PDF blobs for offline reopening', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewerCore.tsx'), 'utf8')

    expect(source).toMatch(/blob:\s*Blob/)
    expect(source).toContain('put(document)')
    expect(source).toContain("LOCAL_PDF_SAVED_STATUS = 'Document sauvegarde hors ligne'")
    expect(source).toContain('document.blob && await hasPdfMagicBytes(document.blob)')
    expect(source).not.toContain('sessionBlobsRef')
  })

  it('checks PDF magic bytes before loading through the canvas renderer', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewerCore.tsx'), 'utf8')

    expect(source).toContain('hasPdfMagicBytes')
    expect(source).toContain('PDF_MAGIC_BYTES')
    expect(source).toContain("0x25, 0x50, 0x44, 0x46, 0x2d")
    expect(source).toContain('loadPdfDocument(activeDocument.blob)')
    expect(source).not.toContain('contentWindow')
    expect(source).not.toContain('contentDocument')
  })

  it('renders PDF pages through pdf.js without iframe internals', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewerCore.tsx'), 'utf8')

    expect(source).toContain("import('pdfjs-dist')")
    expect(source).toContain('GlobalWorkerOptions.workerSrc')
    expect(source).toContain('pdf.getPage(pageNumber)')
    expect(source).toContain('page.render({')
    expect(source).toContain('canvasContext: context')
    expect(source).toContain('maxImageSize: MAX_PDF_IMAGE_PIXELS')
    expect(source).not.toContain('<iframe')
    expect(source).not.toContain('sandbox="allow-scripts')
  })

  it('stores annotations separately from PDF blobs', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewerCore.tsx'), 'utf8')

    expect(source).toContain("ANNOTATION_STORAGE_PREFIX = 'kresco:zed:annotations:v1'")
    expect(source).toContain('readAnnotations(activeDocument.id)')
    expect(source).toContain('writeAnnotations(activeDocumentId, annotations)')
    expect(source).toContain('zedStorageSetItemDeferred(annotationStorageKey(documentId), JSON.stringify(annotations))')
    expect(source).toContain('zedStorageRemoveItemDeferred(annotationStorageKey(documentId))')
    expect(source).toContain('zedStorageRemoveItem(annotationStorageKey(id))')
  })

  it('counts annotation stats in one pass after edits', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/PdfViewerCore.tsx'), 'utf8')

    expect(source).toContain('for (const annotation of annotations)')
    expect(source).toContain("if (annotation.type === 'highlight') stats.highlights += 1")
    expect(source).not.toContain("annotations.filter((item) => item.type === 'highlight')")
  })
})
