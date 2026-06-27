/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity } from 'lucide-react';

export const PHScale: React.FC = () => {
  const [ph, setPh] = useState(7);
  const shouldReduceMotion = useReducedMotion();

  const h3oExp = -ph;
  const hoExp = -(14 - ph);
  const barTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

  const getBackgroundColor = (val: number) => {
    if (val < 7) return `rgba(239, 68, 68, ${1 - val/7})`; 
    if (val > 7) return `rgba(59, 130, 246, ${(val-7)/7})`; 
    return 'rgba(255, 255, 255, 1)';
  };

  const getLabel = (val: number) => {
    if (val < 6.8) return { text: 'ACIDE', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
    if (val > 7.2) return { text: 'BASIQUE', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
    return { text: 'NEUTRE', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' };
  };

  const info = getLabel(ph);

  return (
    <div className="bg-white p-6 md:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 my-10">
      
      {/* Header with Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
            <h3 className="text-xl font-bold text-[#1e1b4b] flex items-center">
                <Activity className="mr-2 text-[#fbbf24]" size={24}/> Échelle de pH Interactive
            </h3>
            <p className="text-slate-500 font-medium text-sm mt-1">Évolution inverse des concentrations [H₃O⁺] et [HO⁻]</p>
        </div>
        <div className={`px-6 py-2 rounded-xl font-black text-sm uppercase tracking-[0.2em] border shadow-sm transition-[background-color,border-color,color] duration-150 ease-out motion-reduce:transition-none ${info.bg} ${info.color} ${info.border}`}>
            {info.text}
        </div>
      </div>

      {/* Main Display & Slider */}
      <div className="bg-slate-50 p-6 md:p-8 rounded-2xl border border-slate-200 mb-10 shadow-inner">
          <div className="w-full h-32 rounded-xl flex items-center justify-center transition-[background-color] duration-150 ease-out motion-reduce:transition-none relative overflow-hidden border border-slate-200 shadow-sm mb-8 bg-white">
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
              <rect width="100%" height="100%" fill={getBackgroundColor(ph)} />
            </svg>
            <div className="relative z-10 text-center bg-white/90 px-12 py-4 rounded-2xl shadow-xl backdrop-blur-md border border-white/50">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Valeur du pH</div>
                <div className="text-6xl font-math font-black text-slate-800 tracking-tighter tabular-nums">{ph.toFixed(1)}</div>
            </div>
          </div>

          <div className="relative h-6 bg-gradient-to-r from-red-500 via-green-400 to-blue-500 rounded-full mb-2 focus-within:ring-4 focus-within:ring-purple-200/70">
             <input 
                aria-label="pH"
                type="range" 
                min="0" 
                max="14" 
                step="0.1" 
                value={ph}
                onChange={(e) => setPh(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <svg className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 overflow-visible pointer-events-none" aria-hidden="true">
                <circle
                    cx={`${(ph / 14) * 100}%`}
                    cy="16"
                    r="14"
                    fill="white"
                    stroke="#0f172a"
                    strokeWidth="4"
                    className="drop-shadow-xl transition-[cx] duration-150 ease-out motion-reduce:transition-none"
                />
            </svg>
          </div>
          <div className="flex justify-between text-xs font-bold text-slate-400 font-mono mt-3 tabular-nums">
            <span>0 (Acide)</span>
            <span>7 (Neutre)</span>
            <span>14 (Basique)</span>
          </div>
      </div>

      {/* Bars Visualization */}
      <div className="grid grid-cols-2 gap-4 md:gap-8">
          
          {/* Acid Bar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg flex flex-col items-center relative overflow-hidden group hover:border-red-100 hover:shadow-xl transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none">
             <div className="z-10 text-center mb-6">
                 <div className="font-bold text-slate-700 text-sm mb-1 uppercase tracking-wider">[H₃O⁺]</div>
                 <div className="font-math text-3xl text-red-600 font-bold tabular-nums">
                    10<sup className="text-lg font-medium">{h3oExp.toFixed(1)}</sup>
                 </div>
                 <div className="text-[10px] text-slate-400 mt-1 font-bold bg-slate-100 px-2 py-0.5 rounded-full inline-block">mol·L⁻¹</div>
             </div>
             
             <div className="w-16 h-48 bg-slate-100 rounded-t-xl relative overflow-hidden flex items-end shadow-inner border border-slate-200">
                <motion.div 
                    animate={{ height: `${(14 - ph) / 14 * 100}%` }}
                    transition={barTransition}
                    className="w-full bg-gradient-to-t from-red-600 to-red-400"
                />
             </div>
          </div>

          {/* Base Bar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg flex flex-col items-center relative overflow-hidden group hover:border-blue-100 hover:shadow-xl transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none">
             <div className="z-10 text-center mb-6">
                 <div className="font-bold text-slate-700 text-sm mb-1 uppercase tracking-wider">[HO⁻]</div>
                 <div className="font-math text-3xl text-blue-600 font-bold tabular-nums">
                    10<sup className="text-lg font-medium">{hoExp.toFixed(1)}</sup>
                 </div>
                 <div className="text-[10px] text-slate-400 mt-1 font-bold bg-slate-100 px-2 py-0.5 rounded-full inline-block">mol·L⁻¹</div>
             </div>

             <div className="w-16 h-48 bg-slate-100 rounded-t-xl relative overflow-hidden flex items-end shadow-inner border border-slate-200">
                <motion.div 
                    animate={{ height: `${ph / 14 * 100}%` }}
                    transition={barTransition}
                    className="w-full bg-gradient-to-t from-blue-600 to-blue-400"
                />
             </div>
          </div>

      </div>
    </div>
  );
};
