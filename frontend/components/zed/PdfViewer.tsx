'use client'

import { useState, useRef, useCallback } from 'react'
import { Pin, Scissors, Upload, FileText, X } from 'lucide-react'

interface PinnedSnippet {
  id: string
  content: string
  type: 'text' | 'image'
}

interface Props {
  onPinSnippet: (snippet: PinnedSnippet) => void
}

export default function PdfViewer({ onPinSnippet }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isSnipping, setIsSnipping] = useState(false)
  const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(null)
  const [snipRect, setSnipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    const url = URL.createObjectURL(file)
    setPdfUrl(url)
  }

  // Pin selected text from outside the iframe
  function handlePinText() {
    const text = window.getSelection()?.toString().trim()
    if (text) {
      onPinSnippet({ id: `pin_${Date.now()}`, content: text, type: 'text' })
      window.getSelection()?.removeAllRanges()
    } else {
      // Let user type something to pin
      const val = prompt('Texte a epingler :')
      if (val?.trim()) {
        onPinSnippet({ id: `pin_${Date.now()}`, content: val.trim(), type: 'text' })
      }
    }
  }

  // Snip overlay handlers
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

  async function handleMouseUp() {
    if (!isSnipping || !snipRect || snipRect.w < 10 || snipRect.h < 10) {
      setSnipStart(null); setSnipRect(null)
      return
    }

    // Use html2canvas-free approach: capture via OffscreenCanvas + CSS snapshot
    // Since the PDF is in an iframe (cross-origin restricted), capture the overlay area
    // and add as a placeholder snippet with coordinates for reference
    const label = `Zone PDF (${Math.round(snipRect.x)},${Math.round(snipRect.y)}) ${Math.round(snipRect.w)}×${Math.round(snipRect.h)}px`
    onPinSnippet({ id: `snip_${Date.now()}`, content: label, type: 'text' })

    setSnipStart(null); setSnipRect(null)
    setIsSnipping(false)
  }

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-10 bg-slate-950">
        <div className="w-20 h-20 rounded-2xl bg-slate-800/80 flex items-center justify-center">
          <FileText size={34} className="text-slate-500" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold mb-1">Aucun PDF chargé</p>
          <p className="text-slate-500 text-sm">Importez un énoncé ou un cours PDF</p>
        </div>
        <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl cursor-pointer transition">
          <Upload size={14} />
          Importer un PDF
          <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileText size={13} />
          <span className="font-medium text-slate-400">Visionneuse PDF</span>
          <span className="text-slate-400">(zoom natif inclus)</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handlePinText}
            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-600/15 transition"
          >
            <Pin size={12} />
            Épingler
          </button>

          <button
            onClick={() => setIsSnipping(!isSnipping)}
            className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition ${
              isSnipping ? 'bg-amber-600/20 text-amber-300' : 'text-slate-400 hover:text-amber-300 hover:bg-amber-600/15'
            }`}
          >
            <Scissors size={12} />
            {isSnipping ? 'Cliquez et glissez…' : 'Capturer zone'}
          </button>

          {isSnipping && (
            <button onClick={() => { setIsSnipping(false); setSnipRect(null) }} className="p-1 text-slate-500 hover:text-white">
              <X size={13} />
            </button>
          )}

          <label className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition">
            <Upload size={12} />
            Changer
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* PDF iframe + snip overlay */}
      <div className="relative flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          src={pdfUrl}
          className="w-full h-full border-0"
          title="PDF Viewer"
        />

        {/* Transparent snip overlay */}
        {isSnipping && (
          <div
            ref={overlayRef}
            className="absolute inset-0 cursor-crosshair"
            style={{ background: 'rgba(0,0,0,0.05)' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {snipRect && (
              <div
                className="absolute border-2 border-amber-400 bg-amber-400/10 pointer-events-none"
                style={{ left: snipRect.x, top: snipRect.y, width: snipRect.w, height: snipRect.h }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
