/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, Settings } from 'lucide-react';

export const RopeWaveSimulator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // State for UI controls
  const [amplitude, setAmplitude] = useState(50);
  const [frequency, setFrequency] = useState(1);
  const [tension, setTension] = useState(50);
  const [damping, setDamping] = useState(10);
  
  // Refs for physics engine (mutable state accessed in loop)
  const params = useRef({ amplitude, frequency, tension, damping });
  
  // Update refs when state changes
  useEffect(() => {
    params.current = { amplitude, frequency, tension, damping };
  }, [amplitude, frequency, tension, damping]);

  // Physics state
  const NUM_POINTS = 200;
  const points = useRef(new Array(NUM_POINTS).fill(0).map(() => ({ y: 0, v: 0 })));
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef(0);

  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);

    // Draw Grid
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<width; i+=40) { ctx.moveTo(i,0); ctx.lineTo(i,height); }
    for(let i=0; i<height; i+=40) { ctx.moveTo(0,i); ctx.lineTo(width,i); }
    ctx.stroke();

    // Draw String
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const segmentWidth = width / NUM_POINTS;
    const centerY = height / 2;
    const pts = points.current;
    
    ctx.moveTo(0, centerY + pts[0].y);
    for (let i = 1; i < NUM_POINTS; i++) {
      ctx.lineTo(i * segmentWidth, centerY + pts[i].y);
    }
    ctx.stroke();

    // Draw Source Point
    ctx.beginPath();
    ctx.fillStyle = '#ef4444';
    ctx.arc(0, centerY + pts[0].y, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw End Point (Fixed)
    ctx.beginPath();
    ctx.fillStyle = '#64748b';
    ctx.arc(width, centerY, 4, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const animate = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { amplitude: amp, frequency: freq, tension: tens, damping: damp } = params.current;
    const pts = points.current;

    // Physics Constants
    // Tension affects wave speed (c). c^2 is proportional to tension.
    // Stability: k must be < 0.5.
    // Let's map tension 0-100 to a stable k range [0.01, 0.4]
    const k = 0.005 + (tens / 100) * 0.4;
    const dampFactor = 1 - (damp / 500); // 0 to 0.1 reduction per frame

    // 1. Drive Source
    timeRef.current += 1;
    // Convert frequency (Hz) to angular velocity per frame (assuming ~60fps)
    // freq Hz = freq * 2PI rad/s. dt = 1/60s.
    const t = timeRef.current / 60; 
    pts[0].y = amp * Math.sin(2 * Math.PI * freq * t);
    pts[0].v = 0; // Source doesn't react to string

    // 2. Calculate Accelerations (Forces)
    // We calculate 'next velocity' based on current positions
    const forces = new Float32Array(NUM_POINTS);
    for (let i = 1; i < NUM_POINTS - 1; i++) {
      // Wave equation discrete Laplacian: y[i-1] + y[i+1] - 2y[i]
      const force = k * (pts[i-1].y + pts[i+1].y - 2 * pts[i].y);
      forces[i] = force;
    }

    // 3. Update Positions (Semi-implicit Euler)
    for (let i = 1; i < NUM_POINTS - 1; i++) {
      pts[i].v += forces[i];
      pts[i].v *= dampFactor; // Apply damping to velocity
      pts[i].y += pts[i].v;
    }
    
    // Right end is fixed (pts[NUM_POINTS-1] stays 0)

    draw(ctx, canvas.width, canvas.height);
    animationRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, animate]);

  // Draw initial state on mount
  useEffect(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) draw(ctx, canvasRef.current.width, canvasRef.current.height);
    }
  }, [draw]);

  const reset = () => {
    setIsPlaying(false);
    points.current.forEach(p => { p.y = 0; p.v = 0; });
    timeRef.current = 0;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) draw(ctx, canvasRef.current.width, canvasRef.current.height);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden my-8">
      <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Settings size={18} className="text-blue-500" />
          Simulateur : Onde sur une corde
        </h3>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200/80 motion-reduce:transition-none motion-reduce:active:scale-100 ${
              isPlaying ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <><Pause size={18} /> PAUSE</> : <><Play size={18} /> ANIMER</>}
          </button>
          <button type="button"
            onClick={reset}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-700 transition-[background-color,color,transform] duration-150 ease-out hover:bg-slate-300 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/80 motion-reduce:transition-none motion-reduce:active:scale-100"
            aria-label="Reinitialiser la corde"
            title="Réinitialiser"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      <div className="relative bg-white w-full">
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          className="w-full h-64 md:h-80 cursor-crosshair touch-none"
        />
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg-slate-50 border-t border-slate-100">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
              <label htmlFor="rope-amplitude">Amplitude</label>
              <span className="tabular-nums">{amplitude} px</span>
            </div>
            <input
              id="rope-amplitude"
              type="range"
              min="10"
              max="100"
              value={amplitude}
              onChange={(e) => setAmplitude(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
              <label htmlFor="rope-frequency">Fréquence</label>
              <span className="tabular-nums">{frequency} Hz</span>
            </div>
            <input
              id="rope-frequency"
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200/70"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
              <label htmlFor="rope-tension">Tension</label>
              <span className="tabular-nums">{tension} %</span>
            </div>
            <input
              id="rope-tension"
              type="range"
              min="5"
              max="100"
              value={tension}
              onChange={(e) => setTension(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200/70"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
              <label htmlFor="rope-damping">Amortissement</label>
              <span className="tabular-nums">{damping} %</span>
            </div>
            <input
              id="rope-damping"
              type="range"
              min="0"
              max="50"
              value={damping}
              onChange={(e) => setDamping(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200/70"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
