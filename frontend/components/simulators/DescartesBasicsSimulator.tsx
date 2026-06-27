'use client'

import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { GeometricOpticsEngine } from './GeometricOpticsEngine'

const descartesToggleButtonMotionClass = 'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/30 motion-reduce:transition-none motion-reduce:active:scale-100'

export default function DescartesBasicsSimulator() {
  const [angleDeg, setAngleDeg] = useState(45)
  const [n1, setN1] = useState(1.0)
  const [n2, setN2] = useState(1.5)
  const [showAngles, setShowAngles] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ w: 600, h: 500 })

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth
        canvas.height = canvas.parentElement.clientHeight
        setDimensions({ w: canvas.width, h: canvas.height })
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const cx = width / 2
    const cy = height / 2

    const boundaryColor = '#cbd5e1'
    const normalColor = '#e2e8f0'
    const textColor = '#64748b'

    const getMediumColor = (refractiveIndex: number) => {
      const intensity = Math.max(0, (refractiveIndex - 1) / 1.5)
      const base = 250
      const sub = Math.round(intensity * 50)
      return `rgb(${base - sub}, ${base - sub - 10}, ${base - sub - 5})`
    }

    ctx.fillStyle = getMediumColor(n1)
    ctx.fillRect(0, 0, width, cy)

    ctx.fillStyle = getMediumColor(n2)
    ctx.fillRect(0, cy, width, height - cy)

    ctx.strokeStyle = boundaryColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(width, cy)
    ctx.stroke()

    ctx.setLineDash([5, 5])
    ctx.strokeStyle = normalColor
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, height)
    ctx.stroke()
    ctx.setLineDash([])

    const drawRayGlow = (
      start: { x: number; y: number },
      end: { x: number; y: number },
      color: string,
      lineWidth: number,
      alpha = 1.0,
    ) => {
      ctx.globalAlpha = alpha
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth * 0.4
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.globalAlpha = alpha * 0.6
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1.0
    }

    const extendRay = (x0: number, y0: number, angle: number) => {
      const dx = Math.sin(angle)
      const dy = Math.cos(angle)

      const tx = dx > 0 ? (width - x0) / dx : -x0 / dx
      const ty = dy > 0 ? (height - y0) / dy : -y0 / dy

      let t = 10000
      if (tx > 0) t = Math.min(t, tx)
      if (ty > 0) t = Math.min(t, ty)

      return {
        x: x0 + dx * t,
        y: y0 + dy * t,
      }
    }

    const angleRad = angleDeg * (Math.PI / 180)
    const refractionRad = GeometricOpticsEngine.calculateRefraction(angleRad, n1, n2)

    const incidentStart = extendRay(cx, cy, angleRad + Math.PI)
    drawRayGlow(incidentStart, { x: cx, y: cy }, '#fbbf24', 5)

    const reflectedDx = Math.sin(angleRad)
    const reflectedDy = -Math.cos(angleRad)
    let reflectedT = -cy / reflectedDy
    if (reflectedDx > 0) reflectedT = Math.min(reflectedT, (width - cx) / reflectedDx)
    else reflectedT = Math.min(reflectedT, -cx / reflectedDx)

    const reflectedEnd = { x: cx + reflectedDx * reflectedT, y: cy + reflectedDy * reflectedT }
    const reflectedIntensity = 0.3 + 0.5 * Math.pow(angleDeg / 90, 4)
    drawRayGlow({ x: cx, y: cy }, reflectedEnd, '#fbbf24', 4, reflectedIntensity)

    if (refractionRad !== null) {
      const refractedDx = Math.sin(refractionRad)
      const refractedDy = Math.cos(refractionRad)

      let refractedT = (height - cy) / refractedDy
      if (refractedDx > 0) refractedT = Math.min(refractedT, (width - cx) / refractedDx)
      else refractedT = Math.min(refractedT, -cx / refractedDx)

      const refractedEnd = { x: cx + refractedDx * refractedT, y: cy + refractedDy * refractedT }
      drawRayGlow({ x: cx, y: cy }, refractedEnd, '#38bdf8', 5)

      ctx.fillStyle = '#38bdf8'
      ctx.font = 'bold italic 16px serif'
      ctx.fillText('r', cx + 20, cy + 40)
    } else {
      ctx.fillStyle = '#ef4444'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText('REFLEXION TOTALE INTERNE', cx + 20, cy + 40)
      drawRayGlow({ x: cx, y: cy }, reflectedEnd, '#ef4444', 5, 1.0)
    }

    if (showAngles) {
      const drawAngleArc = (startAngle: number, endAngle: number, color: string, radius = 40) => {
        ctx.beginPath()
        ctx.arc(cx, cy, radius, startAngle, endAngle, endAngle < startAngle)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()
      }

      const normalUp = -Math.PI / 2

      drawAngleArc(normalUp - angleRad, normalUp, '#fbbf24', 50)
      ctx.setLineDash([4, 4])
      drawAngleArc(normalUp, normalUp + angleRad, '#fbbf24', 70)
      ctx.setLineDash([])

      if (refractionRad !== null) {
        const start = Math.PI / 2
        const end = Math.PI / 2 - refractionRad
        ctx.beginPath()
        ctx.arc(cx, cy, 50, start, end, true)
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    ctx.fillStyle = textColor
    ctx.font = '12px sans-serif'
    ctx.fillText(`Milieu 1 (n=${n1.toFixed(2)})`, 10, cy - 10)
    ctx.fillText(`Milieu 2 (n=${n2.toFixed(2)})`, 10, cy + 20)

    const labelX = incidentStart.x + (cx - incidentStart.x) * 0.2
    const labelY = incidentStart.y + (cy - incidentStart.y) * 0.2
    ctx.font = 'bold italic 16px serif'
    ctx.fillText('i', labelX, labelY - 10)
  }, [angleDeg, dimensions, n1, n2, showAngles])

  return (
    <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-100">Reflexion et refraction</h3>
        <button type="button"
          onClick={() => {
            setAngleDeg(45)
            setN1(1.0)
            setN2(1.5)
            setShowAngles(false)
          }}
          aria-label="Reset Descartes simulator"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-300 transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/40 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_320px]">
        <div className="rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-inner min-h-[420px] lg:min-h-[520px]">
          <canvas
            ref={canvasRef}
            width={600}
            height={500}
            className="w-full h-full cursor-crosshair transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none"
          />
        </div>

        <div className="space-y-4">
          <section className="bg-slate-700/50 rounded-2xl p-4 space-y-4 border border-slate-600">
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Parametres</h4>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-100">Angle d&apos;incidence (i)</span>
                <span className="text-amber-400 font-mono font-medium">{angleDeg}&deg;</span>
              </div>
              <input
                aria-label="Angle d'incidence"
                type="range"
                min="0"
                max="90"
                step="1"
                value={angleDeg}
                onChange={(e) => setAngleDeg(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-100">Indice milieu 1 (n1)</span>
                <span className="text-blue-400 font-mono font-medium">{n1.toFixed(2)}</span>
              </div>
              <input
                aria-label="Indice milieu 1"
                type="range"
                min="1.0"
                max="2.5"
                step="0.01"
                value={n1}
                onChange={(e) => setN1(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-100">Indice milieu 2 (n2)</span>
                <span className="text-cyan-400 font-mono font-medium">{n2.toFixed(2)}</span>
              </div>
              <input
                aria-label="Indice milieu 2"
                type="range"
                min="1.0"
                max="2.5"
                step="0.01"
                value={n2}
                onChange={(e) => setN2(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="pt-2 border-t border-amber-500/10">
              <button type="button"
                onClick={() => setShowAngles(!showAngles)}
                aria-pressed={showAngles}
                className={`flex min-h-10 w-full items-center justify-between rounded-full border px-3 py-2 text-sm font-medium ${descartesToggleButtonMotionClass} ${showAngles ? 'border-transparent bg-amber-500 text-white shadow-sm' : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-amber-400/50 hover:bg-slate-700'}`}
              >
                <span>Visualiser les angles</span>
                <div className={`relative h-4 w-8 rounded-full transition-[background-color] duration-150 ease-out motion-reduce:transition-none ${showAngles ? 'bg-amber-300' : 'bg-slate-400'}`} aria-hidden="true">
                  <div className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-[transform] duration-150 ease-out motion-reduce:transition-none ${showAngles ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>
          </section>

          <section className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Theorie</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              <strong className="text-slate-100">Loi de Snell-Descartes :</strong>
              <br />
              n1 sin(i) = n2 sin(r)
              <br />
              <br />
              Si n1 &gt; n2, il existe un angle critique au-dela duquel la lumiere est totalement reflechie.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
