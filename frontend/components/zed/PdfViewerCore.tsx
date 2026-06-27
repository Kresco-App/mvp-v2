'use client'

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, FileText, Highlighter, MousePointer2, PenLine, StickyNote, Trash2, Type, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import ZedSpinner from './ZedSpinner'
import { ZED_ACTIVE_DOCUMENT_STORAGE_KEY, ZED_LEGACY_ACTIVE_DOCUMENT_STORAGE_KEY, zedStorageGetItem, zedStorageRemoveItem, zedStorageRemoveItemDeferred, zedStorageSetItem, zedStorageSetItemDeferred } from './zedStorage'

export type AnnotationTool = 'select' | 'highlight' | 'draw' | 'text'

export interface ZedDocumentMeta {
  id: string
  name: string
  size: number
  pageCount: number
}

export interface PdfAnnotationStats {
  highlights: number
  drawings: number
  textNotes: number
  total: number
}

interface Props {
  activeTool: AnnotationTool
  onDocumentChange?: (document: ZedDocumentMeta | null) => void
  onAnnotationStatsChange?: (stats: PdfAnnotationStats) => void
}

type LocalDocument = ZedDocumentMeta & { type: string; updatedAt: number; blob: Blob }
type PageSize = { width: number; height: number }
type PdfPoint = { x: number; y: number }
type HighlightAnnotation = { id: string; type: 'highlight'; pageNumber: number; x: number; y: number; width: number; height: number }
type DrawAnnotation = { id: string; type: 'draw'; pageNumber: number; points: PdfPoint[] }
type TextAnnotation = { id: string; type: 'text'; pageNumber: number; x: number; y: number; text: string }
type PdfAnnotation = HighlightAnnotation | DrawAnnotation | TextAnnotation
type AnnotationDraft = { type: 'highlight'; pointerId: number; start: PdfPoint; current: PdfPoint } | { type: 'draw'; pointerId: number; points: PdfPoint[] }
type TextDraft = { annotationId?: string; pageNumber: number; x: number; y: number; text: string }

const DB_NAME = 'kresco_zed_workspace'
const DB_VERSION = 1
const DOC_STORE = 'documents'
const PDF_WORKER_SRC = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] as const
const MAX_PDF_IMAGE_PIXELS = 4_000_000
const ANNOTATION_STORAGE_PREFIX = 'kresco:zed:annotations:v1'
const MIN_ZOOM = 0.7
const MAX_ZOOM = 2.1
const DEFAULT_HIGHLIGHT_WIDTH = 0.18
const DEFAULT_HIGHLIGHT_HEIGHT = 0.04
const LOCAL_PDF_SAVED_STATUS = 'Document sauvegarde hors ligne'
const buttonMotion = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'
const inputMotion = 'transition-[border-color,box-shadow,background-color] duration-150 ease-out motion-reduce:transition-none'
const toolIcons: Record<AnnotationTool, typeof MousePointer2> = {
  select: MousePointer2,
  highlight: Highlighter,
  draw: PenLine,
  text: Type,
}

type PdfJsModule = typeof import('pdfjs-dist')
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

function openDocumentDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DOC_STORE)) db.createObjectStore(DOC_STORE, { keyPath: 'id' })
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
        const valid = await Promise.all(stored.map(async (document) => (
          document.blob && await hasPdfMagicBytes(document.blob) ? document : null
        )))
        resolve(valid.filter((document): document is LocalDocument => Boolean(document)))
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => db.close()
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
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
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
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function hasPdfMagicBytes(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
  return header.length === PDF_MAGIC_BYTES.length && PDF_MAGIC_BYTES.every((byte, index) => header[index] === byte)
}

async function loadPdfDocument(blob: Blob): Promise<PDFDocumentProxy> {
  const [pdfjs, buffer] = await Promise.all([loadPdfJs(), blob.arrayBuffer()])
  return pdfjs.getDocument({ data: new Uint8Array(buffer), enableXfa: false, maxImageSize: MAX_PDF_IMAGE_PIXELS, stopAtErrors: false, useWorkerFetch: false }).promise
}

async function destroyPdfDocument(pdf: PDFDocumentProxy | null) {
  if (!pdf) return
  await pdf.loadingTask.destroy()
}

function annotationStorageKey(documentId: string) {
  return `${ANNOTATION_STORAGE_PREFIX}:${documentId}`
}

function readAnnotations(documentId: string): PdfAnnotation[] {
  const raw = zedStorageGetItem(annotationStorageKey(documentId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(isPdfAnnotation) : []
  } catch {
    return []
  }
}

function writeAnnotations(documentId: string, annotations: PdfAnnotation[]) {
  if (annotations.length === 0) zedStorageRemoveItemDeferred(annotationStorageKey(documentId))
  else zedStorageSetItemDeferred(annotationStorageKey(documentId), JSON.stringify(annotations))
}

function isPdfAnnotation(value: unknown): value is PdfAnnotation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PdfAnnotation>
  if (typeof candidate.id !== 'string' || typeof candidate.pageNumber !== 'number') return false
  if (candidate.type === 'highlight') return typeof candidate.x === 'number' && typeof candidate.y === 'number' && typeof candidate.width === 'number' && typeof candidate.height === 'number'
  if (candidate.type === 'draw') return Array.isArray(candidate.points) && candidate.points.every((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
  return candidate.type === 'text' && typeof candidate.x === 'number' && typeof candidate.y === 'number' && typeof candidate.text === 'string'
}

function annotationStats(annotations: PdfAnnotation[]): PdfAnnotationStats {
  const stats: PdfAnnotationStats = {
    highlights: 0,
    drawings: 0,
    textNotes: 0,
    total: annotations.length,
  }

  for (const annotation of annotations) {
    if (annotation.type === 'highlight') stats.highlights += 1
    else if (annotation.type === 'draw') stats.drawings += 1
    else stats.textNotes += 1
  }

  return stats
}

function createId(prefix: string) {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${randomId}`
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function clampPageNumber(pageNumber: number, pageCount: number) {
  if (pageCount < 1 || !Number.isFinite(pageNumber)) return 1
  return Math.max(1, Math.min(pageCount, Math.floor(pageNumber)))
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
}

function clampUnit(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

function pointFromPointer(event: ReactPointerEvent<HTMLElement>): PdfPoint {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: clampUnit((event.clientX - rect.left) / rect.width), y: clampUnit((event.clientY - rect.top) / rect.height) }
}

function annotationRect(start: PdfPoint, current: PdfPoint) {
  const width = Math.abs(current.x - start.x)
  const height = Math.abs(current.y - start.y)
  if (width < 0.01 && height < 0.01) {
    const x = clampUnit(start.x - DEFAULT_HIGHLIGHT_WIDTH / 2)
    const y = clampUnit(start.y - DEFAULT_HIGHLIGHT_HEIGHT / 2)
    return { x, y, width: Math.min(DEFAULT_HIGHLIGHT_WIDTH, 1 - x), height: Math.min(DEFAULT_HIGHLIGHT_HEIGHT, 1 - y) }
  }
  return { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.max(width, 0.015), height: Math.max(height, 0.015) }
}

function drawPath(points: PdfPoint[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 100} ${point.y * 100}`).join(' ')
}

export default function PdfViewerCore({ activeTool, onDocumentChange, onAnnotationStatsChange }: Props) {
  const [documents, setDocuments] = useState<LocalDocument[]>([])
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState('Upload a PDF to begin')
  const [isImporting, setIsImporting] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [pageSize, setPageSize] = useState<PageSize>({ width: 0, height: 0 })
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [annotationsDocumentId, setAnnotationsDocumentId] = useState<string | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null)
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const [pendingDeleteDocumentId, setPendingDeleteDocumentId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderSequenceRef = useRef(0)
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null
  const currentAnnotations = annotationsDocumentId === activeDocumentId ? annotations : []
  const CurrentToolIcon = toolIcons[activeTool]

  useEffect(() => {
    let cancelled = false
    readAllDocuments()
      .then((items) => {
        if (cancelled) return
        const sorted = items.sort((a, b) => b.updatedAt - a.updatedAt)
        setDocuments(sorted)
        const savedActive = zedStorageGetItem(ZED_ACTIVE_DOCUMENT_STORAGE_KEY, ZED_LEGACY_ACTIVE_DOCUMENT_STORAGE_KEY)
        const active = sorted.find((item) => item.id === savedActive) ?? sorted[0] ?? null
        setActiveDocumentId(active?.id ?? null)
      })
      .catch(() => setStatus('Local PDF storage is unavailable'))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setPendingDeleteDocumentId(null)
    setTextDraft(null)
    setAnnotationDraft(null)
  }, [activeDocumentId])

  useEffect(() => {
    let cancelled = false
    let openedPdf: PDFDocumentProxy | null = null
    setPdfDocument(null)
    setPageCount(0)
    setPageNumber(1)
    setPageSize({ width: 0, height: 0 })

    if (!activeDocument) {
      setAnnotations([])
      setAnnotationsDocumentId(null)
      setStatus(documents.length > 0 ? 'Choose a PDF to open' : 'Upload a PDF to begin')
      onDocumentChange?.(null)
      onAnnotationStatsChange?.(annotationStats([]))
      return () => {
        cancelled = true
      }
    }

    setStatus('Opening PDF')
    setAnnotations(readAnnotations(activeDocument.id))
    setAnnotationsDocumentId(activeDocument.id)
    zedStorageSetItem(ZED_ACTIVE_DOCUMENT_STORAGE_KEY, activeDocument.id, ZED_LEGACY_ACTIVE_DOCUMENT_STORAGE_KEY)

    loadPdfDocument(activeDocument.blob)
      .then((pdf) => {
        openedPdf = pdf
        if (cancelled) {
          void destroyPdfDocument(pdf).catch(() => {})
          return
        }
        setPdfDocument(pdf)
        setPageCount(pdf.numPages)
        setStatus('PDF ready')
        onDocumentChange?.({ id: activeDocument.id, name: activeDocument.name, size: activeDocument.size, pageCount: pdf.numPages })
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('Could not open this PDF')
          onDocumentChange?.(null)
        }
      })

    return () => {
      cancelled = true
      void destroyPdfDocument(openedPdf).catch(() => {})
    }
  // Deliberately key by document id; blobs are large and stable in IndexedDB.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument?.id])

  useEffect(() => {
    if (!activeDocumentId || annotationsDocumentId !== activeDocumentId) return
    writeAnnotations(activeDocumentId, annotations)
    onAnnotationStatsChange?.(annotationStats(annotations))
  }, [activeDocumentId, annotations, annotationsDocumentId, onAnnotationStatsChange])

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return
    let cancelled = false
    const sequence = renderSequenceRef.current + 1
    renderSequenceRef.current = sequence
    setIsRendering(true)
    renderPdfPage(pdfDocument, pageNumber, zoom, canvasRef.current)
      .then((size) => {
        if (cancelled || renderSequenceRef.current !== sequence) return
        setPageSize(size)
        setStatus('PDF ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('Could not render this page')
      })
      .finally(() => {
        if (!cancelled && renderSequenceRef.current === sequence) setIsRendering(false)
      })
    return () => {
      cancelled = true
    }
  }, [pageNumber, pdfDocument, zoom])

  function updateAnnotations(updater: (items: PdfAnnotation[]) => PdfAnnotation[]) {
    if (!activeDocumentId) return
    const documentId = activeDocumentId
    setAnnotations((current) => updater(annotationsDocumentId === documentId ? current : readAnnotations(documentId)))
    setAnnotationsDocumentId(documentId)
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await importPdfFile(file)
    event.target.value = ''
  }

  async function importPdfFile(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus('Only PDF files are supported')
      return
    }
    setIsImporting(true)
    setStatus('Checking PDF')
    try {
      if (!(await hasPdfMagicBytes(file))) {
        setStatus('This file does not look like a valid PDF')
        return
      }
      const document: LocalDocument = {
        id: createId('doc'),
        name: file.name,
        type: file.type || 'application/pdf',
        size: file.size,
        pageCount: 0,
        updatedAt: Date.now(),
        blob: file,
      }
      setStatus('Saving PDF locally')
      await saveDocument(document)
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)])
      setActiveDocumentId(document.id)
      setStatus(LOCAL_PDF_SAVED_STATUS)
    } catch {
      setStatus('Could not save this PDF locally')
    } finally {
      setIsImporting(false)
    }
  }

  async function removeDocument(id: string) {
    try {
      await deleteDocument(id)
      zedStorageRemoveItem(annotationStorageKey(id))
      setDocuments((current) => {
        const next = current.filter((item) => item.id !== id)
        if (activeDocumentId === id) {
          const replacement = next[0] ?? null
          setActiveDocumentId(replacement?.id ?? null)
          if (!replacement) zedStorageRemoveItem(ZED_ACTIVE_DOCUMENT_STORAGE_KEY, ZED_LEGACY_ACTIVE_DOCUMENT_STORAGE_KEY)
        }
        return next
      })
      setStatus('PDF removed from this device')
    } catch {
      setStatus('Could not remove this PDF')
    } finally {
      setPendingDeleteDocumentId(null)
    }
  }

  function handlePagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pdfDocument || activeTool === 'select' || pageSize.width === 0) return
    if ((event.target as HTMLElement).closest('button,input,select,textarea')) return
    const point = pointFromPointer(event)
    if (activeTool === 'text') {
      setTextDraft({ pageNumber, x: point.x, y: point.y, text: '' })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setTextDraft(null)
    setAnnotationDraft(activeTool === 'highlight'
      ? { type: 'highlight', pointerId: event.pointerId, start: point, current: point }
      : { type: 'draw', pointerId: event.pointerId, points: [point] })
  }

  function handlePagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!annotationDraft || annotationDraft.pointerId !== event.pointerId) return
    const point = pointFromPointer(event)
    if (annotationDraft.type === 'highlight') {
      setAnnotationDraft({ ...annotationDraft, current: point })
      return
    }
    const last = annotationDraft.points[annotationDraft.points.length - 1]
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.004) return
    setAnnotationDraft({ ...annotationDraft, points: [...annotationDraft.points, point] })
  }

  function finishPagePointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!annotationDraft || annotationDraft.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const draft = annotationDraft
    setAnnotationDraft(null)
    if (draft.type === 'highlight') {
      updateAnnotations((items) => [...items, { id: createId('highlight'), type: 'highlight', pageNumber, ...annotationRect(draft.start, draft.current) }])
      setStatus('Highlight saved')
      return
    }
    updateAnnotations((items) => [...items, { id: createId('ink'), type: 'draw', pageNumber, points: draft.points }])
    setStatus('Ink saved')
  }

  function saveTextDraft() {
    if (!textDraft) return
    const text = textDraft.text.trim()
    if (!text) {
      setTextDraft(null)
      return
    }
    updateAnnotations((items) => {
      if (textDraft.annotationId) return items.map((item) => item.id === textDraft.annotationId && item.type === 'text' ? { ...item, text } : item)
      return [...items, { id: createId('note'), type: 'text', pageNumber: textDraft.pageNumber, x: textDraft.x, y: textDraft.y, text }]
    })
    setTextDraft(null)
    setStatus('Text note saved')
  }

  function deleteTextDraft() {
    if (!textDraft?.annotationId) {
      setTextDraft(null)
      return
    }
    updateAnnotations((items) => items.filter((item) => item.id !== textDraft.annotationId))
    setTextDraft(null)
    setStatus('Text note removed')
  }

  function clearCurrentPageAnnotations() {
    updateAnnotations((items) => items.filter((item) => item.pageNumber !== pageNumber))
    setTextDraft(null)
    setStatus('Page annotations cleared')
  }

  const zoomPercent = Math.round(zoom * 100)
  const pageAnnotationCount = currentAnnotations.filter((item) => item.pageNumber === pageNumber).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f5f8] text-slate-950">
      <div className="flex min-h-14 flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex min-w-[13rem] flex-1 items-center gap-2">
          <FileText size={17} className="shrink-0 text-indigo-600" />
          {documents.length > 0 ? (
            <select value={activeDocumentId ?? ''} onChange={(event) => setActiveDocumentId(event.target.value || null)} className={`h-10 min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`} aria-label="Open local PDF">
              {documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
            </select>
          ) : (
            <p className="truncate text-sm font-bold text-slate-900">No PDF open</p>
          )}
          {activeDocument && <span className="hidden text-xs tabular-nums text-slate-500 sm:block">{formatBytes(activeDocument.size)}</span>}
        </div>

        <ToolbarButton label="Previous page" disabled={!pdfDocument || pageNumber <= 1} onClick={() => setPageNumber((current) => clampPageNumber(current - 1, pageCount))}><ChevronLeft size={16} /></ToolbarButton>
        <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold tabular-nums text-slate-700">{pageNumber}/{pageCount || 1}</span>
        <ToolbarButton label="Next page" disabled={!pdfDocument || pageNumber >= pageCount} onClick={() => setPageNumber((current) => clampPageNumber(current + 1, pageCount))}><ChevronRight size={16} /></ToolbarButton>
        <ToolbarButton label="Zoom out" disabled={!pdfDocument} onClick={() => setZoom((current) => clampZoom(current - 0.1))}><ZoomOut size={15} /></ToolbarButton>
        <span className="min-w-12 text-center text-xs font-bold tabular-nums text-slate-700">{zoomPercent}%</span>
        <ToolbarButton label="Zoom in" disabled={!pdfDocument} onClick={() => setZoom((current) => clampZoom(current + 0.1))}><ZoomIn size={15} /></ToolbarButton>

        <div className="order-last flex min-h-8 w-full items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-500 sm:order-none sm:w-auto sm:max-w-[18rem]">
          {isImporting || isRendering ? <ZedSpinner size={13} className="shrink-0 text-indigo-500" /> : <CurrentToolIcon size={13} className="shrink-0 text-slate-400" />}
          <span className="truncate" role="status" aria-live="polite">{isRendering ? 'Rendering page' : status}</span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ToolbarButton label="Clear current page annotations" disabled={!pdfDocument || pageAnnotationCount === 0} onClick={clearCurrentPageAnnotations}><Highlighter size={15} /></ToolbarButton>
          <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white ${buttonMotion} hover:bg-indigo-700`}>
            {isImporting ? <ZedSpinner size={15} /> : <Upload size={15} />}
            <span className="hidden sm:inline">{activeDocument ? 'Add PDF' : 'Upload PDF'}</span>
            <input type="file" accept=".pdf,application/pdf" onChange={handleFileUpload} disabled={isImporting} className="hidden" aria-label="Upload PDF" />
          </label>
          {activeDocumentId && (
            <ToolbarButton
              label={pendingDeleteDocumentId === activeDocumentId ? 'Confirm PDF deletion' : 'Delete local PDF'}
              onClick={() => {
                if (pendingDeleteDocumentId === activeDocumentId) {
                  void removeDocument(activeDocumentId)
                  return
                }
                setPendingDeleteDocumentId(activeDocumentId)
                setStatus('Click delete again to remove this local PDF')
              }}
              tone={pendingDeleteDocumentId === activeDocumentId ? 'danger' : 'default'}
            >
              <Trash2 size={15} />
            </ToolbarButton>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[#eef0f4] p-4">
        {!activeDocument ? (
          <EmptyPdfState isImporting={isImporting} status={status} onUpload={handleFileUpload} />
        ) : (
          <div className="mx-auto w-max max-w-full">
            <div
              className="relative bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] ring-1 ring-black/10"
              style={{ width: pageSize.width ? `${pageSize.width}px` : undefined, minHeight: pageSize.height ? undefined : 540 }}
              onPointerDown={handlePagePointerDown}
              onPointerMove={handlePagePointerMove}
              onPointerUp={finishPagePointer}
              onPointerCancel={finishPagePointer}
            >
              <canvas ref={canvasRef} className="block bg-white" />
              <AnnotationLayer
                activeTool={activeTool}
                annotations={currentAnnotations.filter((item) => item.pageNumber === pageNumber)}
                draft={annotationDraft}
                pageSize={pageSize}
                onEditText={(annotation) => setTextDraft({ annotationId: annotation.id, pageNumber: annotation.pageNumber, x: annotation.x, y: annotation.y, text: annotation.text })}
              />
              {textDraft && textDraft.pageNumber === pageNumber && <TextNoteEditor draft={textDraft} onChange={(text) => setTextDraft((current) => current ? { ...current, text } : current)} onCancel={() => setTextDraft(null)} onDelete={textDraft.annotationId ? deleteTextDraft : undefined} onSave={saveTextDraft} />}
              {isRendering && (
                <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-[var(--shadow-border)]"><ZedSpinner size={14} className="text-indigo-500" />Rendering</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolbarButton({ children, disabled, label, onClick, tone = 'default' }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void; tone?: 'default' | 'danger' }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-[var(--shadow-border)] ${buttonMotion} disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${tone === 'danger' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`} aria-label={label} title={label}>
      {children}
    </button>
  )
}

function EmptyPdfState({ isImporting, status, onUpload }: { isImporting: boolean; status: string; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center">
      <div className="w-full max-w-[34rem] rounded-[28px] bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.12)] ring-1 ring-black/10">
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-8 py-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><FileText size={30} /></div>
          <h2 className="mt-5 text-balance text-2xl font-bold text-slate-950">Open a PDF and work on it</h2>
          <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-6 text-slate-500">Files, notes, and annotations stay on this device for now.</p>
          <label className={`mt-6 inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white ${buttonMotion} hover:bg-indigo-700`}>
            {isImporting ? <ZedSpinner size={16} /> : <Upload size={16} />}
            {isImporting ? 'Importing...' : 'Upload PDF'}
            <input type="file" accept=".pdf,application/pdf" onChange={onUpload} disabled={isImporting} className="hidden" aria-label="Upload PDF" />
          </label>
          <p className="mt-4 min-h-5 text-xs font-semibold text-slate-500">{status}</p>
        </div>
      </div>
    </div>
  )
}

function AnnotationLayer({ activeTool, annotations, draft, onEditText, pageSize }: { activeTool: AnnotationTool; annotations: PdfAnnotation[]; draft: AnnotationDraft | null; onEditText: (annotation: TextAnnotation) => void; pageSize: PageSize }) {
  if (!pageSize.width || !pageSize.height) return null
  const drawAnnotations = annotations.filter((annotation): annotation is DrawAnnotation => annotation.type === 'draw')
  const textAnnotations = annotations.filter((annotation): annotation is TextAnnotation => annotation.type === 'text')
  const highlightDraftRect = draft?.type === 'highlight' ? annotationRect(draft.start, draft.current) : null

  return (
    <>
      <div className="pointer-events-none absolute inset-0">
        {annotations.map((annotation) => annotation.type === 'highlight' ? <span key={annotation.id} className="absolute rounded-[3px] bg-yellow-300/45 ring-1 ring-yellow-500/40" style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, width: `${annotation.width * 100}%`, height: `${annotation.height * 100}%` }} /> : null)}
        {highlightDraftRect && <span className="absolute rounded-[3px] bg-yellow-300/35 ring-1 ring-yellow-500/50" style={{ left: `${highlightDraftRect.x * 100}%`, top: `${highlightDraftRect.y * 100}%`, width: `${highlightDraftRect.width * 100}%`, height: `${highlightDraftRect.height * 100}%` }} />}
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {drawAnnotations.map((annotation) => annotation.points.length === 1
            ? <circle key={annotation.id} cx={annotation.points[0].x * 100} cy={annotation.points[0].y * 100} r="0.45" className="fill-indigo-600/85" />
            : <path key={annotation.id} d={drawPath(annotation.points)} className="fill-none stroke-indigo-600/85" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.45" vectorEffect="non-scaling-stroke" />)}
          {draft?.type === 'draw' && <path d={drawPath(draft.points)} className="fill-none stroke-indigo-500/80" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.45" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>

      {textAnnotations.map((annotation) => (
        <button key={annotation.id} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onEditText(annotation)} className={`absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-amber-100 text-amber-700 shadow-[var(--shadow-border)] ring-1 ring-amber-200 ${buttonMotion} hover:bg-amber-200`} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }} aria-label={`Edit note: ${annotation.text}`} title={annotation.text}>
          <StickyNote size={16} />
        </button>
      ))}

      {activeTool !== 'select' && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold text-white shadow-[var(--shadow-border)]">
          {activeTool === 'highlight' ? 'Drag to highlight' : activeTool === 'draw' ? 'Draw on the page' : 'Click to add a note'}
        </div>
      )}
    </>
  )
}

function TextNoteEditor({ draft, onCancel, onChange, onDelete, onSave }: { draft: TextDraft; onCancel: () => void; onChange: (text: string) => void; onDelete?: () => void; onSave: () => void }) {
  return (
    <div className="absolute z-10 w-[min(18rem,calc(100%-1rem))] -translate-x-3 rounded-2xl bg-white p-3 shadow-[0_18px_42px_rgba(15,23,42,0.22)] ring-1 ring-black/10" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} onPointerDown={(event) => event.stopPropagation()}>
      <label className="text-xs font-bold text-slate-500" htmlFor="zed-pdf-text-note">PDF note</label>
      <textarea id="zed-pdf-text-note" value={draft.text} onChange={(event) => onChange(event.target.value)} rows={4} autoFocus placeholder="Write a note for this spot." className={`mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold leading-5 text-slate-900 outline-none ${inputMotion} placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100`} />
      <div className="mt-2 flex items-center justify-between gap-2">
        {onDelete ? <button type="button" onClick={onDelete} className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-bold text-red-600 ${buttonMotion} hover:bg-red-50`}>Delete</button> : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-bold text-slate-500 ${buttonMotion} hover:bg-slate-100 hover:text-slate-950`}>Cancel</button>
          <button type="button" onClick={onSave} className={`inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white ${buttonMotion} hover:bg-indigo-700`}>Save</button>
        </div>
      </div>
    </div>
  )
}

async function renderPdfPage(pdf: PDFDocumentProxy, pageNumber: number, zoom: number, canvas: HTMLCanvasElement): Promise<PageSize> {
  const page: PDFPageProxy = await pdf.getPage(pageNumber)
  try {
    const viewport = page.getViewport({ scale: zoom })
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context unavailable')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    await page.render({ canvas, canvasContext: context, viewport }).promise
    return { width: viewport.width, height: viewport.height }
  } finally {
    page.cleanup()
  }
}
