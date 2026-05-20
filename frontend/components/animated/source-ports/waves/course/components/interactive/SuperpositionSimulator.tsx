/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, Activity, ZapOff } from 'lucide-react';

export const SuperpositionSimulator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<'constructive' | 'destructive'>('constructive');
  const timeRef = useRef(0);
  const animationRef = useRef<number>();
  const pauseRef = useRef(0);
  const hasPausedRef = useRef(false);

  // Animation Parameters
  const WIDTH = 800;
  const HEIGHT = 300;
  const BASE_Y = HEIGHT / 2;
  const PULSE_WIDTH = 2000; // proportional to variance
  const SPEED = 1.5;

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw Grid/Axis
    ctx.beginPath();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.moveTo(0, BASE_Y);
    ctx.lineTo(WIDTH, BASE_Y);
    ctx.stroke();

    const t = timeRef.current;

    // Calculate Pulse Positions
    // Pulse 1 starts at 100, moves right
    const x1 = 100 + t * SPEED;
    // Pulse 2 starts at 700, moves left
    const x2 = 700 - t * SPEED;

    // Loop to draw curves
    const points1: {x: number, y: number}[] = [];
    const points2: {x: number, y: number}[] = [];
    const pointsSum: {x: number, y: number}[] = [];

    for (let x = 0; x <= WIDTH; x += 2) {
      // Gaussian Pulse: A * exp(-(x-c)^2 / (2*w^2))
      // Pulse 1 (Blue, always up)
      const y1 = 60 * Math.exp(-Math.pow(x - x1, 2) / PULSE_WIDTH);
      
      // Pulse 2 (Red, up or down based on mode)
      const sign = mode === 'constructive' ? 1 : -1;
      const y2 = sign * 60 * Math.exp(-Math.pow(x - x2, 2) / PULSE_WIDTH);

      const ySum = y1 + y2;

      points1.push({ x, y: BASE_Y - y1 });
      points2.push({ x, y: BASE_Y - y2 });
      pointsSum.push({ x, y: BASE_Y - ySum });
    }

    // Draw Pulse 1 (Ghost)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'; // Blue-500, low opacity
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.moveTo(points1[0].x, points1[0].y);
    points1.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Draw Pulse 2 (Ghost)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)'; // Red-500, low opacity
    ctx.moveTo(points2[0].x, points2[0].y);
    points2.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw Resultant Wave (Solid)
    ctx.beginPath();
    ctx.strokeStyle = '#8b5cf6'; // Violet-500
    ctx.lineWidth = 4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(139, 92, 246, 0.4)';
    ctx.moveTo(pointsSum[0].x, pointsSum[0].y);
    pointsSum.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Labels
    if (x1 < WIDTH + 50) {
        ctx.fillStyle = '#3b82f6';
        ctx.font = '12px sans-serif';
        ctx.fillText("Onde 1", x1 - 20, BASE_Y - 80);
    }
    if (x2 > -50) {
        ctx.fillStyle = '#ef4444';
        ctx.font = '12px sans-serif';
        ctx.fillText("Onde 2", x2 - 20, mode === 'constructive' ? BASE_Y - 80 : BASE_Y + 90);
    }

    // Pause Indicator
    if (pauseRef.current > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText("PAUSE - OBSERVATION", WIDTH/2 - 70, BASE_Y + (mode === 'constructive' ? 120 : -120));
    }

  }, [mode]);

  const animate = useCallback(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) draw(ctx);
    }

    if (isPlaying) {
      if (pauseRef.current > 0) {
          pauseRef.current--;
          animationRef.current = requestAnimationFrame(animate);
          return;
      }

      const t = timeRef.current;
      // Meeting point check: x1 = 100 + t*1.5, x2 = 700 - t*1.5
      // Meet when 100 + 1.5t = 700 - 1.5t => 3t = 600 => t = 200
      if (Math.abs(t - 200) < 1 && !hasPausedRef.current) {
          pauseRef.current = 90; // 1.5s pause (60fps)
          hasPausedRef.current = true;
      }

      timeRef.current += 1;
      
      // Auto-reset loop
      if (timeRef.current > 450) {
        timeRef.current = 0;
        hasPausedRef.current = false;
      }
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, draw]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [animate]);

  const reset = () => {
    setIsPlaying(false);
    timeRef.current = 0;
    pauseRef.current = 0;
    hasPausedRef.current = false;
    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) draw(ctx);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden my-8">
      <div className="bg-slate-50 p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Activity size={18} className="text-violet-500" />
          Superposition des Ondes
        </h3>
        
        <div className="flex gap-2">
            <button
                onClick={() => { setMode('constructive'); timeRef.current = 0; }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                    mode === 'constructive' ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-500 ring-offset-1' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
            >
                <Activity size={14} /> CONSTRUCTIVE
            </button>
            <button
                onClick={() => { setMode('destructive'); timeRef.current = 0; }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                    mode === 'destructive' ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-500 ring-offset-1' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
            >
                <ZapOff size={14} /> DESTRUCTIVE
            </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-lg transition-colors ${
              isPlaying ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            onClick={reset}
            className="p-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      <div className="relative w-full bg-slate-900">
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          className="w-full h-64 block"
        />
        <div className="absolute top-4 left-4 text-xs text-slate-400 pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-0.5 bg-blue-500/50 border-t border-dashed border-blue-500"></div>
            <span>Onde 1 (Vers la droite)</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-0.5 bg-red-500/50 border-t border-dashed border-red-500"></div>
            <span>Onde 2 (Vers la gauche)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-violet-500 rounded-full"></div>
            <span className="text-white font-bold">Résultante (Somme)</span>
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-slate-50 border-t border-slate-100 text-sm text-slate-600 text-center">
        Observez comment les amplitudes s'ajoutent algébriquement lors du croisement.
        {mode === 'destructive' && " Dans le cas destructif, l'onde s'annule momentanément !"}
      </div>
    </div>
  );
};