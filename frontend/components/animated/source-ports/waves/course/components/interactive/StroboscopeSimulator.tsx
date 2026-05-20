/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Zap, Disc, Eye, Gauge } from 'lucide-react';

export const StroboscopeSimulator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [simSpeed, setSimSpeed] = useState(0.2); // Default to slow motion (0.2x)
  
  const [freqReal, setFreqReal] = useState(20); // Default to higher freq
  const [freqFlash, setFreqFlash] = useState(19); // Default to slight offset (slow motion)
  
  const timeRef = useRef(0);
  const animationRef = useRef<number>();

  const draw = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35; 

    // 1. Dark Room Background
    ctx.fillStyle = '#0f172a'; // Slate-900
    ctx.fillRect(0, 0, width, height);

    // --- 2. Draw Disk (Static Background parts) ---
    // Outer rim - Light grey to stand out in dark
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b'; // Slate-800 (Darker disk)
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#475569'; // Slate-600
    ctx.stroke();
    
    // Graduations / Markings on disk to see rotation better
    for(let i=0; i<12; i++) {
        const angle = (i * Math.PI * 2) / 12;
        const rIn = radius * 0.85;
        const rOut = radius * 0.95;
        ctx.beginPath();
        ctx.moveTo(centerX + rIn * Math.cos(angle), centerY + rIn * Math.sin(angle));
        ctx.lineTo(centerX + rOut * Math.cos(angle), centerY + rOut * Math.sin(angle));
        ctx.strokeStyle = '#64748b';
        ctx.stroke();
    }
    
    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(centerX - 10, centerY); ctx.lineTo(centerX + 10, centerY);
    ctx.moveTo(centerX, centerY - 10); ctx.lineTo(centerX, centerY + 10);
    ctx.strokeStyle = '#94a3b8';
    ctx.stroke();

    const t = timeRef.current;
    
    // --- 3. Real Motion (The "Truth") ---
    const thetaReal = 2 * Math.PI * freqReal * t;
    const realX = centerX + radius * 0.7 * Math.cos(thetaReal);
    const realY = centerY + radius * 0.7 * Math.sin(thetaReal);

    // Ghost dot (dim)
    ctx.beginPath();
    ctx.arc(realX, realY, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // Very faint blue
    ctx.fill();
    
    // --- 4. Stroboscopic Effect (The "Perception") ---
    const periodFlash = 1 / freqFlash;
    const lastFlashIndex = Math.floor(t / periodFlash);
    const lastFlashTime = lastFlashIndex * periodFlash;
    
    const thetaStrobe = 2 * Math.PI * freqReal * lastFlashTime;
    
    const strobeX = centerX + radius * 0.7 * Math.cos(thetaStrobe);
    const strobeY = centerY + radius * 0.7 * Math.sin(thetaStrobe);

    // The perceived dot is only drawn if we are currently "in the dark" retaining the image (persistence of vision)
    // or drawn brightly during flash.
    // For simulation, we draw the "Perceived" dot brightly.
    
    ctx.beginPath();
    ctx.arc(strobeX, strobeY, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444'; // Red
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    // --- 5. Flash Effect ---
    const timeSinceFlash = t - lastFlashTime;
    // Scale flash duration by speed so it's visible even at high speeds, but physically meaningful?
    // No, flash duration is physical. But for viz, if we slow down time, the flash lingers longer in real time.
    // Visual duration = RealDuration / simSpeed ? 
    // Actually, if we want to see the flash, 50ms is good in real-time.
    // If we slow time, 50ms sim-time becomes 50ms/speed real-time (longer).
    const flashDuration = 0.04; 
    
    if (timeSinceFlash < flashDuration) {
        // Bright flash overlay
        const alpha = 1 - (timeSinceFlash / flashDuration);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.3})`; // Flash lights up the room
        ctx.fillRect(0, 0, width, height);
        
        // "FLASH" Text indicator - Bright Yellow
        ctx.save();
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 20;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; 
        ctx.font = '900 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("⚡ FLASH", width/2, 50);
        ctx.restore();
    }
  };

  useEffect(() => {
    let lastTime = performance.now();
    const loop = (now: number) => {
      if (isPlaying) {
        const dt = (now - lastTime) / 1000;
        timeRef.current += dt * simSpeed; // Apply simulation speed
      }
      lastTime = now;
      draw();
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current!);
  }, [isPlaying, freqReal, freqFlash, simSpeed]);

  // Physics Calculation for UI
  const k = Math.round(freqReal / freqFlash);
  const apparentFreq = freqReal - k * freqFlash; 
  const isImmobile = Math.abs(apparentFreq) < 0.1;
  
  let movementText = "";
  if (isImmobile) {
      movementText = "Immobilité Apparente";
  } else if (apparentFreq > 0) {
      movementText = "Ralenti (Sens Réel)";
  } else {
      movementText = "Ralenti (Sens Inverse)";
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 my-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Zap size={20} className="text-yellow-500 fill-yellow-500"/> Stroboscope
        </h3>
        
        <div className={`px-4 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 ${
            isImmobile 
                ? 'bg-green-50 text-green-700 border-green-200' 
                : 'bg-slate-50 text-slate-700 border-slate-200'
        }`}>
            <Eye size={18}/>
            {movementText}
            {!isImmobile && <span className="opacity-75 ml-1">({Math.abs(apparentFreq).toFixed(2)} Hz)</span>}
        </div>
      </div>

      {/* Canvas container with Dark Background */}
      <div className="flex justify-center bg-slate-900 rounded-xl border-4 border-slate-800 mb-6 overflow-hidden shadow-inner relative">
         <canvas ref={canvasRef} width={500} height={400} className="max-w-full h-auto" />
         
         {/* Speed Control Overlay */}
         <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur p-2 rounded-lg border border-slate-700 text-white text-xs">
             <label className="flex items-center gap-2 mb-1 font-bold text-slate-300">
                 <Gauge size={14}/> Vitesse Lecture
                 <span className="text-blue-400">x{simSpeed.toFixed(1)}</span>
             </label>
             <input 
                type="range" 
                min="0.1" max="1" step="0.1" 
                value={simSpeed} 
                onChange={e => setSimSpeed(Number(e.target.value))}
                className="w-32 accent-blue-500 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer"
             />
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
          <div className="space-y-2">
              <label className="flex justify-between text-sm font-bold text-slate-600">
                  <span className="flex items-center gap-2"><Disc size={16}/> Fréquence Disque (f)</span>
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">{freqReal} Hz</span>
              </label>
              <input type="range" min="10" max="60" step="1" value={freqReal} onChange={e => setFreqReal(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
              <div className="flex justify-between text-xs text-slate-400 px-1">
                  <span>10 Hz</span>
                  <span>60 Hz</span>
              </div>
          </div>
          <div className="space-y-2">
              <label className="flex justify-between text-sm font-bold text-slate-600">
                  <span className="flex items-center gap-2"><Zap size={16}/> Fréquence Éclairs (fe)</span>
                  <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-mono">{freqFlash.toFixed(1)} Hz</span>
              </label>
              <input type="range" min="10" max="60" step="0.5" value={freqFlash} onChange={e => setFreqFlash(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500" />
              <div className="flex justify-between text-xs text-slate-400 px-1">
                  <span>10 Hz</span>
                  <span>60 Hz</span>
              </div>
          </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => { setFreqReal(20); setFreqFlash(20); }} className="px-3 py-2 bg-green-50 text-green-700 text-xs font-bold rounded border border-green-200 hover:bg-green-100 transition-colors">
              Immobilité (f = fe)
          </button>
          <button onClick={() => { setFreqReal(40); setFreqFlash(20); }} className="px-3 py-2 bg-green-50 text-green-700 text-xs font-bold rounded border border-green-200 hover:bg-green-100 transition-colors">
              Immobilité (f = 2*fe)
          </button>
          <button onClick={() => { setFreqReal(20); setFreqFlash(19); }} className="px-3 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded border border-blue-200 hover:bg-blue-100 transition-colors">
              Ralenti Avant (fe &lt; f)
          </button>
          <button onClick={() => { setFreqReal(20); setFreqFlash(21); }} className="px-3 py-2 bg-orange-50 text-orange-700 text-xs font-bold rounded border border-orange-200 hover:bg-orange-100 transition-colors">
              Ralenti Arrière (fe &gt; f)
          </button>
      </div>
    </div>
  );
};
