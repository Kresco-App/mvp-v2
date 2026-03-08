'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { RefreshCw, Sun, Zap } from 'lucide-react'
import { calculatePrism, SimulationResult } from './PrismLogic'
import { Slider } from './Slider'

const useResponsiveCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (parent) {
      setSize({ width: parent.clientWidth, height: parent.clientHeight })
    }
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    if (parent) resizeObserver.observe(parent)
    return () => { if (parent) resizeObserver.unobserve(parent) }
  }, [])

  return { canvasRef, ...size }
}

export default function PrismSimulator() {
  const [incidentAngle, setIncidentAngle] = useState(45)
  const [prismAngle, setPrismAngle] = useState(60)
  const [showWhiteLight, setShowWhiteLight] = useState(true)
  const { canvasRef, width, height } = useResponsiveCanvas()

  const simulation: SimulationResult = useMemo(() => {
    if (width === 0 || height === 0) {
      return { geometry: { A: { x: 0, y: 0 }, B: { x: 0, y: 0 }, C: { x: 0, y: 0 }, P: { x: 0, y: 0 } }, incidentRay: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, rays: [], stats: null }
    }
    return calculatePrism(width, height, incidentAngle, prismAngle, showWhiteLight)
  }, [width, height, incidentAngle, prismAngle, showWhiteLight])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0 || height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, height)

    const { A, B, C } = simulation.geometry
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(B.x, B.y)
    ctx.lineTo(C.x, C.y)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 1
    ctx.stroke()

    const ir = simulation.incidentRay
    ctx.strokeStyle = showWhiteLight ? '#ffffff' : '#fef08a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ir.start.x, ir.start.y)
    ctx.lineTo(ir.end.x, ir.end.y)
    ctx.stroke()

    simulation.rays.forEach(ray => {
      ctx.strokeStyle = ray.color
      ctx.lineWidth = ray.width
      ctx.globalAlpha = ray.alpha
      ctx.beginPath()
      if (ray.segments.length > 0) {
        ctx.moveTo(ray.segments[0].start.x, ray.segments[0].start.y)
        ray.segments.forEach(seg => ctx.lineTo(seg.end.x, seg.end.y))
      }
      ctx.stroke()
      ctx.globalAlpha = 1.0
    })
  }, [simulation, width, height, showWhiteLight])

  return (
    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-200">Dispersion de la Lumiere par un Prisme</h3>
        <button
          onClick={() => { setIncidentAngle(45); setPrismAngle(60); setShowWhiteLight(true) }}
          className="text-slate-400 hover:text-slate-400"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-6">
        <div className="lg:col-span-2 w-full aspect-video bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-slate-700">
          <canvas ref={canvasRef} width={width} height={height} className="w-full h-full" />
        </div>

        <div className="lg:col-span-1 mt-4 lg:mt-0 space-y-5">
          {/* Light source toggle */}
          <div>
            <label className="text-sm font-bold text-slate-300 mb-2 block">Source de Lumiere</label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setShowWhiteLight(false)}
                className={`w-1/2 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${!showWhiteLight ? 'bg-slate-900 text-yellow-600 shadow-sm' : 'text-slate-500'}`}
              >
                <Zap size={14} /> Laser
              </button>
              <button
                onClick={() => setShowWhiteLight(true)}
                className={`w-1/2 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${showWhiteLight ? 'bg-slate-900 text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                <Sun size={14} /> Soleil
              </button>
            </div>
          </div>

          {/* Stats */}
          {simulation.stats && (
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Donnees</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Incidence (i)</span>
                  <span className="font-mono font-bold text-slate-300">{simulation.stats.i.toFixed(1)}&deg;</span>
                </div>
                {!simulation.stats.tir ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sortie (i&apos;)</span>
                      <span className="font-mono font-bold text-emerald-600">{simulation.stats.i_prime.toFixed(1)}&deg;</span>
                    </div>
                    <div className="flex justify-between bg-yellow-50 p-1.5 rounded">
                      <span className="text-yellow-800 font-bold text-xs">Deviation (D)</span>
                      <span className="font-mono font-bold text-yellow-800">{simulation.stats.D.toFixed(1)}&deg;</span>
                    </div>
                  </>
                ) : (
                  <div className="bg-rose-50 text-rose-600 p-2 rounded text-xs font-bold text-center border border-rose-100">
                    Reflexion Totale Interne
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="text-xs font-bold text-slate-300">Angle d&apos;Incidence (i)</label>
                <span className="font-mono text-yellow-600 font-bold bg-yellow-50 px-2 py-0.5 rounded text-xs">{incidentAngle}&deg;</span>
              </div>
              <Slider value={[incidentAngle]} onValueChange={([v]) => setIncidentAngle(v)} min={0} max={85} step={1} />
            </div>
            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="text-xs font-bold text-slate-300">Angle du Prisme (A)</label>
                <span className="font-mono text-yellow-600 font-bold bg-yellow-50 px-2 py-0.5 rounded text-xs">{prismAngle}&deg;</span>
              </div>
              <Slider value={[prismAngle]} onValueChange={([v]) => setPrismAngle(v)} min={30} max={75} step={1} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-indigo-50 text-indigo-900 text-xs rounded-lg text-center font-mono">
        Loi de Snell-Descartes : n₁ sin(i) = n₂ sin(r)
      </div>
    </div>
  )
}
