/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, Clock, ArrowRight } from 'lucide-react';

export const TimeDelaySimulator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Parameters
  const [distance, setDistance] = useState(200); // pixels between M and M'
  const [speed, setSpeed] = useState(2); // pixels per frame
  
  const timeRef = useRef(0);
  const pauseRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  
  // History for graphs
  const historyM = useRef<number[]>([]);
  const historyMPrime = useRef<number[]>([]);

  const POS_M = 100;
  const SCALE = 100; // 100px = 1m
  const FPS = 60;
  const CANVAS_WIDTH = 800;
  
  // Physics Calculation Helper
  const getAmplitude = useCallback((t: number, x: number) => {
    const pulseCenter = speed * (t - 20); 
    const pulseWidth = 40;
    return 60 * Math.exp(-Math.pow(x - pulseCenter, 2) / (2 * pulseWidth * pulseWidth));
  }, [speed]);

  const draw = useCallback(() => {
    if (!canvasRef.current || !graphRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const graphCtx = graphRef.current.getContext('2d');
    if (!ctx || !graphCtx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const graphHeight = graphRef.current.height;

    const t = timeRef.current;
    const posMPrime = POS_M + distance;

    // --- Draw Wave Simulation (Top Canvas) ---
    ctx.clearRect(0, 0, width, height);
    
    // Draw Axis
    ctx.beginPath();
    ctx.strokeStyle = '#e2e8f0';
    ctx.moveTo(0, height/2);
    ctx.lineTo(width, height/2);
    ctx.stroke();

    // Draw Wave
    ctx.beginPath();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    for (let x = 0; x < width; x+=2) {
        const y = height/2 - getAmplitude(t, x);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw Point M
    const yM = height/2 - getAmplitude(t, POS_M);
    ctx.beginPath();
    ctx.fillStyle = '#3b82f6'; // Blue
    ctx.arc(POS_M, yM, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText("M", POS_M - 5, height/2 + 20);

    // Draw Point M'
    const yMPrime = height/2 - getAmplitude(t, posMPrime);
    ctx.beginPath();
    ctx.fillStyle = '#10b981'; // Green
    ctx.arc(posMPrime, yMPrime, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.fillText("M'", posMPrime - 5, height/2 + 20);

    // Draw Distance Arrow
    ctx.beginPath();
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([5, 5]);
    ctx.moveTo(POS_M, height/2 + 30);
    ctx.lineTo(posMPrime, height/2 + 30);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 12px sans-serif';
    ctx.fillText(`d = ${(distance/SCALE).toFixed(2)}m`, POS_M + distance/2 - 20, height/2 + 45);


    // --- Draw Graphs (Bottom Canvas) ---
    graphCtx.clearRect(0, 0, width, graphHeight);
    
    // Draw Axes
    graphCtx.strokeStyle = '#e2e8f0';
    graphCtx.lineWidth = 1;
    // M Axis
    graphCtx.beginPath();
    graphCtx.moveTo(0, graphHeight/4 * 3);
    graphCtx.lineTo(width, graphHeight/4 * 3);
    graphCtx.stroke();
    
    // M' Axis
    graphCtx.beginPath();
    graphCtx.moveTo(0, graphHeight/4);
    graphCtx.lineTo(width, graphHeight/4);
    graphCtx.stroke();

    // Draw History M (Blue)
    if (historyM.current.length > 0) {
        graphCtx.beginPath();
        graphCtx.strokeStyle = '#3b82f6';
        graphCtx.lineWidth = 2;
        for (let i = 0; i < historyM.current.length; i++) {
            const x = width - (historyM.current.length - i);
            const y = (graphHeight/4 * 3) - historyM.current[i] * 0.5;
            if (i === 0) graphCtx.moveTo(x, y);
            else graphCtx.lineTo(x, y);
        }
        graphCtx.stroke();
    }
    
    // Draw History M' (Green)
    if (historyMPrime.current.length > 0) {
        graphCtx.beginPath();
        graphCtx.strokeStyle = '#10b981';
        graphCtx.lineWidth = 2;
        for (let i = 0; i < historyMPrime.current.length; i++) {
            const x = width - (historyMPrime.current.length - i);
            const y = (graphHeight/4) - historyMPrime.current[i] * 0.5;
            if (i === 0) graphCtx.moveTo(x, y);
            else graphCtx.lineTo(x, y);
        }
        graphCtx.stroke();
    }

    // Labels
    graphCtx.fillStyle = '#3b82f6';
    graphCtx.font = '12px sans-serif';
    graphCtx.fillText("y_M(t)", 10, graphHeight/4 * 3 - 40);
    
    graphCtx.fillStyle = '#10b981';
    graphCtx.fillText("y_M'(t)", 10, graphHeight/4 - 40);
    
    // Pause text
    if (pauseRef.current > 0) {
        graphCtx.fillStyle = 'rgba(0,0,0,0.5)';
        graphCtx.font = 'bold 14px sans-serif';
        graphCtx.fillText("OBSERVATION DU RETARD", width/2 - 80, graphHeight/2 + 5);
    }

  }, [distance, speed, getAmplitude, SCALE]);

  const animate = useCallback(() => {
    if (isPlaying) {
      // Handle Pause
      if (pauseRef.current > 0) {
          pauseRef.current--;
          if (pauseRef.current === 0) {
              // Pause ended, reset
              timeRef.current = 0;
              historyM.current = [];
              historyMPrime.current = [];
          }
          draw(); // Keep drawing static state
          animationRef.current = requestAnimationFrame(animate);
          return;
      }

      timeRef.current += 1;
      const t = timeRef.current;
      const posMPrime = POS_M + distance;

      // Update History
      historyM.current.push(getAmplitude(t, POS_M));
      historyMPrime.current.push(getAmplitude(t, posMPrime));
      
      // Limit history to canvas width
      if (historyM.current.length > CANVAS_WIDTH) {
          historyM.current.shift();
          historyMPrime.current.shift();
      }

      // Check for end of cycle
      // Wave must clear the screen + buffer. 
      // Wave center = speed * (t - 20). We want center > 800 + 100 buffer.
      const pulseCenter = speed * (t - 20);
      if (pulseCenter > CANVAS_WIDTH + 100) {
         // Trigger pause
         pauseRef.current = 120; // 2 seconds at 60fps
      }
      
      draw();
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, draw, speed, distance, getAmplitude]);

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
    historyM.current = [];
    historyMPrime.current = [];
    draw();
  };

  // Physical units for display
  const distanceM = (distance / SCALE).toFixed(2);
  const speedMS = ((speed * FPS) / SCALE).toFixed(1);
  const tauSeconds = (distance / speed / FPS).toFixed(2);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden my-8">
      <div className="bg-slate-50 p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Clock size={18} className="text-indigo-500" />
          Simulateur : Retard Temporel (τ)
        </h3>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200/80 motion-reduce:transition-none motion-reduce:active:scale-100 ${
              isPlaying ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
            aria-label={isPlaying ? 'Mettre en pause' : 'Lancer le retard temporel'}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button type="button"
            onClick={reset}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-700 transition-[background-color,color,transform] duration-150 ease-out hover:bg-slate-300 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/80 motion-reduce:transition-none motion-reduce:active:scale-100"
            aria-label="Reinitialiser le retard temporel"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label htmlFor="time-delay-distance" className="text-xs font-bold text-slate-500 uppercase block mb-2">Distance MM' (d)</label>
              <input 
                id="time-delay-distance"
                type="range" 
                min="50" 
                max="400" 
                value={distance} 
                onChange={(e) => { setDistance(Number(e.target.value)); reset(); }}
                className="w-full accent-indigo-500 mb-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200/70"
              />
              <div className="flex justify-between text-sm tabular-nums">
                  <span>0.50 m</span>
                  <span className="font-bold text-indigo-600">{distanceM} m</span>
                  <span>4.00 m</span>
              </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label htmlFor="time-delay-speed" className="text-xs font-bold text-slate-500 uppercase block mb-2">Célérité (v)</label>
              <input 
                id="time-delay-speed"
                type="range" 
                min="1" 
                max="10" 
                step="0.5"
                value={speed} 
                onChange={(e) => { setSpeed(Number(e.target.value)); reset(); }}
                className="w-full accent-indigo-500 mb-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200/70"
              />
              <div className="flex justify-between text-sm tabular-nums">
                  <span>0.6 m/s</span>
                  <span className="font-bold text-indigo-600">{speedMS} m/s</span>
                  <span>6.0 m/s</span>
              </div>
          </div>
      </div>

      <div className="relative w-full bg-white border-t border-slate-100">
        {/* Simulation Area */}
        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          className="w-full h-48 block"
        />
        
        {/* Divider */}
        <div className="h-px bg-slate-200 w-full"></div>

        {/* Graphs Area */}
        <div className="relative">
            <canvas
            ref={graphRef}
            width={800}
            height={200}
            className="w-full h-48 block bg-slate-50/50"
            />
            <div className="absolute top-2 right-4 text-xs text-slate-400 pointer-events-none text-right">
                <div>Évolution temporelle</div>
                <div>(Défilement →)</div>
            </div>
        </div>
      </div>

      <div className="bg-indigo-50 p-4 flex flex-col sm:flex-row items-center justify-center gap-8 border-t border-indigo-100">
          <div className="flex items-center gap-4 font-serif text-xl text-indigo-900 bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
            <span>τ = </span>
            <div className="flex flex-col items-center justify-center leading-none mx-1">
                <span className="border-b border-indigo-900 pb-0.5 mb-0.5 block w-full text-center">d</span>
                <span className="block w-full text-center">v</span>
            </div>
          </div>
          
          <ArrowRight className="text-indigo-300 hidden sm:block" />
          
          <div className="text-center">
              <div className="text-xs text-indigo-400 font-bold uppercase mb-1">Retard calculé</div>
              <div className="font-mono text-2xl font-bold text-indigo-700 tabular-nums">
                  {tauSeconds} <span className="text-sm font-normal text-indigo-500">s</span>
              </div>
          </div>
      </div>
    </div>
  );
};
