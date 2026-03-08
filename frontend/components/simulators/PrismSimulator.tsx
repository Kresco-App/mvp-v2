'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Droplet, RefreshCw, Sun } from 'lucide-react'
import { calculatePrism, SimulationResult } from './PrismLogic'

type SourceMode = 'white' | 'single' | 'double'

export default function PrismSimulator() {
  const isDark = true

  const [incidentAngle, setIncidentAngle] = useState(45)
  const [prismAngle, setPrismAngle] = useState(60)
  const [sourceMode, setSourceMode] = useState<SourceMode>('white')
  const [laser1Wavelength, setLaser1Wavelength] = useState(650)
  const [laser2Wavelength, setLaser2Wavelength] = useState(450)
  const [showAngles, setShowAngles] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (canvas && canvas.parentElement) {
        const w = canvas.parentElement.clientWidth
        const h = canvas.parentElement.clientHeight
        canvas.width = w
        canvas.height = h
        setDimensions({ w, h })
      }
    }

    window.addEventListener('resize', handleResize)
    setTimeout(handleResize, 100)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const simulation: SimulationResult = useMemo(() => {
    if (dimensions.w === 0 || dimensions.h === 0) {
      return {
        geometry: { A: { x: 0, y: 0 }, B: { x: 0, y: 0 }, C: { x: 0, y: 0 }, P: { x: 0, y: 0 } },
        incidentRay: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        rays: [],
        stats: null,
      }
    }

    if (sourceMode === 'double') {
      const res1 = calculatePrism(dimensions.w, dimensions.h, incidentAngle, prismAngle, false, laser1Wavelength)
      const res2 = calculatePrism(dimensions.w, dimensions.h, incidentAngle, prismAngle, false, laser2Wavelength)

      return {
        ...res1,
        rays: [...res1.rays, ...res2.rays],
        stats: res1.stats,
      }
    }

    return calculatePrism(
      dimensions.w,
      dimensions.h,
      incidentAngle,
      prismAngle,
      sourceMode === 'white',
      laser1Wavelength,
    )
  }, [dimensions, incidentAngle, laser1Wavelength, laser2Wavelength, prismAngle, sourceMode])

  const getWavelengthColor = (lambda: number) => {
    let r = 0
    let g = 0
    let b = 0
    if (lambda >= 380 && lambda < 440) {
      r = -(lambda - 440) / (440 - 380)
      b = 1
    } else if (lambda >= 440 && lambda < 490) {
      g = (lambda - 440) / (490 - 440)
      b = 1
    } else if (lambda >= 490 && lambda < 510) {
      g = 1
      b = -(lambda - 510) / (510 - 490)
    } else if (lambda >= 510 && lambda < 580) {
      r = (lambda - 510) / (580 - 510)
      g = 1
    } else if (lambda >= 580 && lambda < 645) {
      r = 1
      g = -(lambda - 645) / (645 - 580)
    } else if (lambda >= 645 && lambda <= 780) {
      r = 1
    }

    let factor = 1.0
    if (lambda >= 380 && lambda < 420) factor = 0.3 + 0.7 * (lambda - 380) / (420 - 380)
    else if (lambda >= 701 && lambda < 780) factor = 0.3 + 0.7 * (780 - lambda) / (780 - 700)

    return `rgb(${Math.round(r * factor * 255)}, ${Math.round(g * factor * 255)}, ${Math.round(b * factor * 255)})`
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = isDark ? '#0F172A' : '#F8FAFC'
    ctx.fillRect(0, 0, width, height)

    const { A, B, C } = simulation.geometry
    const prismGrad = ctx.createLinearGradient(A.x, A.y, C.x, C.y)
    if (isDark) {
      prismGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)')
      prismGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)')
      prismGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)')
    } else {
      prismGrad.addColorStop(0, 'rgba(0, 0, 0, 0.02)')
      prismGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)')
      prismGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)')
    }

    ctx.fillStyle = prismGrad
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(B.x, B.y)
    ctx.lineTo(C.x, C.y)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.2)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(A.x - 5, A.y + 5)
    ctx.lineTo(A.x, A.y)
    ctx.lineTo(A.x + 5, A.y + 5)
    ctx.stroke()

    const incidentRay = simulation.incidentRay
    const drawRayGlow = (
      start: { x: number; y: number },
      end: { x: number; y: number },
      color: string,
      lineWidth: number,
    ) => {
      ctx.strokeStyle = isDark ? '#fff' : color
      ctx.lineWidth = lineWidth * 0.4
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.globalAlpha = 0.6
      if (isDark) {
        ctx.shadowBlur = 12
        ctx.shadowColor = color
      }
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1.0
    }

    if (sourceMode === 'white') {
      drawRayGlow(incidentRay.start, incidentRay.end, isDark ? '#ffffff' : '#e2e8f0', 4)
    } else {
      drawRayGlow(incidentRay.start, incidentRay.end, getWavelengthColor(laser1Wavelength), sourceMode === 'double' ? 3 : 5)
      if (sourceMode === 'double') {
        drawRayGlow(incidentRay.start, incidentRay.end, getWavelengthColor(laser2Wavelength), 3)
      }
    }

    simulation.rays.forEach((ray) => {
      ctx.strokeStyle = ray.color
      ctx.lineWidth = ray.width || 2
      ctx.globalAlpha = ray.alpha || 1.0

      if (ray.segments.length > 0) {
        ctx.beginPath()
        ctx.moveTo(ray.segments[0].start.x, ray.segments[0].start.y)
        ray.segments.forEach((segment) => ctx.lineTo(segment.end.x, segment.end.y))
        ctx.stroke()

        if (isDark && sourceMode !== 'white') {
          ctx.shadowBlur = 8
          ctx.shadowColor = ray.color
          ctx.stroke()
          ctx.shadowBlur = 0
        }
      }
      ctx.globalAlpha = 1.0
    })

    if (showAngles && sourceMode === 'single' && simulation.stats) {
      const { A, C, P } = simulation.geometry
      const ray = simulation.rays[0]

      if (ray && ray.segments.length > 0) {
        const pPrime = ray.segments[0].end
        const dx = C.x - A.x
        const dy = C.y - A.y
        const face2Angle = Math.atan2(dy, dx)
        const n2OutAngle = face2Angle - Math.PI / 2
        const n2InAngle = n2OutAngle + Math.PI

        ctx.setLineDash([5, 5])
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(P.x - 80, P.y)
        ctx.lineTo(P.x + 80, P.y)
        ctx.stroke()

        const n2Ext = 80
        ctx.beginPath()
        ctx.moveTo(pPrime.x - Math.cos(n2OutAngle) * n2Ext, pPrime.y - Math.sin(n2OutAngle) * n2Ext)
        ctx.lineTo(pPrime.x + Math.cos(n2OutAngle) * n2Ext, pPrime.y + Math.sin(n2OutAngle) * n2Ext)
        ctx.stroke()
        ctx.setLineDash([])

        const drawAngle = (
          center: { x: number; y: number },
          rayAngle: number,
          normalAngle: number,
          color: string,
          radius = 40,
        ) => {
    const start = normalAngle
          let end = rayAngle
          let diff = end - start

          while (diff > Math.PI) {
            end -= 2 * Math.PI
            diff = end - start
          }
          while (diff < -Math.PI) {
            end += 2 * Math.PI
            diff = end - start
          }

          ctx.beginPath()
          ctx.arc(center.x, center.y, radius, start, end, end < start)
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.stroke()
        }

        const angInc = Math.atan2(incidentRay.start.y - P.y, incidentRay.start.x - P.x)
        const angRefr = Math.atan2(pPrime.y - P.y, pPrime.x - P.x)
        const angInternal = Math.atan2(P.y - pPrime.y, P.x - pPrime.x)

        drawAngle(P, angInc, Math.PI, '#fbbf24', 45)
        drawAngle(P, angRefr, 0, '#38bdf8', 40)
        drawAngle(pPrime, angInternal, n2InAngle, '#a855f7', 40)

        if (!simulation.stats.tir && ray.segments[1]) {
          const exitDir = {
            x: ray.segments[1].end.x - pPrime.x,
            y: ray.segments[1].end.y - pPrime.y,
          }
          const angExit = Math.atan2(exitDir.y, exitDir.x)
          drawAngle(pPrime, angExit, n2OutAngle, '#10b981', 45)

          ctx.setLineDash([4, 4])
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'
          ctx.beginPath()
          ctx.moveTo(P.x, P.y)
          const extLen = 250
          ctx.lineTo(P.x + extLen * Math.cos(angInc + Math.PI), P.y + extLen * Math.sin(angInc + Math.PI))
          ctx.stroke()
          ctx.setLineDash([])
        }

        const angAB = Math.atan2(B.y - A.y, B.x - A.x)
        const angAC = Math.atan2(C.y - A.y, C.x - A.x)
        drawAngle(A, angAB, angAC, isDark ? '#94a3b8' : '#64748b', 60)
      }
    }
  }, [incidentAngle, isDark, laser1Wavelength, laser2Wavelength, prismAngle, showAngles, simulation, sourceMode])

  const textPrimary = isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]'
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#64748B]'

  return (
    <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-100">Prisme et dispersion</h3>
        <button
          onClick={() => {
            setIncidentAngle(45)
            setPrismAngle(60)
            setSourceMode('white')
            setLaser1Wavelength(650)
            setLaser2Wavelength(450)
            setShowAngles(false)
          }}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_340px]">
        <div className="rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-inner min-h-[440px] lg:min-h-[540px]">
          <canvas ref={canvasRef} className="w-full h-full transition-colors duration-200" />
        </div>

        <div className="space-y-4">
          <section className="bg-slate-700/50 rounded-2xl p-4 space-y-3 border border-slate-600">
            <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Mode source</h4>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setSourceMode('white')}
                className={`py-2 px-1 rounded-full text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 ${sourceMode === 'white' ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-800 text-slate-200 border border-slate-600'}`}
              >
                <Sun size={14} />
                Soleil
              </button>
              <button
                onClick={() => setSourceMode('single')}
                className={`py-2 px-1 rounded-full text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 ${sourceMode === 'single' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-800 text-slate-200 border border-slate-600'}`}
              >
                <Droplet size={14} />
                1 Laser
              </button>
              <button
                onClick={() => setSourceMode('double')}
                className={`py-2 px-1 rounded-full text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 ${sourceMode === 'double' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-800 text-slate-200 border border-slate-600'}`}
              >
                <RefreshCw size={14} />
                2 Lasers
              </button>
            </div>

            {(sourceMode === 'single' || sourceMode === 'double') && (
              <div className="pt-2 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={textSecondary}>{sourceMode === 'double' ? 'Laser 1' : 'Couleur'}</span>
                    <span className="font-mono font-medium" style={{ color: getWavelengthColor(laser1Wavelength) }}>
                      {laser1Wavelength} nm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="380"
                    max="750"
                    step="1"
                    value={laser1Wavelength}
                    onChange={(e) => setLaser1Wavelength(Number(e.target.value))}
                    className="w-full h-1.5"
                    style={{ accentColor: getWavelengthColor(laser1Wavelength) }}
                  />
                </div>

                {sourceMode === 'double' && (
                  <div className="space-y-1 border-t border-purple-500/10 pt-2">
                    <div className="flex justify-between text-xs">
                      <span className={textSecondary}>Laser 2</span>
                      <span className="font-mono font-medium" style={{ color: getWavelengthColor(laser2Wavelength) }}>
                        {laser2Wavelength} nm
                      </span>
                    </div>
                    <input
                      type="range"
                      min="380"
                      max="750"
                      step="1"
                      value={laser2Wavelength}
                      onChange={(e) => setLaser2Wavelength(Number(e.target.value))}
                      className="w-full h-1.5"
                      style={{ accentColor: getWavelengthColor(laser2Wavelength) }}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="bg-slate-800 rounded-2xl p-4 space-y-4 border border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Geometrie</h4>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={textPrimary}>Incidence (i)</span>
                <span className="text-amber-400 font-mono font-medium">{incidentAngle}&deg;</span>
              </div>
              <input
                type="range"
                min="0"
                max="85"
                step="1"
                value={incidentAngle}
                onChange={(e) => setIncidentAngle(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={textPrimary}>Angle prisme (A)</span>
                <span className="text-purple-400 font-mono font-medium">{prismAngle}&deg;</span>
              </div>
              <input
                type="range"
                min="30"
                max="75"
                step="1"
                value={prismAngle}
                onChange={(e) => setPrismAngle(Number(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            {sourceMode === 'single' && (
              <div className="pt-2 border-t border-purple-500/10">
                <button
                  onClick={() => setShowAngles(!showAngles)}
                  className={`w-full py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center justify-between ${showAngles ? 'bg-purple-500 text-white shadow-sm' : 'bg-slate-900 text-slate-200 border border-slate-600'}`}
                >
                  <span>Visualiser les angles</span>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${showAngles ? 'bg-purple-300' : 'bg-slate-400'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showAngles ? 'left-4.5' : 'left-0.5'}`} />
                  </div>
                </button>
              </div>
            )}
          </section>

          {simulation.stats && (
            <section className="bg-gradient-to-br from-[#334155] to-[#1E293B] rounded-2xl p-4 border border-[#475569] space-y-3 shadow-sm">
              <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                Mesures ({sourceMode === 'white' ? 'Dispersion' : 'Laser'})
              </h4>

              {!simulation.stats.tir ? (
                <div className="space-y-2 font-mono text-sm">
                  {sourceMode === 'single' ? (
                    <>
                      <div className="flex justify-between">
                        <span className={textSecondary}>Incidence i</span>
                        <span className="text-amber-400 font-medium">{Math.abs(simulation.stats.i).toFixed(1)}&deg;</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textSecondary}>Refraction r</span>
                        <span className="text-sky-400 font-medium">{Math.abs(simulation.stats.r).toFixed(1)}&deg;</span>
                      </div>
                      <div className="flex justify-between border-t border-purple-500/10 pt-2">
                        <span className={textSecondary}>Incidence r&apos;</span>
                        <span className="text-purple-400 font-medium">{Math.abs(simulation.stats.r_prime).toFixed(1)}&deg;</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textSecondary}>Emergence i&apos;</span>
                        <span className="text-emerald-400 font-medium">{Math.abs(simulation.stats.i_prime).toFixed(1)}&deg;</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className={textSecondary}>Refraction r</span>
                        <span className="text-blue-400 font-medium">{simulation.stats.r.toFixed(1)}&deg;</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textSecondary}>Sortie i&apos;</span>
                        <span className="text-emerald-400 font-medium">{simulation.stats.i_prime.toFixed(1)}&deg;</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between border-t border-slate-600 pt-2 mt-2">
                    <span className="text-rose-400 font-bold">Deviation D</span>
                    <span className="text-rose-400 font-bold">{simulation.stats.D.toFixed(1)}&deg;</span>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 text-red-600 p-2 rounded-xl text-center text-xs font-bold border border-red-200">
                  REFLEXION TOTALE
                </div>
              )}
            </section>
          )}

          <section className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">A propos</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              L&apos;indice de refraction du verre depend de la longueur d&apos;onde. C&apos;est ce qui provoque la
              <span className="text-purple-400 font-medium"> dispersion</span> de la lumiere blanche.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
