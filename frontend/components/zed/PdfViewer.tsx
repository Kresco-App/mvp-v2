'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { FileText, Pin, Scissors, Trash2, Upload, X } from 'lucide-react'

interface PinnedSnippet {
  id: string
  content: string
  type: 'text' | 'image'
}

interface Props {
  onPinSnippet: (snippet: PinnedSnippet) => void
}

interface LocalDocument {
  id: string
  name: string
  type: string
  size: number
  updatedAt: number
  blob: Blob
}

interface PdfPageText {
  pageNumber: number
  text: string
}

interface SnipRect {
  x: number
  y: number
  w: number
  h: number
}

interface SnipPreview {
  url: string
  width: number
  height: number
  pageNumber: number
}

interface ContainedBox {
  x: number
  y: number
  width: number
  height: number
}

type PdfJsModule = typeof import('pdfjs-dist')

const DB_NAME = 'kresco_zed_workspace'
const DB_VERSION = 1
const DOC_STORE = 'documents'
const ACTIVE_DOC_KEY = 'kresco_zed_active_document'
const PDF_WORKER_SRC = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
const MAX_TEXT_EXTRACTION_PAGES = 8
const MAX_PAGE_TEXT_CHARS = 5000
const MAX_PIN_TEXT_CHARS = 1400
const MAX_PDF_IMAGE_PIXELS = 4_000_000
const MAX_SNIP_PREVIEW_PIXELS = 1_200_000
const MAX_SNIP_OUTPUT_PIXELS = 320_000
let pdfJsModulePromise: Promise<PdfJsModule> | null = null

function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC
      return pdfjs
    })
  }
  return pdfJsModulePromise
}

function destroyPdfDocument(pdf: PDFDocumentProxy) {
  return pdf.loadingTask.destroy()
}

function openDocumentDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DOC_STORE)) {
        db.createObjectStore(DOC_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readAllDocuments(): Promise<LocalDocument[]> {
  const db = await openDocumentDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readonly')
    const request = transaction.objectStore(DOC_STORE).getAll()
    request.onsuccess = async () => {
      try {
        const stored = request.result as LocalDocument[]
        const valid = []
        for (const document of stored) {
          if (document.blob && await hasPdfMagicBytes(document.blob)) {
            valid.push(document)
          }
        }
        resolve(valid)
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

async function saveDocument(document: LocalDocument): Promise<void> {
  const db = await openDocumentDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readwrite')
    transaction.objectStore(DOC_STORE).put(document)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

async function deleteDocument(id: string): Promise<void> {
  const db = await openDocumentDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readwrite')
    transaction.objectStore(DOC_STORE).delete(id)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function hasPdfMagicBytes(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
  const expected = [0x25, 0x50, 0x44, 0x46, 0x2d]
  return expected.every((byte, index) => header[index] === byte)
}

async function loadPdfDocument(blob: Blob): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs()
  const data = new Uint8Array(await blob.arrayBuffer())
  return pdfjs.getDocument({
    data,
    enableXfa: false,
    maxImageSize: MAX_PDF_IMAGE_PIXELS,
    stopAtErrors: false,
    useWorkerFetch: false,
  }).promise
}

function isTextContentItem(item: unknown): item is { str: string; hasEOL?: boolean } {
  if (!item || typeof item !== 'object') return false
  return typeof (item as { str?: unknown }).str === 'string'
}

function normalizePdfText(text: string) {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function clampPdfText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  const trimmed = text.slice(0, maxChars).trimEnd()
  return `${trimmed}...`
}

async function extractPdfPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<PdfPageText | null> {
  const page = await pdf.getPage(pageNumber)
  try {
    const textContent = await page.getTextContent()
    let text = ''
    for (const item of textContent.items) {
      if (!isTextContentItem(item)) continue
      text += item.str
      text += item.hasEOL ? '\n' : ' '
      if (text.length > MAX_PAGE_TEXT_CHARS * 1.25) break
    }

    const normalized = normalizePdfText(text)
    if (!normalized) return null
    return {
      pageNumber,
      text: clampPdfText(normalized, MAX_PAGE_TEXT_CHARS),
    }
  } finally {
    page.cleanup()
  }
}

async function extractPdfTextPages(pdf: PDFDocumentProxy): Promise<PdfPageText[]> {
  const pages: PdfPageText[] = []
  const pageLimit = Math.min(pdf.numPages, MAX_TEXT_EXTRACTION_PAGES)
  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    try {
      const pageText = await extractPdfPageText(pdf, pageNumber)
      if (pageText) pages.push(pageText)
    } catch {
      // Keep extraction best-effort so one malformed page does not block snippets.
    }
  }
  return pages
}

function pinnedTextContent(pageText: PdfPageText) {
  return `Page ${pageText.pageNumber}\n\n${clampPdfText(pageText.text, MAX_PIN_TEXT_CHARS)}`
}

function clampPageNumber(pageNumber: number, pageCount: number) {
  if (pageCount < 1) return 1
  if (!Number.isFinite(pageNumber)) return 1
  return Math.max(1, Math.min(pageCount, Math.floor(pageNumber)))
}

function renderScaleForPixelLimit(width: number, height: number, maxPixels: number) {
  const basePixels = width * height
  if (basePixels <= 0) return 1
  return Math.min(2, Math.sqrt(maxPixels / basePixels))
}

async function renderPdfPagePreview(pdf: PDFDocumentProxy, pageNumber: number): Promise<SnipPreview> {
  const page = await pdf.getPage(pageNumber)
  try {
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = renderScaleForPixelLimit(baseViewport.width, baseViewport.height, MAX_SNIP_PREVIEW_PIXELS)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context unavailable')
    await page.render({ canvas, canvasContext: context, viewport }).promise
    const url = canvas.toDataURL('image/png')
    return {
      url,
      width: canvas.width,
      height: canvas.height,
      pageNumber,
    }
  } finally {
    page.cleanup()
  }
}

function containedImageBox(containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number): ContainedBox {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image load failed'))
    image.src = url
  })
}

async function cropPreviewToPng(preview: SnipPreview, rect: SnipRect, overlayBounds: DOMRect): Promise<string | null> {
  const imageBox = containedImageBox(overlayBounds.width, overlayBounds.height, preview.width, preview.height)
  if (imageBox.width <= 0 || imageBox.height <= 0) return null

  const left = Math.max(rect.x, imageBox.x)
  const top = Math.max(rect.y, imageBox.y)
  const right = Math.min(rect.x + rect.w, imageBox.x + imageBox.width)
  const bottom = Math.min(rect.y + rect.h, imageBox.y + imageBox.height)
  const cropWidth = right - left
  const cropHeight = bottom - top
  if (cropWidth < 10 || cropHeight < 10) return null

  const sourceScaleX = preview.width / imageBox.width
  const sourceScaleY = preview.height / imageBox.height
  const sourceX = (left - imageBox.x) * sourceScaleX
  const sourceY = (top - imageBox.y) * sourceScaleY
  const sourceWidth = cropWidth * sourceScaleX
  const sourceHeight = cropHeight * sourceScaleY
  const outputScale = renderScaleForPixelLimit(sourceWidth, sourceHeight, MAX_SNIP_OUTPUT_PIXELS)
  const outputWidth = Math.max(1, Math.floor(sourceWidth * outputScale))
  const outputHeight = Math.max(1, Math.floor(sourceHeight * outputScale))
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const context = canvas.getContext('2d')
  if (!context) return null

  const image = await loadImage(preview.url)
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  )
  return canvas.toDataURL('image/png')
}

export default function PdfViewer({ onPinSnippet }: Props) {
  const [documents, setDocuments] = useState<LocalDocument[]>([])
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('Importez un enonce ou un cours PDF')
  const [isSnipping, setIsSnipping] = useState(false)
  const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(null)
  const [snipRect, setSnipRect] = useState<SnipRect | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [snippetPageNumber, setSnippetPageNumber] = useState(1)
  const [extractedPages, setExtractedPages] = useState<PdfPageText[]>([])
  const [snipPreview, setSnipPreview] = useState<SnipPreview | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null)
  const activeDocument = documents.find((item) => item.id === activeDocumentId) ?? null

  useEffect(() => {
    let cancelled = false

    readAllDocuments()
      .then((items) => {
        if (cancelled) return
        const sorted = items.sort((a, b) => b.updatedAt - a.updatedAt)
        setDocuments(sorted)
        const savedActive = localStorage.getItem(ACTIVE_DOC_KEY)
        const active = sorted.find((item) => item.id === savedActive) ?? sorted[0]
        if (active) setActiveDocumentId(active.id)
      })
      .catch(() => setStatus('Stockage local indisponible'))

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const active = documents.find((item) => item.id === activeDocumentId)

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    if (!active) {
      setPdfUrl(null)
      return
    }

    const nextUrl = URL.createObjectURL(active.blob)
    objectUrlRef.current = nextUrl
    setPdfUrl(nextUrl)
    setStatus('Document sauvegarde hors ligne')
    localStorage.setItem(ACTIVE_DOC_KEY, active.id)

    return () => {
      if (objectUrlRef.current === nextUrl) {
        URL.revokeObjectURL(nextUrl)
        objectUrlRef.current = null
      }
    }
  }, [activeDocumentId, documents])

  useEffect(() => {
    let cancelled = false
    const previousPdf = pdfDocumentRef.current
    pdfDocumentRef.current = null
    if (previousPdf) void destroyPdfDocument(previousPdf).catch(() => {})

    setExtractedPages([])
    setPdfPageCount(0)
    setSnippetPageNumber(1)
    setSnipPreview(null)

    if (!activeDocument) {
      return () => {
        cancelled = true
      }
    }

    setStatus('Document sauvegarde hors ligne - analyse PDF')
    loadPdfDocument(activeDocument.blob)
      .then(async (pdf) => {
        if (cancelled) {
          await destroyPdfDocument(pdf)
          return
        }

        pdfDocumentRef.current = pdf
        setPdfPageCount(pdf.numPages)
        setSnippetPageNumber((current) => clampPageNumber(current, pdf.numPages))

        const pages = await extractPdfTextPages(pdf)
        if (cancelled || pdfDocumentRef.current !== pdf) return

        setExtractedPages(pages)
        setStatus(pages.length > 0
          ? 'Document sauvegarde hors ligne - texte pret'
          : 'Document sauvegarde hors ligne - capture image prete')
      })
      .catch(() => {
        if (!cancelled) setStatus('Document sauvegarde hors ligne - extraction indisponible')
      })

    return () => {
      cancelled = true
      const loadedPdf = pdfDocumentRef.current
      pdfDocumentRef.current = null
      if (loadedPdf) void destroyPdfDocument(loadedPdf).catch(() => {})
    }
  }, [activeDocument])

  useEffect(() => {
    if (!isSnipping) {
      setSnipPreview(null)
      return
    }

    const pdf = pdfDocumentRef.current
    if (!pdf || pdfPageCount < 1) {
      setSnipPreview(null)
      setStatus('Capture PDF en preparation')
      return
    }

    let cancelled = false
    setSnipPreview(null)
    setStatus('Preparation de la capture PDF')
    renderPdfPagePreview(pdf, clampPageNumber(snippetPageNumber, pdf.numPages))
      .then((preview) => {
        if (cancelled) return
        setSnipPreview(preview)
        setStatus('Glissez pour capturer une zone PDF')
      })
      .catch(() => {
        if (!cancelled) setStatus('Impossible de preparer la capture PDF')
      })

    return () => {
      cancelled = true
    }
  }, [isSnipping, pdfPageCount, snippetPageNumber])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus('Seuls les fichiers PDF sont pris en charge pour cette version')
      e.target.value = ''
      return
    }

    if (!(await hasPdfMagicBytes(file))) {
      setStatus('Le fichier ne semble pas etre un PDF valide')
      e.target.value = ''
      return
    }

    const document: LocalDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: file.name,
      type: file.type || 'application/pdf',
      size: file.size,
      updatedAt: Date.now(),
      blob: file,
    }

    try {
      await saveDocument(document)
      setDocuments(prev => [document, ...prev])
      setActiveDocumentId(document.id)
      setStatus('Document sauvegarde hors ligne')
    } catch {
      setStatus('Impossible de sauvegarder ce document hors ligne')
    } finally {
      e.target.value = ''
    }
  }

  async function removeDocument(id: string) {
    try {
      await deleteDocument(id)
      setDocuments(prev => {
        const next = prev.filter(item => item.id !== id)
        if (activeDocumentId === id) {
          const replacement = next[0] ?? null
          setActiveDocumentId(replacement?.id ?? null)
          if (replacement) localStorage.setItem(ACTIVE_DOC_KEY, replacement.id)
          else localStorage.removeItem(ACTIVE_DOC_KEY)
        }
        return next
      })
      setStatus('Document supprime du stockage local')
    } catch {
      setStatus('Impossible de supprimer ce document')
    }
  }

  async function handlePinText() {
    const text = window.getSelection()?.toString().trim()
    if (text) {
      onPinSnippet({ id: `pin_${Date.now()}`, content: text, type: 'text' })
      window.getSelection()?.removeAllRanges()
      return
    }

    const pdf = pdfDocumentRef.current
    if (!pdf) {
      setStatus('Texte PDF en preparation')
      return
    }

    const pageNumber = clampPageNumber(snippetPageNumber, pdf.numPages)
    let pageText = extractedPages.find((page) => page.pageNumber === pageNumber) ?? null
    if (!pageText) {
      try {
        setStatus('Extraction du texte de la page')
        pageText = await extractPdfPageText(pdf, pageNumber)
        if (pageText) {
          const extractedPage = pageText
          setExtractedPages(prev => (
            prev.some((page) => page.pageNumber === extractedPage.pageNumber)
              ? prev
              : [...prev, extractedPage].sort((a, b) => a.pageNumber - b.pageNumber)
          ))
        }
      } catch {
        pageText = null
      }
    }

    if (pageText) {
      onPinSnippet({ id: `pin_${Date.now()}`, content: pinnedTextContent(pageText), type: 'text' })
      setStatus('Texte PDF epingle')
      return
    }

    setStatus('Aucun texte extractible sur cette page')
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (!isSnipping || !overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    setSnipStart({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setSnipRect(null)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isSnipping || !snipStart || !overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    setSnipRect({
      x: Math.min(snipStart.x, cx),
      y: Math.min(snipStart.y, cy),
      w: Math.abs(cx - snipStart.x),
      h: Math.abs(cy - snipStart.y),
    })
  }

  async function handleMouseUp(e: React.MouseEvent) {
    let finalRect = snipRect
    if (snipStart && overlayRef.current) {
      const bounds = overlayRef.current.getBoundingClientRect()
      const cx = e.clientX - bounds.left
      const cy = e.clientY - bounds.top
      finalRect = {
        x: Math.min(snipStart.x, cx),
        y: Math.min(snipStart.y, cy),
        w: Math.abs(cx - snipStart.x),
        h: Math.abs(cy - snipStart.y),
      }
    }

    if (!isSnipping || !finalRect || finalRect.w < 10 || finalRect.h < 10) {
      setSnipStart(null)
      setSnipRect(null)
      return
    }

    if (!snipPreview || !overlayRef.current) {
      setStatus('Capture PDF en preparation')
      setSnipStart(null)
      setSnipRect(null)
      return
    }

    const bounds = overlayRef.current.getBoundingClientRect()
    try {
      const snippet = await cropPreviewToPng(snipPreview, finalRect, bounds)
      if (!snippet) {
        setStatus('Selection hors page PDF')
        setSnipStart(null)
        setSnipRect(null)
        return
      }

      onPinSnippet({
        id: `snip_${Date.now()}`,
        content: snippet,
        type: 'image',
      })
      setStatus('Extrait PDF epingle')
    } catch {
      setStatus('Impossible de capturer cette zone')
    }

    setSnipStart(null)
    setSnipRect(null)
    setIsSnipping(false)
  }

  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-50 p-6 text-slate-900">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50">
            <FileText size={30} className="text-indigo-600" />
          </div>
          <p className="text-base font-semibold text-slate-950">Aucun PDF ouvert</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{status}</p>

          {documents.length > 0 && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
              <label htmlFor="local-pdf-select" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Documents locaux
              </label>
              <select
                id="local-pdf-select"
                aria-label="Documents locaux"
                value={activeDocumentId ?? ''}
                onChange={(event) => setActiveDocumentId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="" disabled>Choisir un PDF</option>
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.name} ({formatBytes(document.size)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="mt-5 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-within:ring-2 focus-within:ring-indigo-200">
            <Upload size={16} />
            Importer un PDF
            <input type="file" accept=".pdf,application/pdf" onChange={handleFileUpload} className="hidden" aria-label="Importer un PDF" />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-900">
      <div className="flex min-h-12 flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText size={17} className="flex-shrink-0 text-indigo-600" />
          {documents.length > 0 && (
            <select
              value={activeDocumentId ?? ''}
              onChange={(event) => setActiveDocumentId(event.target.value)}
              className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              title="Documents locaux"
            >
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
          )}
          {activeDocument && (
            <span className="hidden flex-shrink-0 text-xs font-medium text-slate-400 sm:inline">
              {formatBytes(activeDocument.size)}
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">

          <button type="button"
            onClick={handlePinText}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            title="Epingler du texte"
            aria-label="Epingler du texte"
          >
            <Pin size={14} />
          </button>

          {pdfPageCount > 0 && (
            <label className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600" title="Page a epingler">
              <input
                type="number"
                min={1}
                max={pdfPageCount}
                value={snippetPageNumber}
                onChange={(event) => setSnippetPageNumber(clampPageNumber(Number(event.target.value), pdfPageCount))}
                className="h-7 w-10 border-0 bg-transparent p-0 text-center text-xs font-semibold text-slate-700 outline-none"
                aria-label="Page a epingler"
              />
              <span className="text-[10px] font-medium text-slate-400">/{pdfPageCount}</span>
            </label>
          )}

          <button type="button"
            onClick={() => {
              setIsSnipping(!isSnipping)
              setSnipStart(null)
              setSnipRect(null)
            }}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition ${
              isSnipping
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
            }`}
            title={isSnipping ? 'Glissez pour capturer une zone' : 'Capturer une zone'}
            aria-label={isSnipping ? 'Glissez pour capturer une zone' : 'Capturer une zone'}
          >
            <Scissors size={14} />
          </button>

          {isSnipping && (
            <button type="button"
              onClick={() => { setIsSnipping(false); setSnipStart(null); setSnipRect(null) }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              title="Annuler la capture"
            >
              <X size={15} />
            </button>
          )}

          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-within:ring-2 focus-within:ring-indigo-100" title="Changer de PDF">
            <Upload size={14} />
            <input type="file" accept=".pdf,application/pdf" onChange={handleFileUpload} className="hidden" aria-label="Changer de PDF" />
          </label>

          {activeDocumentId && (
            <button type="button"
              onClick={() => removeDocument(activeDocumentId)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              title="Supprimer du stockage local"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-slate-200">
        <iframe
          ref={iframeRef}
          src={pdfUrl}
          className="h-full w-full border-0 bg-white"
          sandbox="allow-downloads"
          title="PDF Viewer"
        />

        {isSnipping && (
          <div
            ref={overlayRef}
            className="absolute inset-0 cursor-crosshair overflow-hidden bg-slate-950/10"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {snipPreview ? (
              <img
                src={snipPreview.url}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full bg-white object-contain"
                draggable={false}
              />
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/85 text-xs font-semibold text-slate-500">
                Preparation de la page...
              </div>
            )}
            {snipRect && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                <rect width="100%" height="100%" fill="rgba(15,23,42,0.08)" />
                <rect
                  x={snipRect.x}
                  y={snipRect.y}
                  width={snipRect.w}
                  height={snipRect.h}
                  fill="rgba(252,211,77,0.2)"
                  stroke="#fbbf24"
                  strokeWidth="2"
                />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
