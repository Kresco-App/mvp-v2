'use client'

import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Ruler, MoveHorizontal, Maximize2 } from 'lucide-react'
import { Slider } from './Slider'

export default function DiffractionSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [wavelength, setWavelength] = useState(650)
  const [slitWidth, setSlitWidth] = useState(50)
  const [distance, setDistance] = useState(2.0)

  const getWavelengthColor = (lambda: number) => {
    let r, g, b
    if (lambda >= 380 && lambda < 440) { r = -(lambda - 440) / (440 - 380); g = 0; b = 1 }
    else if (lambda >= 440 && lambda < 490) { r = 0; g = (lambda - 440) / (490 - 440); b = 1 }
    else if (lambda >= 490 && lambda < 510) { r = 0; g = 1; b = -(lambda - 510) / (510 - 490) }
    else if (lambda >= 510 && lambda < 580) { r = (lambda - 510) / (580 - 510); g = 1; b = 0 }
    else if (lambda >= 580 && lambda < 645) { r = 1; g = -(lambda - 645) / (645 - 580); b = 0 }
    else if (lambda >= 645 && lambda <= 780) { r = 1; g = 0; b = 0 }
    else { r = 0; g = 0; b = 0 }

    let factor
    if (lambda >= 380 && lambda < 420) factor = 0.3 + 0.7 * (lambda - 380) / (420 - 380)
    else if (lambda >= 420 && lambda < 701) factor = 1.0
    else if (lambda >= 701 && lambda < 780) factor = 0.3 + 0.7 * (780 - lambda) / (780 - 700)
    else factor = 0

    return {
      R: Math.round(r * factor * 255),
      G: Math.round(g * factor * 255),
      B: Math.round(b * factor * 255),
      str: `rgb(${Math.round(r * factor * 255)}, ${Math.round(g * factor * 255)}, ${Math.round(b * factor * 255)})`,
    }
  }

  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    const width = canvasRef.current.width
    const height = canvasRef.current.height
    const centerX = width / 2
    const centerY = height / 2

    const screenRealWidth = 0.15
    const pxPerMeter = width / screenRealWidth
    const L_meter = (2 * (wavelength * 1e-9) * distance) / (slitWidth * 1e-6)
    const L_px = L_meter * pxPerMeter

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, height)

    const color = getWavelengthColor(wavelength)
    const imageData = ctx.createImageData(width, height)
    const data = imageData.data

    for (let x = 0; x < width; x++) {
      const dxPx = x - centerX
      let intensity = 0
      if (L_px > 0) {
        const u = Math.PI * (dxPx / (L_px / 2))
        if (Math.abs(u) < 0.01) intensity = 1
        else intensity = Math.pow(Math.sin(u) / u, 2)
      }
      intensity = Math.min(1, intensity * 3)

      for (let y = centerY - 40; y < centerY + 40; y++) {
        if (y < 0 || y >= height) continue
        const dy = Math.abs(y - centerY)
        const vFactor = 1 - (dy / 40)
        const index = (y * width + x) * 4
        data[index] = color.R
        data[index + 1] = color.G
        data[index + 2] = color.B
        data[index + 3] = intensity * vFactor * 255
      }
    }
    ctx.putImageData(imageData, 0, 0)

    // Draw measurement
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 1
    const arrowY = centerY + 60
    const x1 = centerX - L_px / 2
    const x2 = centerX + L_px / 2

    if (L_px > 5) {
      ctx.beginPath()
      ctx.moveTo(x1, arrowY); ctx.lineTo(x2, arrowY)
      ctx.moveTo(x1, arrowY - 5); ctx.lineTo(x1, arrowY + 5)
      ctx.moveTo(x2, arrowY - 5); ctx.lineTo(x2, arrowY + 5)
      ctx.stroke()
      ctx.fillStyle = 'white'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`L = ${(L_meter * 100).toFixed(1)} cm`, centerX, arrowY + 20)
    }
  }, [wavelength, slitWidth, distance])

  const color = getWavelengthColor(wavelength)

  return (
    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <Maximize2 size={20} className="text-indigo-500" /> Diffraction de la Lumiere
        </h3>
        <button onClick={() => { setWavelength(650); setSlitWidth(50); setDistance(2) }} className="text-slate-400 hover:text-slate-400">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex justify-center bg-slate-900 rounded-xl border-4 border-slate-800 mb-6 overflow-hidden shadow-inner relative">
        <canvas ref={canvasRef} width={600} height={200} className="w-full h-48" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="flex justify-between text-xs font-bold text-slate-500 mb-1">
            <span>Longueur d&apos;onde (&lambda;)</span>
            <span style={{ color: color.str }}>{wavelength} nm</span>
          </label>
          <Slider min={400} max={750} value={[wavelength]} onValueChange={([val]) => setWavelength(val)} />
        </div>

        <div>
          <label className="flex justify-between text-xs font-bold text-slate-500 mb-1">
            <span className="flex items-center gap-1"><MoveHorizontal size={12} /> Largeur Fente (a)</span>
            <span>{slitWidth} &micro;m</span>
          </label>
          <Slider min={20} max={200} step={5} value={[slitWidth]} onValueChange={([val]) => setSlitWidth(val)} />
        </div>

        <div>
          <label className="flex justify-between text-xs font-bold text-slate-500 mb-1">
            <span className="flex items-center gap-1"><Ruler size={12} /> Distance (D)</span>
            <span>{distance.toFixed(1)} m</span>
          </label>
          <Slider min={0.5} max={5.0} step={0.1} value={[distance]} onValueChange={([val]) => setDistance(val)} />
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 text-blue-900 text-xs rounded-lg text-center font-mono">
        Largeur Tache Centrale : L = 2&middot;&lambda;&middot;D / a
      </div>
    </div>
  )
}
