'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Play, Pause } from 'lucide-react'
import { Slider } from './Slider'

export default function WaveSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [amplitude, setAmplitude] = useState(60)
  const [frequency, setFrequency] = useState(2)
  const [wavelength, setWavelength] = useState(200)
  const [isPlaying, setIsPlaying] = useState(true)
  const timeRef = useRef(0)
  const animRef = useRef<number>(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const midY = H / 2

    // Clear
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // Equilibrium line
    ctx.beginPath()
    ctx.setLineDash([8, 4])
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 1
    ctx.moveTo(0, midY)
    ctx.lineTo(W, midY)
    ctx.stroke()
    ctx.setLineDash([])

    // Wave
    const t = timeRef.current
    ctx.beginPath()
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 3
    ctx.shadowColor = '#818cf8'
    ctx.shadowBlur = 12
    for (let x = 0; x <= W; x++) {
      const y = midY + amplitude * Math.sin(2 * Math.PI * (x / wavelength - frequency * t))
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // Highlight peaks
    ctx.fillStyle = '#c7d2fe'
    for (let x = 0; x <= W; x += 4) {
      const y = midY + amplitude * Math.sin(2 * Math.PI * (x / wavelength - frequency * t))
      if (x === 0) continue
      const yPrev = midY + amplitude * Math.sin(2 * Math.PI * ((x - 4) / wavelength - frequency * t))
      const yNext = midY + amplitude * Math.sin(2 * Math.PI * ((x + 4) / wavelength - frequency * t))
      if (y < yPrev && y < yNext) {
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
      }
      if (y > yPrev && y > yNext) {
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
      }
    }

    // Wavelength indicator
    const wlStart = W / 4
    const wlY = midY + amplitude + 30
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(wlStart, wlY); ctx.lineTo(wlStart + wavelength, wlY)
    ctx.moveTo(wlStart, wlY - 5); ctx.lineTo(wlStart, wlY + 5)
    ctx.moveTo(wlStart + wavelength, wlY - 5); ctx.lineTo(wlStart + wavelength, wlY + 5)
    ctx.stroke()
    ctx.fillStyle = '#fbbf24'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('\u03BB', wlStart + wavelength / 2, wlY + 18)

    // Amplitude indicator
    const ampX = 40
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ampX, midY); ctx.lineTo(ampX, midY - amplitude)
    ctx.moveTo(ampX - 5, midY); ctx.lineTo(ampX + 5, midY)
    ctx.moveTo(ampX - 5, midY - amplitude); ctx.lineTo(ampX + 5, midY - amplitude)
    ctx.stroke()
    ctx.fillStyle = '#34d399'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('A', ampX, midY - amplitude / 2 + 4)

    // Info box
    const v = frequency * wavelength / 10 // cm/s -> arbitrary
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
    ctx.fillRect(W - 180, 10, 170, 80)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.strokeRect(W - 180, 10, 170, 80)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('PROPRIETES', W - 170, 28)
    ctx.font = '11px monospace'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`v = ${v.toFixed(1)} u/s`, W - 170, 46)
    ctx.fillText(`T = ${(1 / frequency).toFixed(2)} s`, W - 170, 62)
    ctx.fillText(`v = \u03BB \u00D7 f`, W - 170, 78)
  }, [amplitude, frequency, wavelength])

  useEffect(() => {
    const loop = () => {
      if (isPlaying) timeRef.current += 0.016
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying, draw])

  return (
    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-200">Onde Transversale Progressive</h3>
        <div className="flex gap-2">
          <button onClick={() => setIsPlaying(!isPlaying)} className="text-slate-400 hover:text-slate-400">
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={() => { setAmplitude(60); setFrequency(2); setWavelength(200); timeRef.current = 0 }} className="text-slate-400 hover:text-slate-400">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-slate-700 mb-6">
        <canvas ref={canvasRef} width={700} height={300} className="w-full" style={{ height: 260 }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="flex justify-between text-xs font-bold text-slate-500 mb-1">
            <span className="text-emerald-600">Amplitude (A)</span>
            <span>{amplitude} px</span>
          </label>
          <Slider min={10} max={100} value={[amplitude]} onValueChange={([v]) => setAmplitude(v)} />
        </div>
        <div>
          <label className="flex justify-between text-xs font-bold text-slate-500 mb-1">
            <span className="text-indigo-500">Frequence (f)</span>
            <span>{frequency.toFixed(1)} Hz</span>
          </label>
          <Slider min={0.5} max={5} step={0.1} value={[frequency]} onValueChange={([v]) => setFrequency(v)} />
        </div>
        <div>
          <label className="flex justify-between text-xs font-bold text-slate-500 mb-1">
            <span className="text-amber-500">Longueur d&apos;onde (&lambda;)</span>
            <span>{wavelength} px</span>
          </label>
          <Slider min={80} max={400} value={[wavelength]} onValueChange={([v]) => setWavelength(v)} />
        </div>
      </div>

      <div className="mt-4 p-3 bg-indigo-50 text-indigo-900 text-xs rounded-lg text-center font-mono">
        Relation fondamentale : v = &lambda; &times; f &nbsp;&nbsp;|&nbsp;&nbsp; T = 1/f
      </div>
    </div>
  )
}
