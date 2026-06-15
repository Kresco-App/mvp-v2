/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';
import { ListFilter } from 'lucide-react';

export const ProgressTable: React.FC = () => {
  const [advancement, setAdvancement] = useState(0); 
  const progressGradientId = React.useId();

  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 my-10 overflow-hidden">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xl font-bold text-[#1e1b4b] flex items-center">
            <ListFilter className="mr-2 text-[#fbbf24]" size={24}/> Tableau d'Avancement
        </h3>
        <span className="bg-[#fbbf24]/10 text-[#b45309] px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-[#fbbf24]/20">
             Interactif
        </span>
      </div>
      
      {/* Slider Control */}
      <div className="mb-10 bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-inner">
        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            <span>État Initial</span>
            <span>Équilibre</span>
        </div>
        <div className="relative h-4 bg-slate-200 rounded-full cursor-pointer group">
            <svg className="absolute inset-0 h-full w-full overflow-hidden rounded-full" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <linearGradient id={progressGradientId} x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                </defs>
                <rect width={`${advancement}%`} height="100%" rx="8" fill={`url(#${progressGradientId})`} />
            </svg>
            <input 
                type="range" 
                min="0" 
                max="100" 
                value={advancement}
                onChange={(e) => setAdvancement(parseInt(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            {/* Thumb */}
            <svg className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 overflow-visible pointer-events-none" aria-hidden="true">
                <circle
                    cx={`${advancement}%`}
                    cy="16"
                    r="14"
                    fill="white"
                    stroke="#d97706"
                    strokeWidth="4"
                    className="drop-shadow-lg transition-transform duration-200 group-hover:scale-110 [transform-box:fill-box] [transform-origin:center]"
                />
            </svg>
        </div>
        <div className="text-center mt-4 font-math text-xl text-[#4c1d95] font-bold">
            Avancement x = <span className="inline-block min-w-[3ch] text-left">{advancement === 0 ? "0" : advancement === 100 ? "xéq" : (advancement/100).toFixed(1) + "xéq"}</span>
        </div>
      </div>

      {/* The Table - Responsive Wrapper */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full min-w-[700px] text-base border-collapse">
            <thead>
                <tr className="bg-[#1e1b4b] text-white">
                    <th className="p-5 text-left w-1/4 uppercase text-xs tracking-widest font-bold opacity-70">État du système</th>
                    <th className="p-5 text-center w-1/4 font-math text-xl bg-[#2e2a69]">2 H₂O</th>
                    <th className="p-5 text-center w-16 bg-[#2e2a69] text-2xl font-light opacity-50">⇌</th>
                    <th className="p-5 text-center w-1/4 font-math text-xl bg-[#2e2a69]">H₃O⁺</th>
                    <th className="p-5 text-center w-16 bg-[#2e2a69] text-xl font-light opacity-50">+</th>
                    <th className="p-5 text-center w-1/4 font-math text-xl bg-[#2e2a69]">HO⁻</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
                {/* Initial */}
                <tr className={`transition-colors duration-300 ${advancement === 0 ? 'bg-[#fffbeb]' : 'bg-white'}`}>
                    <td className="p-5 font-bold text-slate-800 border-r border-slate-100">
                        État Initial <span className="block text-xs font-normal text-slate-400 mt-1 uppercase tracking-wide">x = 0</span>
                    </td>
                    <td className="p-5 text-center text-slate-400 italic bg-slate-50/50">Excès</td>
                    <td className="bg-slate-50/50"></td>
                    <td className="p-5 text-center font-math text-lg font-medium">0</td>
                    <td className="bg-slate-50/50"></td>
                    <td className="p-5 text-center font-math text-lg font-medium">0</td>
                </tr>

                {/* In Progress */}
                <tr className={`transition-colors duration-300 ${advancement > 0 && advancement < 100 ? 'bg-[#fffbeb]' : 'bg-white'}`}>
                    <td className="p-5 font-bold text-slate-800 border-r border-slate-100">
                        En cours <span className="block text-xs font-normal text-slate-400 mt-1 uppercase tracking-wide">x</span>
                    </td>
                    <td className="p-5 text-center text-slate-400 italic bg-slate-50/50">Excès</td>
                    <td className="bg-slate-50/50"></td>
                    <td className="p-5 text-center font-math text-xl text-[#4c1d95] font-bold">x</td>
                    <td className="bg-slate-50/50"></td>
                    <td className="p-5 text-center font-math text-xl text-[#4c1d95] font-bold">x</td>
                </tr>

                {/* Final */}
                 <tr className={`transition-colors duration-300 ${advancement === 100 ? 'bg-[#fffbeb]' : 'bg-white'}`}>
                    <td className="p-5 font-bold text-slate-800 border-r border-slate-100">
                        État Final <span className="block text-xs font-normal text-slate-400 mt-1 uppercase tracking-wide">x = x<sub>éq</sub></span>
                    </td>
                    <td className="p-5 text-center text-slate-400 italic bg-slate-50/50">Excès</td>
                    <td className="bg-slate-50/50"></td>
                    <td className="p-5 text-center font-math text-xl text-[#b45309] font-bold">x<sub>éq</sub></td>
                    <td className="bg-slate-50/50"></td>
                    <td className="p-5 text-center font-math text-xl text-[#b45309] font-bold">x<sub>éq</sub></td>
                </tr>
            </tbody>
        </table>
      </div>
    </div>
  );
};
