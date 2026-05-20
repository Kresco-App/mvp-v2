/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, Volume2 } from 'lucide-react';

export const SoundWaveSimulator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frequency, setFrequency] = useState(2); // Hz
  const [amplitude, setAmplitude] = useState(10); // px
  
  const animationRef = useRef<number>();
  const timeRef = useRef(0);
  
  // Particle System Configuration
  const NUM_PARTICLES_X = 50; // More density
  const NUM_PARTICLES_Y = 12; 
  
  // Visual Geometry
  const CANVAS_HEIGHT = 300;
  const SOURCE_HEIGHT = 200; // Height of the speaker
  const SOURCE_TOP = (CANVAS_HEIGHT - SOURCE_HEIGHT) / 2; // Center vertical
  
  // We store particles in a ref to avoid re-renders
  const particlesRef = useRef<{x: number, y: number, baseX: number}[]>([]);
  const initializedRef = useRef(false);

  // Initialize particles once
  useEffect(() => {
    const pts = [];
    const canvasWidth = 800;
    
    // Calculate spacing
    const spacingX = canvasWidth / NUM_PARTICLES_X;
    // Distribute Y evenly within the source height, with some padding
    const paddingY = 20;
    const availableHeight = SOURCE_HEIGHT - (paddingY * 2);
    const spacingY = availableHeight / (NUM_PARTICLES_Y - 1);

    for (let i = 0; i < NUM_PARTICLES_X; i++) {
      for (let j = 0; j < NUM_PARTICLES_Y; j++) {
        const baseX = 60 + i * spacingX; // Start slightly after speaker
        const y = SOURCE_TOP + paddingY + j * spacingY;
        pts.push({
          x: baseX,
          y: y,
          baseX: baseX
        });
      }
    }
    particlesRef.current = pts;
    initializedRef.current = true;
    
    // Initial draw
    updateParticles(0);
    draw();
  }, []);

  // Physics update logic
  const updateParticles = useCallback((t: number) => {
    // Physics Tuning
    const k = 0.03; // Lower k = longer wavelength (smoother look)
    // Time scaling: slow down t slightly for smoothness
    const timeScale = 0.5; 
    // w depends on frequency. 
    const w = 0.1 * frequency; 
    
    const adjustedTime = t * timeScale;

    particlesRef.current.forEach(p => {
      // Longitudinal displacement: s(x,t) = A * cos(kx - wt)
      // We use a damping function (exponential decay) so waves appear to originate from source
      // rather than existing everywhere infinitely. But for a simple pipe simulation, infinite is fine.
      // Let's stick to infinite wave for clarity of "Concept".
      
      const phase = k * p.baseX - w * adjustedTime;
      const displacement = amplitude * Math.cos(phase);
      
      p.x = p.baseX + displacement;
    });
  }, [frequency, amplitude]);

  // Drawing logic
  const draw = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    ctx.clearRect(0, 0, width, height);

    // --- Draw Speaker (Source) ---
    const speakerX = 10;
    const speakerWidth = 40;
    
    // Box (Housing)
    ctx.fillStyle = '#f1f5f9'; // slate-100
    ctx.fillRect(speakerX, SOURCE_TOP, speakerWidth, SOURCE_HEIGHT);
    ctx.strokeStyle = '#94a3b8'; // slate-400
    ctx.lineWidth = 2;
    ctx.strokeRect(speakerX, SOURCE_TOP, speakerWidth, SOURCE_HEIGHT);

    // Vibrating Membrane
    const timeScale = 0.5;
    const w = 0.1 * frequency;
    // Membrane moves with the source wave (x=0)
    const membraneOffset = Math.cos(-w * (timeRef.current * timeScale)) * amplitude;
    
    const membraneBaseX = speakerX + speakerWidth; 
    // Draw a piston-like rectangle moving back and forth
    ctx.fillStyle = '#3b82f6'; // blue-500
    // The piston connects housing to the air
    ctx.fillRect(membraneBaseX + membraneOffset - 5, SOURCE_TOP + 10, 6, SOURCE_HEIGHT - 20);

    // --- Draw Particles ---
    ctx.fillStyle = '#64748b'; // slate-500
    particlesRef.current.forEach(p => {
      // Draw opacity based on local density? Too complex.
      // Just draw nice circles.
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); // Slightly smaller particles for elegance
      ctx.fill();
    });

    // --- Visual Guide (Optional) ---
    // Draw "Compression" label over a dense area? 
    // Maybe overkill. The motion speaks for itself.

  }, [frequency, amplitude]);

  // Animation Loop
  const animate = useCallback(() => {
    if (isPlaying) {
      timeRef.current += 1;
      updateParticles(timeRef.current);
      draw();
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, updateParticles, draw]);

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

  // Static Update (Reactivity when paused)
  useEffect(() => {
    if (initializedRef.current) {
      updateParticles(timeRef.current);
      draw();
    }
  }, [frequency, amplitude, updateParticles, draw]);

  const reset = () => {
    setIsPlaying(false);
    timeRef.current = 0;
    updateParticles(0);
    draw();
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden my-8">
      <div className="bg-slate-50 p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Volume2 size={18} className="text-blue-500" />
          Simulateur : Onde Sonore (Longitudinale)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-lg transition-colors flex items-center gap-2 px-4 font-bold text-sm ${
              isPlaying ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
          >
            {isPlaying ? <><Pause size={18} /> PAUSE</> : <><Play size={18} /> ANIMER</>}
          </button>
          <button
            onClick={reset}
            className="p-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
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
          className="w-full h-64 block"
        />
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border-t border-slate-100">
          <div className="space-y-2">
             <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
              <label>Fréquence (f)</label>
              <span>{frequency} Hz</span>
            </div>
            <input
              type="range"
              min="1"
              max="5" 
              step="0.5"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          
          <div className="space-y-2">
             <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
              <label>Amplitude (A)</label>
              <span>{amplitude} px</span>
            </div>
            <input
              type="range"
              min="5"
              max="20"
              value={amplitude}
              onChange={(e) => setAmplitude(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
        
        <div className="p-4 text-xs text-center text-slate-500 bg-slate-100 border-t border-slate-200 italic">
          Les particules oscillent autour de leur position d'équilibre. La vibration de la source (à gauche) se propage de proche en proche.
        </div>
      </div>
    </div>
  );
};