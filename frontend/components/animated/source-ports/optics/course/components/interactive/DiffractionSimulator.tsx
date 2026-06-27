/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Info } from 'lucide-react';

export const DiffractionSimulator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wavelength, setWavelength] = useState(40); // px
  const [gapSize, setGapSize] = useState(40); // px
  const timeRef = useRef(0);
  const animationRef = useRef<number | null>(null);

  const draw = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const centerY = height / 2;
    const gapX = 150;

    // Reset canvas
    ctx.clearRect(0, 0, width, height);
    
    // Background (Water-like hint)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // --- Physics Calculations ---
    // Diffraction half-angle theta. 
    // If lambda >= gap, theta = 90deg (pi/2) -> Semicircle.
    // If lambda < gap, theta = asin(lambda/gap).
    let theta = Math.PI / 2;
    if (wavelength < gapSize) {
        theta = Math.asin(wavelength / gapSize);
    }
    
    // For visual clarity in "Geometric" limit (very small lambda), 
    // we prevent theta from being 0. We keep a minimum spread or switch to straight lines.
    const isGeometric = wavelength < gapSize * 0.2; 

    const t = timeRef.current;
    const v = 2; // px per frame
    const phaseOffset = (t * v) % wavelength;

    // --- 1. Draw Incident Waves (Left) ---
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3b82f6'; // Blue-500
    ctx.beginPath();
    // Draw from right to left to ensure phase matching at gapX
    // The wave at gapX has phase 'phaseOffset'.
    // So lines are at x = gapX - (phaseOffset + n*wavelength)
    for (let x = gapX - phaseOffset; x > 0; x -= wavelength) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    ctx.stroke();

    // --- 2. Draw Diffracted Waves (Right) ---
    // Waves emanate from the center of the gap (gapX, centerY)
    // Radius r = phaseOffset + n*wavelength
    
    ctx.beginPath();
    // We start drawing from the gap outwards
    for (let r = phaseOffset; r < width - gapX + height; r += wavelength) {
        if (r < 1) continue; // Avoid tiny center artifacts
        
        if (isGeometric) {
             // Straight lines continuing (Geometric Optics limit)
             // Just draw the portion passing through the gap
             ctx.moveTo(gapX + r, centerY - gapSize/2);
             ctx.lineTo(gapX + r, centerY + gapSize/2);
        } else {
            // Draw Arc
            // The arc spans from -theta to +theta
            ctx.moveTo(gapX + r * Math.cos(-theta), centerY + r * Math.sin(-theta));
            ctx.arc(gapX, centerY, r, -theta, theta);
        }
    }
    ctx.stroke();

    // --- 3. Draw Barrier ---
    ctx.fillStyle = '#1e293b'; // Slate-800
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 5;
    
    // Top Barrier
    ctx.fillRect(gapX - 4, 0, 8, centerY - gapSize/2);
    // Bottom Barrier
    ctx.fillRect(gapX - 4, centerY + gapSize/2, 8, height - (centerY + gapSize/2));
    
    ctx.shadowBlur = 0; // Reset shadow

    // --- 4. Draw Diffraction Cone Limits (Visual Aid) ---
    if (!isGeometric && theta < Math.PI/2 - 0.1) {
        ctx.strokeStyle = 'rgba(234, 88, 12, 0.3)'; // Faint Orange
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        // Top Line
        ctx.moveTo(gapX, centerY - gapSize/2);
        ctx.lineTo(gapX + Math.cos(-theta)*width, centerY + Math.sin(-theta)*width);
        // Bottom Line
        ctx.moveTo(gapX, centerY + gapSize/2);
        ctx.lineTo(gapX + Math.cos(theta)*width, centerY + Math.sin(theta)*width);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // --- Annotations ---
    ctx.fillStyle = '#1e293b';
    ctx.font = '12px sans-serif';
    // Wavelength Label
    // Find a nice spot on the left
    if (gapX > 60) {
        // Draw a small arrow between two wavefronts
        const x1 = gapX - phaseOffset - wavelength;
        const x2 = gapX - phaseOffset;
        if (x1 > 10) {
             drawDoubleArrow(ctx, x1, 20, x2, 20);
             ctx.fillText("λ", (x1+x2)/2 - 4, 15);
        }
    }

    // Gap Label
    drawDoubleArrow(ctx, gapX - 15, centerY - gapSize/2, gapX - 15, centerY + gapSize/2);
    ctx.fillText("a", gapX - 25, centerY + 4);
  };

  const drawDoubleArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
      // Arrowheads (simplified)
      // ...
  };

  useEffect(() => {
    let lastTime = performance.now();
    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      timeRef.current += 1; // Frame based for consistency or use dt
      draw();
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current!);
  }, [wavelength, gapSize]);

  const thetaDeg = Math.min(90, Math.round((Math.asin(Math.min(1, wavelength/gapSize)) * 180 / Math.PI)));

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 my-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            Simulateur de Diffraction
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                Huygens-Fresnel
            </span>
        </h3>
        <button type="button" onClick={() => { setWavelength(40); setGapSize(40); }} aria-label="Reinitialiser la diffraction" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-slate-100 hover:text-slate-600 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 motion-reduce:transition-none motion-reduce:active:scale-100">
            <RefreshCw size={18}/>
        </button>
      </div>

      <canvas ref={canvasRef} width={700} height={350} className="w-full bg-slate-50 rounded-xl border border-slate-200 mb-4 shadow-inner cursor-crosshair" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
              <div>
                  <label className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Longueur d'onde (λ)</span>
                      <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{wavelength} px</span>
                  </label>
                  <input type="range" min="10" max="100" value={wavelength} onChange={e => setWavelength(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>
              <div>
                  <label className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Ouverture (a)</span>
                      <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{gapSize} px</span>
                  </label>
                  <input type="range" min="10" max="150" value={gapSize} onChange={e => setGapSize(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-700" />
              </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-700 space-y-2">
             <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                 <span className="font-semibold">Condition λ/a :</span>
                 <span className="font-mono">{(wavelength/gapSize).toFixed(2)}</span>
             </div>
             <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                 <span className="font-semibold">Angle de diffraction (θ) :</span>
                 <span className="font-mono">{wavelength >= gapSize ? '90° (Max)' : `${thetaDeg}°`}</span>
             </div>
             <div className="pt-1">
                 {wavelength >= gapSize ? (
                     <div className="text-green-600 flex items-center gap-2">
                         <Info size={16}/> Diffraction prononcée. L'onde devient circulaire.
                     </div>
                 ) : wavelength < gapSize * 0.2 ? (
                     <div className="text-slate-500 flex items-center gap-2">
                         <Info size={16}/> Diffraction négligeable (Optique géométrique).
                     </div>
                 ) : (
                     <div className="text-orange-600 flex items-center gap-2">
                         <Info size={16}/> Diffraction partielle. L'onde s'étale dans un cône.
                     </div>
                 )}
             </div>
          </div>
      </div>
    </div>
  );
};
