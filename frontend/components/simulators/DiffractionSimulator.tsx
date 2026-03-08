'use client'

import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function DiffractionSimulator() {
  const [wavelength, setWavelength] = useState(400)
  const [slitWidth, setSlitWidth] = useState(100)
  const [distance, setDistance] = useState(2.0)

  const diagramRef = useRef<HTMLCanvasElement>(null)
  const screenRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const handleResize = () => {
      const container = diagramRef.current?.parentElement?.parentElement
      if (container) {
        if (diagramRef.current) {
          diagramRef.current.width = container.clientWidth - 32
          diagramRef.current.height = container.clientHeight * 0.55
        }

        const bottomHeight = container.clientHeight * 0.27
        const bottomWidth = container.clientWidth - 32

        if (screenRef.current) {
          screenRef.current.width = bottomWidth
          screenRef.current.height = bottomHeight
        }

        setDimensions({ w: container.clientWidth, h: container.clientHeight })
      }
    }

    window.addEventListener('resize', handleResize)
    setTimeout(handleResize, 100)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getScreenX = (dist: number, width: number) => {
    const minX = width * 0.25
    const maxX = width * 0.9
    const minD = 0.5
    const maxD = 5.0
    return minX + ((dist - minD) / (maxD - minD)) * (maxX - minX)
  }

  const getDistanceAtX = (x: number, width: number) => {
    const minX = width * 0.25
    const maxX = width * 0.9
    const minD = 0.5
    const maxD = 5.0
    const norm = (x - minX) / (maxX - minX)
    return Math.max(minD, Math.min(maxD, minD + norm * (maxD - minD)))
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = diagramRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const x = clientX - rect.left
    const screenX = getScreenX(distance, canvas.width)

    if (Math.abs(x - screenX) < 30) {
      isDraggingRef.current = true
      document.body.style.cursor = 'ew-resize'
    }
  }

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current || !diagramRef.current) return
      const rect = diagramRef.current.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const x = clientX - rect.left
      setDistance(getDistanceAtX(x, diagramRef.current.width))
    }

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        document.body.style.cursor = 'default'
      }
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove)
    window.addEventListener('touchend', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [])

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

    let factor = 0
    if (lambda >= 380 && lambda < 420) factor = 0.3 + 0.7 * (lambda - 380) / (420 - 380)
    else if (lambda >= 420 && lambda < 701) factor = 1.0
    else if (lambda >= 701 && lambda < 780) factor = 0.3 + 0.7 * (780 - lambda) / (780 - 700)

    const red = Math.round(r * factor * 255)
    const green = Math.round(g * factor * 255)
    const blue = Math.round(b * factor * 255)
    return `rgb(${red}, ${green}, ${blue})`
  }

  useEffect(() => {
    const colorStr = getWavelengthColor(wavelength)
    const a = slitWidth * 1e-6
    const lambdaMeters = wavelength * 1e-9
    const D = distance

    if (diagramRef.current) {
      const ctx = diagramRef.current.getContext('2d')
      if (ctx) {
        const w = diagramRef.current.width
        const h = diagramRef.current.height
        const cy = h / 2

        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = isDraggingRef.current ? '#1e293b' : '#0f172a'
        ctx.fillRect(0, 0, w, h)

        const slitX = w * 0.15
        const screenX = getScreenX(distance, w)
        const realTheta = Math.asin(lambdaMeters / a)
        const visualTheta = Math.max(0.035, Math.min(Math.PI / 7, realTheta * 25))
        const coneHalfHeight = (screenX - slitX) * Math.tan(visualTheta)

        const rgbMatch = colorStr.match(/\d+/g)
        const R = rgbMatch?.[0] || '255'
        const G = rgbMatch?.[1] || '255'
        const B = rgbMatch?.[2] || '255'

        ctx.strokeStyle = '#64748b'
        ctx.setLineDash([8, 6])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, cy)
        ctx.lineTo(w, cy)
        ctx.stroke()
        ctx.setLineDash([])

        const beamHeight = 4
        const incidentGrad = ctx.createLinearGradient(0, cy, slitX, cy)
        incidentGrad.addColorStop(0, `rgba(${R},${G},${B},0.0)`)
        incidentGrad.addColorStop(0.2, `rgba(${R},${G},${B},0.8)`)
        incidentGrad.addColorStop(1, `rgba(${R},${G},${B},0.8)`)

        ctx.fillStyle = incidentGrad
        ctx.fillRect(0, cy - beamHeight / 2, slitX, beamHeight)
        ctx.shadowBlur = 10
        ctx.shadowColor = `rgba(${R},${G},${B},0.8)`
        ctx.fillRect(0, cy - 1, slitX, 2)
        ctx.shadowBlur = 0

        const secH = coneHalfHeight * 0.25
        const secGap = coneHalfHeight * 1.35
        const outerLimit = secGap + secH

        const wideGrad = ctx.createLinearGradient(slitX, cy, screenX, cy)
        wideGrad.addColorStop(0, `rgba(${R},${G},${B},0.2)`)
        wideGrad.addColorStop(1, `rgba(${R},${G},${B},0.05)`)

        ctx.fillStyle = wideGrad
        ctx.beginPath()
        ctx.moveTo(slitX, cy)
        ctx.lineTo(screenX, cy - outerLimit)
        ctx.lineTo(screenX, cy + outerLimit)
        ctx.closePath()
        ctx.fill()

        const coneGrad = ctx.createLinearGradient(slitX, cy, screenX, cy)
        coneGrad.addColorStop(0, `rgba(${R},${G},${B},0.8)`)
        coneGrad.addColorStop(1, `rgba(${R},${G},${B},0.1)`)

        ctx.fillStyle = coneGrad
        ctx.beginPath()
        ctx.moveTo(slitX, cy - 1)
        ctx.lineTo(slitX, cy + 1)
        ctx.lineTo(screenX, cy + coneHalfHeight)
        ctx.lineTo(screenX, cy - coneHalfHeight)
        ctx.closePath()
        ctx.fill()

        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(slitX, cy)
        ctx.lineTo(screenX, cy - coneHalfHeight)
        ctx.moveTo(slitX, cy)
        ctx.lineTo(screenX, cy + coneHalfHeight)
        ctx.stroke()

        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(slitX, cy - 80)
        ctx.lineTo(slitX, cy - 4)
        ctx.moveTo(slitX, cy + 4)
        ctx.lineTo(slitX, cy + 80)
        ctx.stroke()
        ctx.lineCap = 'butt'

        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(screenX, cy - 220)
        ctx.lineTo(screenX, cy + 220)
        ctx.stroke()

        ctx.fillStyle = `rgb(${R},${G},${B})`
        ctx.shadowBlur = 10
        ctx.shadowColor = `rgba(${R},${G},${B},0.5)`
        ctx.beginPath()
        ctx.ellipse(screenX, cy, 6, coneHalfHeight, 0, 0, 2 * Math.PI)
        ctx.fill()
        ctx.shadowBlur = 0

        ctx.beginPath()
        ctx.ellipse(screenX, cy - secGap, 4, secH, 0, 0, 2 * Math.PI)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(screenX, cy + secGap, 4, secH, 0, 0, 2 * Math.PI)
        ctx.fill()

        const arcRadius = 70
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(slitX, cy, arcRadius, -visualTheta, 0)
        ctx.stroke()

        const arrowAngle = -visualTheta
        const arrowX = slitX + arcRadius * Math.cos(arrowAngle)
        const arrowY = cy + arcRadius * Math.sin(arrowAngle)
        ctx.beginPath()
        ctx.moveTo(arrowX, arrowY)
        ctx.lineTo(arrowX - 5, arrowY + 8)
        ctx.lineTo(arrowX + 8, arrowY + 2)
        ctx.closePath()
        ctx.fillStyle = '#fbbf24'
        ctx.fill()

        ctx.font = 'bold italic 16px serif'
        ctx.fillText('a', slitX + arcRadius + 10, cy - 8)

        const dimY = cy + 100
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(slitX, dimY)
        ctx.lineTo(screenX, dimY)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(slitX, dimY - 6)
        ctx.lineTo(slitX, dimY + 6)
        ctx.moveTo(screenX, dimY - 6)
        ctx.lineTo(screenX, dimY + 6)
        ctx.stroke()
        ctx.fillStyle = '#94a3b8'
        ctx.beginPath()
        ctx.moveTo(slitX + 8, dimY - 4)
        ctx.lineTo(slitX, dimY)
        ctx.lineTo(slitX + 8, dimY + 4)
        ctx.moveTo(screenX - 8, dimY - 4)
        ctx.lineTo(screenX, dimY)
        ctx.lineTo(screenX - 8, dimY + 4)
        ctx.fill()

        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('D', slitX + (screenX - slitX) / 2, dimY - 10)

        const dimX = screenX + 50
        ctx.strokeStyle = '#94a3b8'
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(screenX, cy - coneHalfHeight)
        ctx.lineTo(dimX + 10, cy - coneHalfHeight)
        ctx.moveTo(screenX, cy + coneHalfHeight)
        ctx.lineTo(dimX + 10, cy + coneHalfHeight)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.beginPath()
        ctx.moveTo(dimX, cy - coneHalfHeight)
        ctx.lineTo(dimX, cy + coneHalfHeight)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(dimX - 4, cy - coneHalfHeight + 8)
        ctx.lineTo(dimX, cy - coneHalfHeight)
        ctx.lineTo(dimX + 4, cy - coneHalfHeight + 8)
        ctx.moveTo(dimX - 4, cy + coneHalfHeight - 8)
        ctx.lineTo(dimX, cy + coneHalfHeight)
        ctx.lineTo(dimX + 4, cy + coneHalfHeight - 8)
        ctx.fill()

        ctx.textAlign = 'left'
        ctx.fillText('L', dimX + 12, cy + 5)

        ctx.fillStyle = isDraggingRef.current ? '#fbbf24' : '#475569'
        ctx.beginPath()
        ctx.arc(screenX, dimY, 5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const screenRealWidth = 0.15

    if (screenRef.current) {
      const ctx = screenRef.current.getContext('2d')
      if (ctx) {
        const w = screenRef.current.width
        const h = screenRef.current.height
        const imageData = ctx.createImageData(w, h)
        const data = imageData.data

        const rgbMatch = colorStr.match(/\d+/g)
        const R = parseInt(rgbMatch?.[0] || '255', 10)
        const G = parseInt(rgbMatch?.[1] || '255', 10)
        const B = parseInt(rgbMatch?.[2] || '255', 10)

        for (let px = 0; px < w; px++) {
          const xMeters = ((px - w / 2) / w) * screenRealWidth
          let intensity = 0
          if (lambdaMeters > 0 && D > 0) {
            const u = (Math.PI * a * xMeters) / (lambdaMeters * D)
            intensity = Math.abs(u) < 1e-6 ? 1 : Math.pow(Math.sin(u) / u, 2)
          }

          const visualIntensity = Math.min(1, Math.pow(intensity, 0.6) * 1.5)

          for (let py = 0; py < h; py++) {
            const dy = Math.abs(py - h / 2)
            const verticalFactor = Math.max(0, 1 - Math.pow(dy / (h * 0.35), 2))
            const idx = (py * w + px) * 4
            data[idx] = R
            data[idx + 1] = G
            data[idx + 2] = B
            data[idx + 3] = Math.min(255, visualIntensity * verticalFactor * 255)
          }
        }
        ctx.putImageData(imageData, 0, 0)

        const lPhysical = (2 * lambdaMeters * D) / a
        const lPixels = (lPhysical / screenRealWidth) * w
        const centerX = w / 2

        if (lPixels > 10 && lPixels < w) {
          const arrowY = h * 0.8
          const startX = centerX - lPixels / 2
          const endX = centerX + lPixels / 2

          ctx.strokeStyle = '#fbbf24'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(startX, arrowY)
          ctx.lineTo(endX, arrowY)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(startX, arrowY - 4)
          ctx.lineTo(startX, arrowY + 4)
          ctx.moveTo(endX, arrowY - 4)
          ctx.lineTo(endX, arrowY + 4)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(startX + 5, arrowY - 3)
          ctx.lineTo(startX, arrowY)
          ctx.lineTo(startX + 5, arrowY + 3)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(endX - 5, arrowY - 3)
          ctx.lineTo(endX, arrowY)
          ctx.lineTo(endX - 5, arrowY + 3)
          ctx.stroke()

          ctx.fillStyle = '#fbbf24'
          ctx.font = 'bold 12px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('L', centerX, arrowY - 6)
          ctx.fillStyle = 'rgba(251, 191, 36, 0.7)'
          ctx.font = '10px monospace'
          ctx.fillText(`${(lPhysical * 1000).toFixed(1)} mm`, centerX, arrowY + 14)
        }
      }
    }
  }, [dimensions, distance, slitWidth, wavelength])

  return (
    <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-100">Diffraction</h3>
        <button
          onClick={() => {
            setWavelength(400)
            setSlitWidth(100)
            setDistance(2.0)
          }}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_320px]">
        <div className="rounded-2xl border border-slate-700 bg-slate-950 shadow-inner h-[560px] overflow-hidden">
          <div className="flex flex-col w-full h-full gap-4 p-4">
            <div className="flex-shrink-0 relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-xl cursor-ew-resize">
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 rounded text-xs text-slate-400 font-mono uppercase z-10 pointer-events-none">
                Montage experimental (glisser l&apos;ecran)
              </div>
              <canvas
                ref={diagramRef}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                className="w-full h-full block touch-none"
              />
            </div>

            <div className="flex-1 flex gap-4 min-h-0">
              <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-700 bg-black shadow-lg">
                <div className="absolute top-2 left-2 px-2 py-1 bg-white/10 rounded text-[10px] text-slate-300 font-mono uppercase z-10">
                  Figure de diffraction
                </div>
                <canvas ref={screenRef} className="w-full h-full block" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="bg-slate-700/50 rounded-xl p-4 space-y-4 border border-slate-600">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Parametres</h4>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Longueur d&apos;onde (lambda)</span>
                <span className="font-mono" style={{ color: getWavelengthColor(wavelength) }}>{wavelength} nm</span>
              </div>
              <input
                type="range"
                min="380"
                max="750"
                step="1"
                value={wavelength}
                onChange={(e) => setWavelength(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Largeur fente (a)</span>
                <span className="text-emerald-400 font-mono">{slitWidth} um</span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={slitWidth}
                onChange={(e) => setSlitWidth(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-600">
              <div className="text-xs text-slate-400 uppercase mb-1">Distance (D)</div>
              <div className="text-xl font-mono text-amber-400">{distance.toFixed(2)} m</div>
              <div className="text-[10px] text-slate-500 mt-1 italic">Glissez l&apos;ecran blanc ci-dessus pour ajuster</div>
            </div>
          </section>

          <section className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/50">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Theorie</h4>
            <div className="text-xs text-slate-400 leading-relaxed font-mono bg-slate-800 p-2 rounded mb-2 text-center text-blue-300">
              L = 2.lambda.D / a
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Observez que la tache centrale s&apos;elargit si vous eloignez l&apos;ecran ou reduisez la fente.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
