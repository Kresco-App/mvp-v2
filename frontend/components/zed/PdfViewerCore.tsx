'use client'

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, FileText, Trash2, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import ZedSpinner from './ZedSpinner'
import { ZED_ACTIVE_DOCUMENT_STORAGE_KEY, ZED_LEGACY_ACTIVE_DOCUMENT_STORAGE_KEY, zedStorageGetItem, zedStorageRemoveItem, zedStorageRemoveItemDeferred, zedStorageSetItem, zedStorageSetItemDeferred } from './zedStorage'

export type AnnotationTool = 'select' | 'highlight' | 'draw' | 'text' | 'delete'

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
type TextNoteColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'violet'
type HighlightAnnotation = { id: string; type: 'highlight'; pageNumber: number; x: number; y: number; width: number; height: number }
type DrawAnnotation = { id: string; type: 'draw'; pageNumber: number; points: PdfPoint[] }
type TextAnnotation = { id: string; type: 'text'; pageNumber: number; x: number; y: number; text: string; color?: TextNoteColor }
type PdfAnnotation = HighlightAnnotation | DrawAnnotation | TextAnnotation
type AnnotationDraft = { type: 'highlight'; pointerId: number; start: PdfPoint; current: PdfPoint } | { type: 'draw'; pointerId: number; points: PdfPoint[] }
type TextDraft = { annotationId?: string; pageNumber: number; x: number; y: number; text: string; color: TextNoteColor }
type PagePanDraft = { pointerId: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number }
type TextMoveDraft = { annotationId: string; pointerId: number; startClientX: number; startClientY: number; startX: number; startY: number; moved: boolean }
type EraserDraft = { pointerId: number; ids: Set<string>; point: PdfPoint }
type RenderedPdfPage = { canvas: HTMLCanvasElement; size: PageSize }

const DB_NAME = 'kresco_zed_workspace'
const DB_VERSION = 1
const DOC_STORE = 'documents'
const PDF_WORKER_SRC = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] as const
const MAX_PDF_IMAGE_PIXELS = 4_000_000
const ANNOTATION_STORAGE_PREFIX = 'kresco:zed:annotations:v1'
const MIN_ZOOM = 0.7
const MAX_ZOOM = 2.1
const MIN_HIGHLIGHT_DRAG_DISTANCE = 0.012
const MIN_DRAW_DRAG_DISTANCE = 0.008
const ERASER_RADIUS_PX = 18
const INK_STROKE_WIDTH = '0.92'
const DEFAULT_TEXT_NOTE_COLOR: TextNoteColor = 'amber'
const LOCAL_PDF_SAVED_STATUS = 'Document sauvegarde hors ligne'
const buttonMotion = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'
const inputMotion = 'transition-[border-color,box-shadow,background-color] duration-150 ease-out motion-reduce:transition-none'

const TEXT_NOTE_COLOR_OPTIONS = [
  {
    value: 'amber',
    label: 'Amber',
    noteClass: 'bg-amber-200/35 text-slate-950 ring-1 ring-amber-400/60 hover:bg-amber-200/45',
    editorClass: 'bg-amber-50/80 ring-amber-300/75',
    swatchClass: 'bg-amber-300',
  },
  {
    value: 'sky',
    label: 'Blue',
    noteClass: 'bg-sky-200/30 text-slate-950 ring-1 ring-sky-400/60 hover:bg-sky-200/45',
    editorClass: 'bg-sky-50/80 ring-sky-300/75',
    swatchClass: 'bg-sky-300',
  },
  {
    value: 'emerald',
    label: 'Green',
    noteClass: 'bg-emerald-200/30 text-slate-950 ring-1 ring-emerald-400/60 hover:bg-emerald-200/45',
    editorClass: 'bg-emerald-50/80 ring-emerald-300/75',
    swatchClass: 'bg-emerald-300',
  },
  {
    value: 'rose',
    label: 'Rose',
    noteClass: 'bg-rose-200/30 text-slate-950 ring-1 ring-rose-400/60 hover:bg-rose-200/45',
    editorClass: 'bg-rose-50/80 ring-rose-300/75',
    swatchClass: 'bg-rose-300',
  },
  {
    value: 'violet',
    label: 'Violet',
    noteClass: 'bg-violet-200/30 text-slate-950 ring-1 ring-violet-400/60 hover:bg-violet-200/45',
    editorClass: 'bg-violet-50/80 ring-violet-300/75',
    swatchClass: 'bg-violet-300',
  },
] as const

function isTextNoteColor(value: unknown): value is TextNoteColor {
  return TEXT_NOTE_COLOR_OPTIONS.some((option) => option.value === value)
}

function textNoteColorOption(value: unknown) {
  return TEXT_NOTE_COLOR_OPTIONS.find((option) => option.value === value) ?? TEXT_NOTE_COLOR_OPTIONS[0]
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
  const candidate = value as Partial<PdfAnnotation> & { color?: unknown }
  if (typeof candidate.id !== 'string' || typeof candidate.pageNumber !== 'number') return false
  if (candidate.type === 'highlight') return typeof candidate.x === 'number' && typeof candidate.y === 'number' && typeof candidate.width === 'number' && typeof candidate.height === 'number'
  if (candidate.type === 'draw') return Array.isArray(candidate.points) && candidate.points.every((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
  return candidate.type === 'text' && typeof candidate.x === 'number' && typeof candidate.y === 'number' && typeof candidate.text === 'string' && (candidate.color === undefined || isTextNoteColor(candidate.color))
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
  return { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.max(width, 0.015), height: Math.max(height, 0.015) }
}

function isMeaningfulHighlightDrag(start: PdfPoint, current: PdfPoint) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= MIN_HIGHLIGHT_DRAG_DISTANCE
}

function isMeaningfulDrawStroke(points: PdfPoint[]) {
  const start = points[0]
  if (!start) return false
  return points.some((point) => Math.hypot(point.x - start.x, point.y - start.y) >= MIN_DRAW_DRAG_DISTANCE)
}

function drawPath(points: PdfPoint[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 100} ${point.y * 100}`).join(' ')
}

function pointToPagePixels(point: PdfPoint, pageSize: PageSize) {
  return { x: point.x * pageSize.width, y: point.y * pageSize.height }
}

function distanceToSegment(point: PdfPoint, start: PdfPoint, end: PdfPoint, pageSize: PageSize) {
  const target = pointToPagePixels(point, pageSize)
  const segmentStart = pointToPagePixels(start, pageSize)
  const segmentEnd = pointToPagePixels(end, pageSize)
  const dx = segmentEnd.x - segmentStart.x
  const dy = segmentEnd.y - segmentStart.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) return Math.hypot(target.x - segmentStart.x, target.y - segmentStart.y)

  const t = Math.max(0, Math.min(1, ((target.x - segmentStart.x) * dx + (target.y - segmentStart.y) * dy) / lengthSquared))
  const projection = { x: segmentStart.x + t * dx, y: segmentStart.y + t * dy }
  return Math.hypot(target.x - projection.x, target.y - projection.y)
}

function eraserHitsHighlight(annotation: HighlightAnnotation, point: PdfPoint, pageSize: PageSize) {
  const radiusX = ERASER_RADIUS_PX / pageSize.width
  const radiusY = ERASER_RADIUS_PX / pageSize.height
  return point.x >= annotation.x - radiusX
    && point.x <= annotation.x + annotation.width + radiusX
    && point.y >= annotation.y - radiusY
    && point.y <= annotation.y + annotation.height + radiusY
}

function eraserHitsDraw(annotation: DrawAnnotation, point: PdfPoint, pageSize: PageSize) {
  if (annotation.points.length === 0) return false
  if (annotation.points.length === 1) {
    return distanceToSegment(point, annotation.points[0], annotation.points[0], pageSize) <= ERASER_RADIUS_PX
  }

  for (let index = 1; index < annotation.points.length; index += 1) {
    if (distanceToSegment(point, annotation.points[index - 1], annotation.points[index], pageSize) <= ERASER_RADIUS_PX) return true
  }

  return false
}

function eraserHitsText(annotation: TextAnnotation, point: PdfPoint, pageSize: PageSize) {
  const radiusX = ERASER_RADIUS_PX / pageSize.width
  const radiusY = ERASER_RADIUS_PX / pageSize.height
  const lines = Math.max(1, annotation.text.split(/\r?\n/).length)
  const width = Math.min(224 / pageSize.width, 0.34)
  const height = Math.min((lines * 18 + 14) / pageSize.height, 0.2)
  const x = annotation.x - 8 / pageSize.width
  const y = annotation.y - 4 / pageSize.height

  return point.x >= x - radiusX
    && point.x <= x + width + radiusX
    && point.y >= y - radiusY
    && point.y <= y + height + radiusY
}

function eraserHitsAnnotation(annotation: PdfAnnotation, point: PdfPoint, pageSize: PageSize) {
  if (annotation.type === 'highlight') return eraserHitsHighlight(annotation, point, pageSize)
  if (annotation.type === 'draw') return eraserHitsDraw(annotation, point, pageSize)
  return eraserHitsText(annotation, point, pageSize)
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
  const [pageSize, setPageSize] = useState<PageSize>({ width: 0, height: 0 })
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [annotationsDocumentId, setAnnotationsDocumentId] = useState<string | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null)
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const [pendingDeleteDocumentId, setPendingDeleteDocumentId] = useState<string | null>(null)
  const [isPagePanning, setIsPagePanning] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pagePanDraftRef = useRef<PagePanDraft | null>(null)
  const pendingZoomAnchorRef = useRef<{ xRatio: number; yRatio: number } | null>(null)
  const renderedPageRef = useRef<{ documentId: string | null; pageNumber: number } | null>(null)
  const renderSequenceRef = useRef(0)
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null
  const currentAnnotations = annotationsDocumentId === activeDocumentId ? annotations : []

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
    pagePanDraftRef.current = null
    renderedPageRef.current = null
    setIsPagePanning(false)
  }, [activeDocumentId])

  useEffect(() => {
    pagePanDraftRef.current = null
    setIsPagePanning(false)
  }, [activeTool, pageNumber, zoom])

  useEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    if (!anchor) return

    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current
      if (!viewport) return

      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      viewport.scrollLeft = Math.max(0, Math.min(maxScrollLeft, anchor.xRatio * viewport.scrollWidth - viewport.clientWidth / 2))
      viewport.scrollTop = Math.max(0, Math.min(maxScrollTop, anchor.yRatio * viewport.scrollHeight - viewport.clientHeight / 2))
      pendingZoomAnchorRef.current = null
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pageSize.height, pageSize.width])

  useEffect(() => {
    let cancelled = false
    let openedPdf: PDFDocumentProxy | null = null
    setPdfDocument(null)
    setPageCount(0)
    setPageNumber(1)
    setPageSize({ width: 0, height: 0 })
    renderedPageRef.current = null

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
    renderPdfPage(pdfDocument, pageNumber, zoom)
      .then((renderedPage) => {
        if (cancelled || renderSequenceRef.current !== sequence) return
        const canvas = canvasRef.current
        if (!canvas) return
        commitRenderedPdfPage(renderedPage, canvas)
        renderedPageRef.current = { documentId: activeDocumentId, pageNumber }
        setPageSize(renderedPage.size)
        setStatus('PDF ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('Could not render this page')
      })
    return () => {
      cancelled = true
    }
  }, [activeDocumentId, pageNumber, pdfDocument, zoom])

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
    if (!pdfDocument || pageSize.width === 0) return
    if ((event.target as HTMLElement).closest('button,input,select,textarea')) return
    if (activeTool === 'select') {
      startPagePan(event)
      return
    }
    if (activeTool === 'delete') {
      setTextDraft(null)
      return
    }
    const point = pointFromPointer(event)
    if (activeTool === 'text') {
      setTextDraft({ pageNumber, x: point.x, y: point.y, text: '', color: DEFAULT_TEXT_NOTE_COLOR })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setTextDraft(null)
    setAnnotationDraft(activeTool === 'highlight'
      ? { type: 'highlight', pointerId: event.pointerId, start: point, current: point }
      : { type: 'draw', pointerId: event.pointerId, points: [point] })
  }

  function handlePagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pagePanDraftRef.current?.pointerId === event.pointerId) {
      movePagePan(event)
      return
    }
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
    if (pagePanDraftRef.current?.pointerId === event.pointerId) {
      finishPagePan(event)
      return
    }
    if (!annotationDraft || annotationDraft.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const draft = annotationDraft
    setAnnotationDraft(null)
    if (draft.type === 'highlight') {
      if (!isMeaningfulHighlightDrag(draft.start, draft.current)) return
      updateAnnotations((items) => [...items, { id: createId('highlight'), type: 'highlight', pageNumber, ...annotationRect(draft.start, draft.current) }])
      setStatus('Highlight saved')
      return
    }
    if (!isMeaningfulDrawStroke(draft.points)) return
    updateAnnotations((items) => [...items, { id: createId('ink'), type: 'draw', pageNumber, points: draft.points }])
    setStatus('Ink saved')
  }

  function startPagePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const viewport = viewportRef.current
    if (!viewport || (viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight)) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pagePanDraftRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    }
    setTextDraft(null)
    setIsPagePanning(true)
  }

  function movePagePan(event: ReactPointerEvent<HTMLDivElement>) {
    const draft = pagePanDraftRef.current
    const viewport = viewportRef.current
    if (!draft || !viewport) return

    event.preventDefault()
    viewport.scrollLeft = draft.startScrollLeft - (event.clientX - draft.startClientX)
    viewport.scrollTop = draft.startScrollTop - (event.clientY - draft.startClientY)
  }

  function finishPagePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    pagePanDraftRef.current = null
    setIsPagePanning(false)
  }

  function saveTextDraft() {
    if (!textDraft) return
    const text = textDraft.text.trim()
    if (!text) {
      setTextDraft(null)
      return
    }
    updateAnnotations((items) => {
      const color = textNoteColorOption(textDraft.color).value
      if (textDraft.annotationId) return items.map((item) => item.id === textDraft.annotationId && item.type === 'text' ? { ...item, text, color } : item)
      return [...items, { id: createId('note'), type: 'text', pageNumber: textDraft.pageNumber, x: textDraft.x, y: textDraft.y, text, color }]
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

  function deleteAnnotation(annotationId: string) {
    updateAnnotations((items) => items.filter((item) => item.id !== annotationId))
    setTextDraft((current) => current?.annotationId === annotationId ? null : current)
    setStatus('Annotation deleted')
  }

  function deleteAnnotations(annotationIds: string[]) {
    if (annotationIds.length === 0) return
    const ids = new Set(annotationIds)
    updateAnnotations((items) => items.filter((item) => !ids.has(item.id)))
    setTextDraft((current) => current?.annotationId && ids.has(current.annotationId) ? null : current)
    setStatus(`${annotationIds.length} annotation${annotationIds.length === 1 ? '' : 's'} deleted`)
  }

  function moveTextAnnotation(annotationId: string, point: PdfPoint) {
    const nextPoint = { x: clampUnit(point.x), y: clampUnit(point.y) }
    updateAnnotations((items) => items.map((item) => item.id === annotationId && item.type === 'text' ? { ...item, ...nextPoint } : item))
    setTextDraft((current) => current?.annotationId === annotationId ? { ...current, ...nextPoint } : current)
  }

  function clearCurrentPageAnnotations() {
    updateAnnotations((items) => items.filter((item) => item.pageNumber !== pageNumber))
    setTextDraft(null)
    setStatus('Page annotations cleared')
  }

  function changeZoom(delta: number) {
    const viewport = viewportRef.current
    if (viewport) {
      pendingZoomAnchorRef.current = {
        xRatio: (viewport.scrollLeft + viewport.clientWidth / 2) / Math.max(1, viewport.scrollWidth),
        yRatio: (viewport.scrollTop + viewport.clientHeight / 2) / Math.max(1, viewport.scrollHeight),
      }
    }
    setZoom((current) => {
      const next = clampZoom(current + delta)
      if (next === current) pendingZoomAnchorRef.current = null
      return next
    })
  }

  const zoomPercent = Math.round(zoom * 100)
  const pageAnnotationCount = currentAnnotations.filter((item) => item.pageNumber === pageNumber).length
  const pageCursorClass = activeTool === 'highlight' || activeTool === 'draw'
    ? 'cursor-crosshair'
    : activeTool === 'text'
      ? 'cursor-text'
      : activeTool === 'delete'
        ? 'cursor-default'
        : isPagePanning
          ? 'cursor-grabbing'
          : 'cursor-grab'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f5f8] text-slate-950">
      <div className="flex min-h-14 flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex w-full max-w-[22rem] flex-none items-center gap-2 sm:w-[20rem] lg:w-[22rem]">
          {documents.length > 0 ? (
            <select value={activeDocumentId ?? ''} onChange={(event) => setActiveDocumentId(event.target.value || null)} className={`h-10 min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`} aria-label="Open local PDF" title={activeDocument?.name ?? 'Open local PDF'}>
              {documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
            </select>
          ) : (
            <p className="truncate text-sm font-bold text-slate-900">Open a PDF</p>
          )}
        </div>

        <PageControl
          canGoBack={Boolean(pdfDocument) && pageNumber > 1}
          canGoForward={Boolean(pdfDocument) && pageNumber < pageCount}
          pageCount={pageCount}
          pageNumber={pageNumber}
          onBack={() => setPageNumber((current) => clampPageNumber(current - 1, pageCount))}
          onForward={() => setPageNumber((current) => clampPageNumber(current + 1, pageCount))}
        />
        <ZoomControl
          disabled={!pdfDocument}
          percent={zoomPercent}
          onZoomIn={() => changeZoom(0.1)}
          onZoomOut={() => changeZoom(-0.1)}
        />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {pdfDocument && pageAnnotationCount > 0 && (
            <button
              type="button"
              onClick={clearCurrentPageAnnotations}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-50 px-3 text-xs font-bold text-amber-700 shadow-[var(--shadow-border)] ${buttonMotion} hover:bg-amber-100`}
              aria-label={`Clear ${pageAnnotationCount} annotations on current page`}
              title={`Clear ${pageAnnotationCount} annotations on current page`}
            >
              <Trash2 size={14} />
              <span className="tabular-nums">Clear {pageAnnotationCount}</span>
            </button>
          )}
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

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[#eef0f4] p-4">
        {!activeDocument ? (
          <EmptyPdfState isImporting={isImporting} status={status} onUpload={handleFileUpload} />
        ) : (
          <div className="mx-auto w-max">
            <div
              className={`relative touch-none select-none bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] ring-1 ring-black/10 ${pageCursorClass}`}
              data-zed-pdf-page
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
                onDeleteAnnotation={deleteAnnotation}
                onDeleteAnnotations={deleteAnnotations}
                onEditText={(annotation) => setTextDraft({ annotationId: annotation.id, pageNumber: annotation.pageNumber, x: annotation.x, y: annotation.y, text: annotation.text, color: textNoteColorOption(annotation.color).value })}
                onMoveText={moveTextAnnotation}
              />
              {textDraft && textDraft.pageNumber === pageNumber && <TextNoteEditor draft={textDraft} onChange={(text) => setTextDraft((current) => current ? { ...current, text } : current)} onColorChange={(color) => setTextDraft((current) => current ? { ...current, color } : current)} onCancel={() => setTextDraft(null)} onDelete={textDraft.annotationId ? deleteTextDraft : undefined} onSave={saveTextDraft} />}
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

function PageControl({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  pageCount,
  pageNumber,
}: {
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  pageCount: number
  pageNumber: number
}) {
  return (
    <div className="inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl bg-slate-100 shadow-[var(--shadow-border)]" role="group" aria-label="PDF page navigation">
      <button
        type="button"
        disabled={!canGoBack}
        onClick={onBack}
        className={`inline-flex h-10 min-w-10 items-center justify-center gap-1 px-2 text-xs font-bold text-slate-600 ${buttonMotion} hover:bg-white hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100`}
        aria-label="Go to previous page"
        title="Back"
      >
        <ChevronLeft size={15} />
        <span className="hidden min-[1180px]:inline">Back</span>
      </button>
      <span className="grid h-10 min-w-12 place-items-center px-2 text-center text-xs font-black tabular-nums text-slate-700" aria-live="polite">
        {pageNumber}/{pageCount || 1}
      </span>
      <button
        type="button"
        disabled={!canGoForward}
        onClick={onForward}
        className={`inline-flex h-10 min-w-10 items-center justify-center gap-1 px-2 text-xs font-bold text-slate-600 ${buttonMotion} hover:bg-white hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100`}
        aria-label="Go to next page"
        title="Forward"
      >
        <span className="hidden min-[1180px]:inline">Forward</span>
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

function ZoomControl({ disabled, onZoomIn, onZoomOut, percent }: { disabled: boolean; onZoomIn: () => void; onZoomOut: () => void; percent: number }) {
  return (
    <div className="inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl bg-slate-100 shadow-[var(--shadow-border)]" role="group" aria-label="PDF zoom controls">
      <button
        type="button"
        disabled={disabled}
        onClick={onZoomOut}
        className={`grid h-10 w-10 place-items-center text-slate-600 ${buttonMotion} hover:bg-white hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100`}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <ZoomOut size={15} />
      </button>
      <span className="grid h-10 min-w-14 place-items-center px-1 text-center text-xs font-black tabular-nums text-slate-700" aria-live="polite">
        {percent}%
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={onZoomIn}
        className={`grid h-10 w-10 place-items-center text-slate-600 ${buttonMotion} hover:bg-white hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100`}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <ZoomIn size={15} />
      </button>
    </div>
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

function AnnotationLayer({
  activeTool,
  annotations,
  draft,
  onDeleteAnnotation,
  onDeleteAnnotations,
  onEditText,
  onMoveText,
  pageSize,
}: {
  activeTool: AnnotationTool
  annotations: PdfAnnotation[]
  draft: AnnotationDraft | null
  onDeleteAnnotation: (annotationId: string) => void
  onDeleteAnnotations: (annotationIds: string[]) => void
  onEditText: (annotation: TextAnnotation) => void
  onMoveText: (annotationId: string, point: PdfPoint) => void
  pageSize: PageSize
}) {
  const textMoveDraftRef = useRef<TextMoveDraft | null>(null)
  const suppressTextClickRef = useRef<string | null>(null)
  const eraserDraftRef = useRef<EraserDraft | null>(null)
  const [eraserPoint, setEraserPoint] = useState<PdfPoint | null>(null)
  const [erasedAnnotationIds, setErasedAnnotationIds] = useState<Set<string>>(() => new Set())
  const canDelete = activeTool === 'delete'

  useEffect(() => {
    if (canDelete) return
    eraserDraftRef.current = null
    setEraserPoint(null)
    setErasedAnnotationIds(new Set())
  }, [canDelete])

  if (!pageSize.width || !pageSize.height) return null
  const highlightAnnotations = annotations.filter((annotation): annotation is HighlightAnnotation => annotation.type === 'highlight')
  const drawAnnotations = annotations.filter((annotation): annotation is DrawAnnotation => annotation.type === 'draw')
  const visibleDrawAnnotations = drawAnnotations.filter((annotation) => annotation.points.length > 1)
  const textAnnotations = annotations.filter((annotation): annotation is TextAnnotation => annotation.type === 'text')
  const highlightDraftRect = draft?.type === 'highlight' && isMeaningfulHighlightDrag(draft.start, draft.current) ? annotationRect(draft.start, draft.current) : null
  const deleteInstruction = 'Drag eraser over annotations'

  function handleDeleteKey(event: ReactKeyboardEvent<Element>, annotationId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    onDeleteAnnotation(annotationId)
  }

  function isMarkedForErase(annotationId: string) {
    return erasedAnnotationIds.has(annotationId)
  }

  function markEraserHits(point: PdfPoint, sourceIds: Set<string>) {
    const nextIds = new Set(sourceIds)
    annotations.forEach((annotation) => {
      if (eraserHitsAnnotation(annotation, point, pageSize)) nextIds.add(annotation.id)
    })
    eraserDraftRef.current = eraserDraftRef.current ? { ...eraserDraftRef.current, ids: nextIds, point } : null
    setEraserPoint(point)
    setErasedAnnotationIds(nextIds)
  }

  function startEraser(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canDelete || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromPointer(event)
    const ids = new Set<string>()
    eraserDraftRef.current = { pointerId: event.pointerId, ids, point }
    markEraserHits(point, ids)
  }

  function moveEraser(event: ReactPointerEvent<HTMLDivElement>) {
    const draft = eraserDraftRef.current
    if (!draft || draft.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    const point = pointFromPointer(event)
    markEraserHits(point, draft.ids)
  }

  function finishEraser(event: ReactPointerEvent<HTMLDivElement>) {
    const draft = eraserDraftRef.current
    if (!draft || draft.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    eraserDraftRef.current = null
    setEraserPoint(null)

    const ids = Array.from(draft.ids)
    if (ids.length > 0) onDeleteAnnotations(ids)
    setErasedAnnotationIds(new Set())
  }

  function startTextMove(event: ReactPointerEvent<HTMLButtonElement>, annotation: TextAnnotation) {
    event.stopPropagation()
    if (canDelete || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    textMoveDraftRef.current = {
      annotationId: annotation.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: annotation.x,
      startY: annotation.y,
      moved: false,
    }
  }

  function moveText(event: ReactPointerEvent<HTMLButtonElement>) {
    const draft = textMoveDraftRef.current
    if (!draft || draft.pointerId !== event.pointerId) return

    event.stopPropagation()
    const pageElement = event.currentTarget.parentElement
    const rect = pageElement?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return

    const clientDeltaX = event.clientX - draft.startClientX
    const clientDeltaY = event.clientY - draft.startClientY
    if (!draft.moved && Math.hypot(clientDeltaX, clientDeltaY) < 4) return

    draft.moved = true
    onMoveText(draft.annotationId, {
      x: draft.startX + clientDeltaX / rect.width,
      y: draft.startY + clientDeltaY / rect.height,
    })
  }

  function finishTextMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const draft = textMoveDraftRef.current
    if (!draft || draft.pointerId !== event.pointerId) return

    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    textMoveDraftRef.current = null
    if (draft.moved) {
      suppressTextClickRef.current = draft.annotationId
      window.setTimeout(() => {
        if (suppressTextClickRef.current === draft.annotationId) suppressTextClickRef.current = null
      }, 250)
    }
  }

  function handleTextClick(annotation: TextAnnotation) {
    if (canDelete) return

    if (suppressTextClickRef.current === annotation.id) {
      suppressTextClickRef.current = null
      return
    }

    onEditText(annotation)
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-0">
        {highlightAnnotations.map((annotation) => canDelete ? (
          <button
            key={annotation.id}
            type="button"
            onKeyDown={(event) => handleDeleteKey(event, annotation.id)}
            className={`pointer-events-none absolute appearance-none rounded-[3px] border-0 p-0 ring-2 transition-[background-color,box-shadow,opacity,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 motion-reduce:transition-none ${
              isMarkedForErase(annotation.id)
                ? 'bg-red-400/35 opacity-35 ring-red-600/80 blur-[0.5px]'
                : 'bg-yellow-300/45 opacity-100 ring-red-500/55'
            }`}
            style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, width: `${annotation.width * 100}%`, height: `${annotation.height * 100}%` }}
            aria-label="Press Enter to delete highlight annotation"
            title="Eraser marked highlight"
          />
        ) : (
          <span key={annotation.id} className="absolute rounded-[3px] bg-yellow-300/45 ring-1 ring-yellow-500/40" style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, width: `${annotation.width * 100}%`, height: `${annotation.height * 100}%` }} />
        ))}
        {highlightDraftRect && <span className="absolute rounded-[3px] bg-yellow-300/35 ring-1 ring-yellow-500/50" style={{ left: `${highlightDraftRect.x * 100}%`, top: `${highlightDraftRect.y * 100}%`, width: `${highlightDraftRect.width * 100}%`, height: `${highlightDraftRect.height * 100}%` }} />}
        {canDelete && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Delete ink annotations">
            {drawAnnotations.map((annotation) => annotation.points.length === 1
              ? (
                <circle
                  key={`${annotation.id}-hit`}
                  cx={annotation.points[0].x * 100}
                  cy={annotation.points[0].y * 100}
                  r="1.8"
                  className="pointer-events-none fill-transparent outline-none transition-[fill,opacity] duration-150 ease-out focus-visible:fill-red-500/20 motion-reduce:transition-none"
                  opacity={isMarkedForErase(annotation.id) ? 0.25 : undefined}
                  role="button"
                  tabIndex={0}
                  aria-label="Press Enter to delete ink annotation"
                  onKeyDown={(event) => handleDeleteKey(event, annotation.id)}
                />
              ) : (
                <path
                  key={`${annotation.id}-hit`}
                  d={drawPath(annotation.points)}
                  className="pointer-events-none fill-none stroke-transparent outline-none transition-[stroke,opacity] duration-150 ease-out focus-visible:stroke-red-500/25 motion-reduce:transition-none"
                  opacity={isMarkedForErase(annotation.id) ? 0.25 : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="8"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  role="button"
                  tabIndex={0}
                  aria-label="Press Enter to delete ink annotation"
                  onKeyDown={(event) => handleDeleteKey(event, annotation.id)}
                />
              ))}
          </svg>
        )}
        {canDelete && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {drawAnnotations.map((annotation) => annotation.points.length === 1
              ? <circle key={`${annotation.id}-delete-ring`} cx={annotation.points[0].x * 100} cy={annotation.points[0].y * 100} r="1.2" className={isMarkedForErase(annotation.id) ? 'fill-red-500/25 stroke-red-600/80' : 'fill-none stroke-red-500/55'} strokeWidth="0.35" vectorEffect="non-scaling-stroke" opacity={isMarkedForErase(annotation.id) ? 0.35 : undefined} />
              : <path key={`${annotation.id}-delete-ring`} d={drawPath(annotation.points)} className={isMarkedForErase(annotation.id) ? 'fill-none stroke-red-600/80' : 'fill-none stroke-red-500/55'} strokeLinecap="round" strokeLinejoin="round" strokeWidth={isMarkedForErase(annotation.id) ? '2.1' : '1.55'} vectorEffect="non-scaling-stroke" opacity={isMarkedForErase(annotation.id) ? 0.42 : undefined} />)}
          </svg>
        )}
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {visibleDrawAnnotations.map((annotation) => (
            <path key={annotation.id} d={drawPath(annotation.points)} className={isMarkedForErase(annotation.id) ? 'fill-none stroke-red-600/45 blur-[0.5px]' : 'fill-none stroke-indigo-600/85'} strokeLinecap="round" strokeLinejoin="round" strokeWidth={INK_STROKE_WIDTH} vectorEffect="non-scaling-stroke" opacity={isMarkedForErase(annotation.id) ? 0.36 : undefined} />
          ))}
          {draft?.type === 'draw' && isMeaningfulDrawStroke(draft.points) && <path d={drawPath(draft.points)} className="fill-none stroke-indigo-500/85" strokeLinecap="round" strokeLinejoin="round" strokeWidth={INK_STROKE_WIDTH} vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>

      {textAnnotations.map((annotation) => (
        <button
          key={annotation.id}
          type="button"
          onPointerDown={(event) => canDelete ? event.stopPropagation() : startTextMove(event, annotation)}
          onPointerMove={(event) => {
            if (!canDelete) moveText(event)
          }}
          onPointerUp={(event) => {
            if (!canDelete) finishTextMove(event)
          }}
          onPointerCancel={(event) => {
            if (!canDelete) finishTextMove(event)
          }}
          onClick={() => handleTextClick(annotation)}
          onKeyDown={(event) => {
            if (canDelete) handleDeleteKey(event, annotation.id)
          }}
          className={`absolute max-w-[14rem] -translate-x-2 -translate-y-1 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold leading-4 shadow-[0_6px_18px_rgba(15,23,42,0.12)] backdrop-blur-[1px] ${buttonMotion} ${
            canDelete
              ? isMarkedForErase(annotation.id)
                ? 'pointer-events-none bg-red-100/55 text-slate-950 opacity-40 ring-2 ring-red-600/80 blur-[0.5px]'
                : 'pointer-events-none bg-red-50/95 text-slate-950 ring-2 ring-red-500/50'
              : `cursor-grab active:cursor-grabbing ${textNoteColorOption(annotation.color).noteClass}`
          }`}
          style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
          aria-label={canDelete ? `Marked by eraser text note: ${annotation.text}` : `Move or edit text note: ${annotation.text}`}
          title={canDelete ? 'Drag eraser over the note' : 'Drag to move. Click to edit.'}
        >
          <span className="line-clamp-4 whitespace-pre-wrap break-words">{annotation.text}</span>
        </button>
      ))}

      {canDelete && (
        <div
          className="pointer-events-auto absolute inset-0 z-20 cursor-cell touch-none"
          onPointerDown={startEraser}
          onPointerMove={moveEraser}
          onPointerUp={finishEraser}
          onPointerCancel={finishEraser}
          aria-label="Drag eraser over annotations, then release to delete marked annotations"
        >
          {eraserPoint && (
            <span
              className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 ring-2 ring-red-500/70 shadow-[0_0_0_6px_rgba(239,68,68,0.08)]"
              style={{ left: `${eraserPoint.x * 100}%`, top: `${eraserPoint.y * 100}%` }}
            />
          )}
        </div>
      )}

      {activeTool !== 'select' && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold text-white shadow-[var(--shadow-border)]">
          {activeTool === 'highlight' ? 'Drag to highlight' : activeTool === 'draw' ? 'Draw on the page' : activeTool === 'delete' ? deleteInstruction : 'Click to place text'}
        </div>
      )}
    </>
  )
}

function TextNoteEditor({
  draft,
  onCancel,
  onChange,
  onColorChange,
  onDelete,
  onSave,
}: {
  draft: TextDraft
  onCancel: () => void
  onChange: (text: string) => void
  onColorChange: (color: TextNoteColor) => void
  onDelete?: () => void
  onSave: () => void
}) {
  const selectedColor = textNoteColorOption(draft.color)

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    onSave()
  }

  return (
    <div className={`absolute z-10 w-[min(17rem,calc(100%-1rem))] -translate-x-2 rounded-xl p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 backdrop-blur-md ${selectedColor.editorClass}`} style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} onPointerDown={(event) => event.stopPropagation()}>
      <div className="mb-2 flex items-center gap-1">
        {TEXT_NOTE_COLOR_OPTIONS.map((option) => {
          const active = option.value === selectedColor.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onColorChange(option.value)}
              className={`grid h-10 w-10 place-items-center rounded-lg ${buttonMotion} hover:bg-white/60 ${active ? 'bg-white/80 shadow-[var(--shadow-border)]' : ''}`}
              aria-label={`Set note color ${option.label}`}
              aria-pressed={active}
              title={option.label}
            >
              <span className={`h-5 w-5 rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.16)] ${option.swatchClass}`} />
            </button>
          )
        })}
      </div>
      <label className="sr-only" htmlFor="zed-pdf-text-note">PDF text note</label>
      <textarea id="zed-pdf-text-note" value={draft.text} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} rows={3} autoFocus placeholder="Type text" className={`w-full resize-none rounded-lg border border-white/60 bg-white/70 p-2 text-sm font-semibold leading-5 text-slate-900 outline-none backdrop-blur-sm ${inputMotion} placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white/90 focus-visible:ring-4 focus-visible:ring-indigo-100`} />
      <div className="mt-2 flex items-center justify-between gap-2">
        {onDelete ? <button type="button" onClick={onDelete} className={`inline-flex h-10 items-center justify-center rounded-lg px-3 text-xs font-bold text-red-600 ${buttonMotion} hover:bg-red-50`}>Delete</button> : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className={`inline-flex h-10 items-center justify-center rounded-lg px-3 text-xs font-bold text-slate-500 ${buttonMotion} hover:bg-slate-100 hover:text-slate-950`}>Cancel</button>
          <button type="button" onClick={onSave} className={`inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white ${buttonMotion} hover:bg-indigo-700`}>Save</button>
        </div>
      </div>
    </div>
  )
}

async function renderPdfPage(pdf: PDFDocumentProxy, pageNumber: number, zoom: number): Promise<RenderedPdfPage> {
  const page: PDFPageProxy = await pdf.getPage(pageNumber)
  try {
    const viewport = page.getViewport({ scale: zoom })
    const scratchCanvas = document.createElement('canvas')
    const context = scratchCanvas.getContext('2d')
    if (!context) throw new Error('Canvas context unavailable')
    scratchCanvas.width = Math.floor(viewport.width)
    scratchCanvas.height = Math.floor(viewport.height)
    await page.render({ canvas: scratchCanvas, canvasContext: context, viewport }).promise
    return { canvas: scratchCanvas, size: { width: viewport.width, height: viewport.height } }
  } finally {
    page.cleanup()
  }
}

function commitRenderedPdfPage(renderedPage: RenderedPdfPage, canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas context unavailable')
  canvas.width = renderedPage.canvas.width
  canvas.height = renderedPage.canvas.height
  canvas.style.width = `${renderedPage.size.width}px`
  canvas.style.height = `${renderedPage.size.height}px`
  context.drawImage(renderedPage.canvas, 0, 0)
}
