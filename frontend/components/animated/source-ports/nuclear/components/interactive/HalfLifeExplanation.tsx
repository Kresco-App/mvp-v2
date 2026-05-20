/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, RotateCcw, Scale } from 'lucide-react';

export const HalfLifeExplanation: React.FC = () => {
  const [elapsedHalfLives, setElapsedHalfLives] = useState(0);
  
  const TOTAL_PARTICLES = 64;
  
  const getDecayedCount = (step: number) => {
    if (step === 0) return 0;
    let remaining = TOTAL_PARTICLES;
    for (let i = 0; i < step; i++) {
        remaining /= 2;
    }
    return TOTAL_PARTICLES - remaining;
  };

  const decayedCount = getDecayedCount(elapsedHalfLives);
  const remainingCount = TOTAL_PARTICLES - decayedCount;
  const percent = (remainingCount / TOTAL_PARTICLES) * 100;
  const fraction = Math.pow(2, elapsedHalfLives);

  const particles = Array.from({ length: TOTAL_PARTICLES }, (_, i) => ({
    id: i,
    isDecayed: (i % fraction) !== 0 
  }));

  const nextStep = () => {
    if (elapsedHalfLives < 4) setElapsedHalfLives(p => p + 1);
  };

  const reset = () => setElapsedHalfLives(0);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-purple-100 overflow-hidden my-6">
      <div className="bg-purple-50 p-4 border-b border-purple-100 flex justify-between items-center">
        <div className="flex items-center gap-3">
            <div className="p-1.5 md:p-2 bg-purple-100 rounded-lg text-purple-600">
                <Clock size={18} className="md:w-5 md:h-5" />
            </div>
            <div>
                <h3 className="font-bold text-sm md:text-base text-purple-900">Simulation : La Demi-vie (t<sub>1/2</sub>)</h3>
                <p className="text-[10px] md:text-xs text-purple-500">Observation de la masse restante</p>
            </div>
        </div>
        <div className="text-right">
            <div className="text-xl md:text-2xl font-mono font-bold text-slate-800">{elapsedHalfLives} × t<sub>1/2</sub></div>
            <div className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wider">Temps écoulé</div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Left: Visualization */}
        <div className="flex-1 p-4 md:p-6 bg-slate-50 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-slate-100 min-h-[300px]">
            <div className="mb-4 flex justify-between w-full max-w-[280px] text-xs font-bold text-slate-400 uppercase">
                <span>Échantillon (Masse)</span>
                <span>{remainingCount} / {TOTAL_PARTICLES} u.a.</span>
            </div>
            
            {/* Particle Grid representing Mass */}
            <div className="grid grid-cols-8 gap-1 md:gap-1.5 p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                {particles.map((p) => (
                    <motion.div
                        key={p.id}
                        initial={false}
                        animate={{
                            backgroundColor: p.isDecayed ? '#e2e8f0' : '#9333ea', // Stable vs Radioactive (Purple)
                            scale: p.isDecayed ? 0.8 : 1,
                            opacity: p.isDecayed ? 0.5 : 1
                        }}
                        transition={{ duration: 0.5, delay: p.id * 0.005 }} 
                        className="w-4 h-4 md:w-6 md:h-6 rounded md:rounded-md shadow-sm border border-black/5 relative overflow-hidden"
                    >
                        {/* Shininess for active ones */}
                        {!p.isDecayed && (
                             <div className="absolute top-0 left-0 w-full h-1/2 bg-white/20"></div>
                        )}
                    </motion.div>
                ))}
            </div>

            <div className="mt-6 flex gap-6 text-xs">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-600 rounded shadow-sm border border-purple-700"></div>
                    <span className="font-bold text-purple-700">Radioactif</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-slate-200 rounded shadow-sm border border-slate-300"></div>
                    <span className="font-bold text-slate-500">Désintégré</span>
                </div>
            </div>
        </div>

        {/* Right: Data & Controls */}
        <div className="flex-1 p-4 md:p-6 flex flex-col justify-center space-y-6 md:space-y-8 bg-white">
            {/* Mass Gauge */}
            <div>
                <div className="flex justify-between items-end mb-2">
                    <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm md:text-base">
                        <Scale size={16} /> Masse Restante
                    </h4>
                    <span className="text-2xl md:text-3xl font-bold text-purple-600">{percent}%</span>
                </div>
                <div className="h-3 md:h-4 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <motion.div 
                        className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500"
                        initial={{ width: '100%' }}
                        animate={{ width: `${percent}%` }}
                        transition={{ type: "spring", stiffness: 50, damping: 15 }}
                    />
                </div>
                <div className="flex justify-between mt-2 text-xs font-mono text-slate-400">
                    <span>0%</span>
                    <span>100%</span>
                </div>
            </div>

            {/* Explanation Text */}
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase text-yellow-600">Formule</span>
                    <span className="px-2 py-1 bg-white rounded text-xs font-bold text-purple-600 shadow-sm">t = {elapsedHalfLives} t<sub>1/2</sub></span>
                </div>
                <div className="text-center text-lg md:text-xl font-mono text-slate-700 my-2">
                    m(t) = <span className="text-purple-600 font-bold">m₀</span> / {fraction}
                </div>
                <p className="text-center text-xs md:text-sm text-slate-600 mt-2 leading-relaxed">
                    {elapsedHalfLives === 0 && "Masse initiale complète."}
                    {elapsedHalfLives === 1 && "Une demi-vie passée : la masse a été divisée par 2."}
                    {elapsedHalfLives === 2 && "Deux demi-vies : la masse restante a encore été divisée par 2 (soit le quart du début)."}
                    {elapsedHalfLives === 3 && "Trois demi-vies : il ne reste qu'un huitième de la masse initiale."}
                    {elapsedHalfLives === 4 && "Quatre demi-vies : la quantité devient infime (1/16)."}
                </p>
            </div>

            {/* Controls */}
            <div className="flex gap-3 mt-auto">
                <button 
                    onClick={nextStep}
                    disabled={elapsedHalfLives >= 4}
                    className="flex-1 bg-purple-600 text-white py-2.5 md:py-3 px-4 rounded-xl font-bold shadow-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-95 text-sm md:text-base"
                >
                    <Clock size={18} />
                    {elapsedHalfLives < 4 ? "Attendre t(1/2)" : "Terminé"}
                </button>
                <button 
                    onClick={reset}
                    className="w-10 md:w-12 flex items-center justify-center bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors border border-slate-200"
                    title="Réinitialiser"
                >
                    <RotateCcw size={20} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
