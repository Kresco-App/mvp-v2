'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

export const CapacitorAssociation: React.FC = () => {
  const [mode, setMode] = useState<'series' | 'parallel'>('parallel');
  const [c1, setC1] = useState(10); // microFarad
  const [c2, setC2] = useState(10); // microFarad

  const cEq = mode === 'parallel' 
    ? c1 + c2 
    : (c1 * c2) / (c1 + c2);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden my-8 max-w-4xl mx-auto font-sans">
      {/* Header */}
      <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
        <h3 className="text-xl font-bold">Calculateur de Capacité Équivalente</h3>
        <div className="flex bg-slate-800 rounded-lg p-1">
          <button type="button"
            onClick={() => setMode('parallel')}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-[background-color,color] duration-150 ease-out ${mode === 'parallel' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            En Parallèle
          </button>
          <button type="button"
            onClick={() => setMode('series')}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-[background-color,color] duration-150 ease-out ${mode === 'series' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            En Série
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2">
        {/* Controls */}
        <div className="p-8 border-r border-slate-100 bg-slate-50">
          <div className="space-y-8">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-slate-600 font-bold">Condensateur C₁</label>
                <span className="bg-white px-2 py-1 rounded border border-slate-200 text-blue-600 font-mono font-bold">{c1} μF</span>
              </div>
              <input 
                type="range" min="1" max="100" value={c1} 
                onChange={(e) => setC1(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-slate-600 font-bold">Condensateur C₂</label>
                <span className="bg-white px-2 py-1 rounded border border-slate-200 text-indigo-600 font-mono font-bold">{c2} μF</span>
              </div>
              <input 
                type="range" min="1" max="100" value={c2} 
                onChange={(e) => setC2(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          </div>

          <div className="mt-12 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-400 uppercase font-bold mb-2">Formule appliquée</p>
            <div className="text-center text-xl font-serif text-slate-800">
              {mode === 'parallel' ? (
                <>C<sub>éq</sub> = C₁ + C₂</>
              ) : (
                <>
                  <span className="inline-flex flex-col align-middle text-sm">
                    <span className="border-b border-slate-800 pb-1">1</span>
                    <span>C<sub>éq</sub></span>
                  </span>
                  {' '}= {' '}
                  <span className="inline-flex flex-col align-middle text-sm">
                    <span className="border-b border-slate-800 pb-1">1</span>
                    <span>C₁</span>
                  </span>
                  {' '}+ {' '}
                  <span className="inline-flex flex-col align-middle text-sm">
                    <span className="border-b border-slate-800 pb-1">1</span>
                    <span>C₂</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Visualization */}
        <div className="p-8 flex flex-col items-center justify-center relative min-h-[300px]">
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]" />
          
          {/* SVG Diagram */}
          <svg viewBox="0 0 300 200" className="w-full max-w-[300px]">
            <defs>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="2" dy="2" stdDeviation="2" floodOpacity="0.1"/>
              </filter>
            </defs>

            {/* Circuit Lines */}
            {mode === 'parallel' ? (
              <g stroke="#475569" strokeWidth="3" fill="none">
                <path d="M 20 100 L 80 100 M 80 60 L 80 140" />
                <path d="M 80 60 L 120 60 M 80 140 L 120 140" />
                <path d="M 135 60 L 220 60 L 220 140 L 135 140" />
                <path d="M 220 100 L 280 100" />
              </g>
            ) : (
              <g stroke="#475569" strokeWidth="3" fill="none">
                <path d="M 20 100 L 100 100" />
                <path d="M 115 100 L 170 100" />
                <path d="M 185 100 L 280 100" />
              </g>
            )}

            {/* Capacitor 1 */}
            <g transform={mode === 'parallel' ? "translate(120, 60)" : "translate(100, 100)"}>
               <rect x="0" y="-25" width="60" height="50" fill="white" stroke="none" filter="url(#shadow)" opacity="0"/>
               {/* Plates */}
               <line x1="0" y1={mode === 'parallel' ? -15 : -20} x2="0" y2={mode === 'parallel' ? 15 : 20} stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
               <line x1="15" y1={mode === 'parallel' ? -15 : -20} x2="15" y2={mode === 'parallel' ? 15 : 20} stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
               {/* Wire between plates if series? No. */}
               <text x="8" y="-25" textAnchor="middle" className="text-[10px] font-bold fill-blue-600">C₁</text>
            </g>

            {/* Capacitor 2 */}
            <g transform={mode === 'parallel' ? "translate(120, 140)" : "translate(170, 100)"}>
               <line x1="0" y1={mode === 'parallel' ? -15 : -20} x2="0" y2={mode === 'parallel' ? 15 : 20} stroke="#4f46e5" strokeWidth="4" strokeLinecap="round" />
               <line x1="15" y1={mode === 'parallel' ? -15 : -20} x2="15" y2={mode === 'parallel' ? 15 : 20} stroke="#4f46e5" strokeWidth="4" strokeLinecap="round" />
               <text x="8" y="-25" textAnchor="middle" className="text-[10px] font-bold fill-indigo-600">C₂</text>
            </g>
          </svg>

          {/* Result Badge */}
          <motion.div 
            key={cEq}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mt-6 flex flex-col items-center"
          >
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Capacité Équivalente</span>
            <div className="flex items-center gap-2 text-3xl font-bold text-slate-800">
              <span className="bg-green-100 text-green-700 px-4 py-2 rounded-xl border border-green-200">
                {cEq.toFixed(1)} μF
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-2 italic">
              {mode === 'parallel' 
                ? "La capacité augmente (somme)" 
                : "La capacité diminue (inférieure à la plus petite)"}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
