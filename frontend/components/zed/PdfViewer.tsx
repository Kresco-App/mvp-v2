'use client'

import { useEffect, useRef, useState } from 'react'
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

const DB_NAME = 'kresco_zed_workspace'
const DB_VERSION = 1
const DOC_STORE = 'documents'
const ACTIVE_DOC_KEY = 'kresco_zed_active_document'

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

export default function PdfViewer({ onPinSnippet }: Props) {
  const [documents, setDocuments] = useState<LocalDocument[]>([])
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('Importez un enonce ou un cours PDF')
  const [isSnipping, setIsSnipping] = useState(false)
  const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(null)
  const [snipRect, setSnipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const objectUrlRef = useRef<string | null>(null)
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

  function handlePinText() {
    const text = window.getSelection()?.toString().trim()
    if (text) {
      onPinSnippet({ id: `pin_${Date.now()}`, content: text, type: 'text' })
      window.getSelection()?.removeAllRanges()
      return
    }

    const value = prompt('Texte a epingler :')
    if (value?.trim()) {
      onPinSnippet({ id: `pin_${Date.now()}`, content: value.trim(), type: 'text' })
    }
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

  function handleMouseUp() {
    if (!isSnipping || !snipRect || snipRect.w < 10 || snipRect.h < 10) {
      setSnipStart(null)
      setSnipRect(null)
      return
    }

    const active = documents.find((item) => item.id === activeDocumentId)
    onPinSnippet({
      id: `snip_${Date.now()}`,
      content: `${active?.name ?? 'PDF'} - zone (${Math.round(snipRect.x)},${Math.round(snipRect.y)}) ${Math.round(snipRect.w)}x${Math.round(snipRect.h)}px`,
      type: 'text',
    })

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

          <button type="button"
            onClick={() => setIsSnipping(!isSnipping)}
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
              onClick={() => { setIsSnipping(false); setSnipRect(null) }}
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
            className="absolute inset-0 cursor-crosshair bg-indigo-950/5"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {snipRect && (
              <div
                className="pointer-events-none absolute border-2 border-amber-400 bg-amber-300/20 shadow-[0_0_0_9999px_rgba(15,23,42,0.08)]"
                style={{ left: snipRect.x, top: snipRect.y, width: snipRect.w, height: snipRect.h }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
