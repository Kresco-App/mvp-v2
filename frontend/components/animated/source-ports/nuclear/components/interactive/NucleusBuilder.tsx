/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';

const ELEMENTS = [
  { z: 1, symbol: 'H', name: 'Hydrogène' },
  { z: 2, symbol: 'He', name: 'Hélium' },
  { z: 3, symbol: 'Li', name: 'Lithium' },
  { z: 4, symbol: 'Be', name: 'Béryllium' },
  { z: 5, symbol: 'B', name: 'Bore' },
  { z: 6, symbol: 'C', name: 'Carbone' },
  { z: 7, symbol: 'N', name: 'Azote' },
  { z: 8, symbol: 'O', name: 'Oxygène' },
  { z: 9, symbol: 'F', name: 'Fluor' },
  { z: 10, symbol: 'Ne', name: 'Néon' },
];

export const NucleusBuilder: React.FC = () => {
  const [protons, setProtons] = useState(2); // Helium
  const [neutrons, setNeutrons] = useState(2);

  const element = ELEMENTS.find(e => e.z === protons) || { symbol: '?', name: `Z=${protons}` };
  const massNumber = protons + neutrons;
  
  // Simple stability check (heuristic)
  const isStable = useMemo(() => {
      if (protons === 1 && neutrons === 0) return true; // H-1
      if (protons === 1 && neutrons === 1) return true; // H-2
      if (protons === 2 && neutrons === 2) return true; // He-4
      if (protons === 2 && neutrons === 1) return true; // He-3
      const ratio = neutrons / protons;
      return ratio >= 1 && ratio <= 1.5; // Crude approximation for small Z
  }, [protons, neutrons]);

  return (
    <div className="bg-white p-4 md:p-8 rounded-2xl shadow-lg border border-indigo-100 flex flex-col lg:flex-row items-center gap-8 md:gap-12">
      {/* Left: Visual Representation */}
      <div className="flex-1 flex flex-col items-center w-full">
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-4">Vue du Noyau</h4>
        <div className="relative w-full max-w-[260px] aspect-square bg-indigo-50/50 rounded-full border-4 border-indigo-50 flex items-center justify-center overflow-hidden shadow-[inset_0_0_40px_rgba(99,102,241,0.1)]">
          
          {/* Particles */}
          <div className="relative w-32 h-32 flex flex-wrap justify-center items-center content-center">
            <AnimatePresence>
                {Array.from({ length: protons }).map((_, i) => (
                    <motion.div
                        key={`p-${i}`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        layout
                        className="w-6 h-6 rounded-full bg-rose-500 shadow-[0_2px_5px_rgba(244,63,94,0.4)] border-2 border-white flex items-center justify-center text-[8px] text-white font-black z-10 m-[-4px]"
                    >
                        +
                    </motion.div>
                ))}
                {Array.from({ length: neutrons }).map((_, i) => (
                    <motion.div
                        key={`n-${i}`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        layout
                        className="w-6 h-6 rounded-full bg-slate-600 shadow-[0_2px_5px_rgba(71,85,105,0.4)] border-2 border-white flex items-center justify-center text-[8px] text-white font-black m-[-4px]"
                    >
                    </motion.div>
                ))}
            </AnimatePresence>
          </div>
          
          {/* Orbital Rings Decoration */}
          <div className="absolute inset-0 rounded-full border border-dashed border-indigo-200/30 scale-110 animate-[spin_20s_linear_infinite]" />
          <div className="absolute inset-0 rounded-full border border-dashed border-indigo-200/30 scale-150 animate-[spin_25s_linear_infinite_reverse]" />
        </div>
        
        <div className="mt-6 flex justify-center gap-4 text-xs">
            <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                <span className="font-bold text-slate-600">Proton (+e)</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                <span className="font-bold text-slate-600">Neutron (0)</span>
            </div>
        </div>
      </div>

      {/* Right: Controls & Info */}
      <div className="flex-1 w-full bg-slate-50 p-6 rounded-xl border border-slate-200">
         <div className="text-center mb-6">
             <div className="inline-flex items-baseline gap-1 font-serif font-bold text-slate-800">
                 <div className="flex flex-col text-xs items-end leading-tight opacity-70">
                     <span>{massNumber}</span>
                     <span>{protons}</span>
                 </div>
                 <span className="text-5xl">{element.symbol}</span>
             </div>
             <div className="text-lg font-bold text-indigo-900 mt-2">{element.name}</div>
             
             <div className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${isStable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                 {isStable ? 'Noyau Stable' : 'Noyau Instable'}
             </div>
         </div>

         <div className="space-y-4">
            {/* Protons */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                <div className="flex justify-between mb-2 text-xs font-bold text-slate-500 uppercase">
                    <span>Protons (Z)</span>
                    <span>{protons}</span>
                </div>
                <input 
                    type="range" min="1" max="10" value={protons}
                    onChange={(e) => setProtons(parseInt(e.target.value))}
                    className="w-full h-2 bg-rose-100 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
            </div>

            {/* Neutrons */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                <div className="flex justify-between mb-2 text-xs font-bold text-slate-500 uppercase">
                    <span>Neutrons (N)</span>
                    <span>{neutrons}</span>
                </div>
                <input 
                    type="range" min="0" max="15" value={neutrons}
                    onChange={(e) => setNeutrons(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                />
            </div>
         </div>

         <div className="mt-6 p-3 bg-indigo-50 rounded-lg text-xs text-indigo-800 flex items-start gap-2">
             <Info size={14} className="mt-0.5 shrink-0" />
             <p>
                 Le noyau est {Math.round(massNumber/ (protons * 1836) * 10000)/100}% de la masse de l'atome, mais occupe un volume infime.
             </p>
         </div>
      </div>
    </div>
  );
};
