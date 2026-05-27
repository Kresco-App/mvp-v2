/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, CheckCircle, XCircle, HelpCircle, Timer, Trophy, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Helper to generate random number
const random = (min: number, max: number, step: number = 1) => {
  const steps = Math.floor((max - min) / step);
  return min + Math.floor(Math.random() * (steps + 1)) * step;
};

export const WaveExercises: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'celerity' | 'delay'>('celerity');
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [gameState, setGameState] = useState<'idle' | 'running' | 'paused'>('idle');

  // --- Simulation State ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [time, setTime] = useState(0);
  const animationRef = useRef<number | null>(null);
  
  // --- Problem Variables ---
  const [problem, setProblem] = useState({
    v: 2,
    d: 10, // total distance or target distance
    targetD: 10, // specific target marker
    givenTime: 0, // for questions where t is given
  });

  // Initialize Problem
  const initProblem = useCallback(() => {
    setGameState('idle');
    setTime(0);
    setFeedback(null);
    setUserAnswer('');
    
    let v, d, targetD = 0, givenTime = 0;

    if (activeTab === 'celerity') {
      // Lvl 1: Find v. d=10m. User runs sim to find t.
      // Lvl 2: Find d. v is given. t is given (we stop sim at t).
      // Lvl 3: Find t. v is given. d is given.
      
      if (level === 1) {
        v = random(2, 5, 1);
        targetD = random(10, 18, 2); // Marker position
        d = 20;
      } else if (level === 2) {
        v = random(3, 6, 0.5);
        givenTime = random(2, 4, 0.5); // We will stop sim here
        d = 30;
        targetD = 0; // No target marker, find distance traveled
      } else { // Level 3
        v = random(4, 10, 0.5);
        targetD = random(20, 40, 5); // Target distance
        d = 50;
      }
    } else {
      // Retard
      // Lvl 1: Find tau.
      // Lvl 2: Find v using tau.
      // Lvl 3: Find distAB using tau.
      d = 30;
      v = random(3, 8, 0.5);
      targetD = random(5, 15, 1); // This is distance AB
    }

    setProblem({ v, d, targetD, givenTime });
  }, [activeTab, level]);

  useEffect(() => { initProblem(); }, [initProblem]);

  // --- Drawing ---
  const draw = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const { v, d, targetD } = problem;
    const scale = width / d;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Grid
    ctx.beginPath();
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for(let x=0; x<=d; x+=1) {
        const px = x * scale;
        ctx.moveTo(px, 0); ctx.lineTo(px, height);
    }
    ctx.stroke();

    // Ruler
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, height - 30, width, 30);
    ctx.beginPath();
    ctx.strokeStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#64748b';
    for(let x=0; x<=d; x+= (d>20?2:1)) {
        const px = x * scale;
        ctx.moveTo(px, height - 30);
        ctx.lineTo(px, height - 15);
        ctx.fillText(`${x}`, px + 2, height - 10);
    }
    ctx.stroke();

    // Markers
    if (activeTab === 'celerity') {
        // Start Line
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, height-30); ctx.stroke();

        if (level === 1 || level === 3) {
            // Draw Target Line
            const px = targetD * scale;
            ctx.strokeStyle = '#ef4444';
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height-30); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(level === 1 ? "CIBLE" : `d = ${targetD}m`, px + 5, 30);
        }
    } else {
        // Retard Markers A and B
        const posA = 5 * scale; // A fixed at 5m
        const posB = posA + targetD * scale;

        // A
        ctx.strokeStyle = '#3b82f6';
        ctx.beginPath(); ctx.moveTo(posA, 20); ctx.lineTo(posA, height-30); ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath(); ctx.arc(posA, 20, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillText("A", posA-4, 12);

        // B
        ctx.strokeStyle = '#eab308';
        ctx.beginPath(); ctx.moveTo(posB, 20); ctx.lineTo(posB, height-30); ctx.stroke();
        ctx.fillStyle = '#eab308';
        ctx.beginPath(); ctx.arc(posB, 20, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillText("B", posB-4, 12);
    }

    // Wave Pulse
    const pulseCenter = v * time;
    const pulseWidth = 2; // meters
    const pulsePxWidth = pulseWidth * scale * 4;
    const centerPx = pulseCenter * scale;
    
    if (centerPx - pulsePxWidth < width) {
        const gradient = ctx.createLinearGradient(centerPx - pulsePxWidth/2, 0, centerPx + pulsePxWidth/2, 0);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0)');
        gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.6)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        for(let px = centerPx - pulsePxWidth/2; px <= centerPx + pulsePxWidth/2; px+=2) {
            const x = px / scale;
            const val = 80 * Math.exp( - Math.pow(x - pulseCenter, 2) / (0.5) );
            const y = (height/2) - val;
            if (px === centerPx - pulsePxWidth/2) ctx.moveTo(px, height/2);
            else ctx.lineTo(px, y);
        }
        ctx.lineTo(centerPx + pulsePxWidth/2, height/2);
        ctx.fill();
        
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

  }, [problem, time, activeTab, level]);

  // --- Animation ---
  const animate = useCallback(() => {
    if (gameState === 'running') {
      setTime(t => {
          const dt = 1/60;
          const nextT = t + dt;
          
          // Auto-stop for Celerity Level 2 (Given Time)
          if (activeTab === 'celerity' && level === 2 && nextT >= problem.givenTime) {
              setGameState('paused');
              return problem.givenTime;
          }
          
          // Boundaries
          if (nextT * problem.v > problem.d + 5) {
              setGameState('paused');
              return t;
          }
          return nextT;
      });
      animationRef.current = requestAnimationFrame(animate);
    }
    draw();
  }, [gameState, problem, activeTab, level, draw]);

  useEffect(() => {
    if (gameState === 'running') {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      draw();
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [gameState, animate, draw]);

  const togglePlay = () => {
      setGameState(prev => prev === 'running' ? 'paused' : 'running');
  };

  // --- Validation ---
  const handleCheck = () => {
      const val = parseFloat(userAnswer.replace(',', '.'));
      if (isNaN(val)) return;

      let correct = 0;
      let unit = "";
      
      if (activeTab === 'celerity') {
          if (level === 1) { 
              // Find v
              correct = problem.v; 
              unit = "m/s";
          } else if (level === 2) { 
              // Find d = v * t
              correct = problem.v * problem.givenTime; 
              unit = "m";
          } else { 
              // Find t = d / v
              correct = problem.targetD / problem.v; 
              unit = "s";
          }
      } else {
          // Retard
          const tau = problem.targetD / problem.v;
          if (level === 1) {
              // Find tau
              correct = tau;
              unit = "s";
          } else if (level === 2) {
              // Find v = d / tau
              correct = problem.v;
              unit = "m/s";
          } else {
              // Find d = v * tau
              correct = problem.targetD;
              unit = "m";
          }
      }

      const margin = correct * 0.05 + 0.1; // 5% + 0.1 margin
      const isCorrect = Math.abs(val - correct) <= margin;

      if (isCorrect) {
          setScore(s => s + 10 * level);
          setFeedback({ correct: true, message: `Bravo ! Réponse exacte : ${correct.toFixed(2)} ${unit}` });
      } else {
          setFeedback({ correct: false, message: `Incorrect. La réponse était ${correct.toFixed(2)} ${unit}` });
      }
  };

  const getQuestionText = () => {
      if (activeTab === 'celerity') {
          if (level === 1) return `L'onde part de 0. Mesurez le temps pour atteindre la cible. Calculez la célérité v.`;
          if (level === 2) return `La célérité est v = ${problem.v} m/s. L'onde s'arrête automatiquement à t = ${problem.givenTime} s. Calculez la distance parcourue.`;
          if (level === 3) return `La célérité est v = ${problem.v} m/s. Calculez le temps nécessaire pour atteindre la cible à d = ${problem.targetD} m.`;
      } else {
          if (level === 1) return `Calculez le retard τ entre le passage de l'onde en A et en B.`;
          if (level === 2) return `La distance AB est de ${problem.targetD} m. Mesurez le retard τ et déduisez la célérité v.`;
          if (level === 3) return `La célérité est v = ${problem.v} m/s. Mesurez le retard τ et déduisez la distance AB.`;
      }
      return "";
  };

  const getPlaceholder = () => {
      if (activeTab === 'celerity') {
          if (level === 1) return "Célérité (m/s)";
          if (level === 2) return "Distance (m)";
          if (level === 3) return "Temps (s)";
      } else {
          if (level === 1) return "Retard (s)";
          if (level === 2) return "Célérité (m/s)";
          if (level === 3) return "Distance (m)";
      }
      return "Votre réponse";
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-200 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="bg-indigo-100 p-2 rounded-lg text-indigo-600">🎯</span> 
            Exercices d'Application
        </h3>
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
            <Trophy className="text-yellow-500" size={20} />
            <span className="font-black text-indigo-600">{score}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex p-1 bg-slate-100 rounded-lg">
            <button type="button" onClick={() => setActiveTab('celerity')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'celerity' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>
                Célérité
            </button>
            <button type="button" onClick={() => setActiveTab('delay')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'delay' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>
                Retard
            </button>
        </div>
        <div className="flex gap-1 ml-auto">
            {[1, 2, 3].map(l => (
                <button type="button" key={l} onClick={() => setLevel(l)} className={`w-8 h-8 rounded-full text-xs font-bold border transition-all ${level === l ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {l}
                </button>
            ))}
        </div>
      </div>

      {/* Question */}
      <div className="bg-indigo-50 p-4 rounded-xl border-l-4 border-indigo-500 mb-6 text-indigo-900 text-sm flex gap-3">
          <HelpCircle className="shrink-0" size={20} />
          <p>{getQuestionText()}</p>
      </div>

      {/* Canvas */}
      <div className="relative bg-white rounded-xl overflow-hidden border border-slate-200 shadow-inner mb-6">
          <canvas ref={canvasRef} width={800} height={220} className="w-full h-56 block bg-white" />
          
          <div className="absolute top-4 right-4 font-mono text-lg font-bold text-slate-700 bg-white/90 px-3 py-1 rounded border border-slate-200 shadow-sm flex items-center gap-2">
              <Timer size={16} className="text-indigo-500" />
              {time.toFixed(2)} s
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              <button type="button" onClick={togglePlay} className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg transition-all">
                  {gameState === 'running' ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
              </button>
              <button type="button" onClick={initProblem} className="p-3 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-full shadow-lg transition-all">
                  <RotateCcw size={20} />
              </button>
          </div>
      </div>

      {/* Input */}
      <div className="flex gap-3">
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder={getPlaceholder()}
            className="flex-1 p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-lg"
          />
          <button type="button" onClick={handleCheck} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2">
              Vérifier <ArrowRight size={18} />
          </button>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {feedback && (
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mt-4 p-4 rounded-xl border flex items-center gap-3 ${feedback.correct ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}
            >
                {feedback.correct ? <CheckCircle /> : <XCircle />}
                <span className="font-bold">{feedback.message}</span>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
