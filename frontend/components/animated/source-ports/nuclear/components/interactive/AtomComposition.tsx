/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

export const AtomComposition: React.FC = () => {
  const [protons, setProtons] = useState(6); // Start with Carbon
  const [neutrons, setNeutrons] = useState(6);

  const element = ELEMENTS.find(e => e.z === protons) || { symbol: '?', name: 'Inconnu' };
  const massNumber = protons + neutrons;

  return (
    <div className="bg-white p-4 md:p-8 rounded-xl shadow-lg border border-purple-100 flex flex-col md:flex-row items-center gap-6 md:gap-10">
      {/* Left: Visual Representation of Nucleus */}
      <div className="flex-1 flex flex-col items-center w-full">
        <h4 className="text-xs md:text-sm font-bold text-purple-300 uppercase tracking-wider mb-4">Vue Microscopique</h4>
        <div className="relative w-full max-w-[240px] aspect-square bg-slate-50 rounded-full border-4 border-slate-100 flex items-center justify-center overflow-hidden shadow-inner">
          {/* Nucleus Container */}
          <motion.div 
            layout 
            className="flex flex-wrap justify-center items-center content-center w-3/5 h-3/5 gap-0.5 md:gap-1"
          >
            <AnimatePresence mode='popLayout'>
                {Array.from({ length: protons }).map((_, i) => (
                    <motion.div
                        key={`p-${i}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        layout
                        className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-rose-500 shadow-sm border border-rose-600 flex items-center justify-center text-[8px] md:text-[10px] text-white font-bold z-10 select-none"
                    >
                        +
                    </motion.div>
                ))}
                {Array.from({ length: neutrons }).map((_, i) => (
                    <motion.div
                        key={`n-${i}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        layout
                        className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-slate-500 shadow-sm border border-slate-600 flex items-center justify-center text-[8px] md:text-[10px] text-white font-bold select-none"
                    >
                        0
                    </motion.div>
                ))}
            </AnimatePresence>
          </motion.div>
          
          {/* Decorative Electron Cloud Ring */}
          <div className="absolute inset-0 rounded-full border border-purple-200 opacity-40 animate-[spin_12s_linear_infinite]" style={{borderStyle: 'dashed', borderWidth: '1px'}} />
          <div className="absolute inset-4 rounded-full border border-purple-200 opacity-30 animate-[spin_15s_linear_infinite_reverse]" style={{borderStyle: 'dashed', borderWidth: '1px'}} />
        </div>
        
        <div className="mt-6 flex justify-center gap-4 text-xs flex-wrap">
            <div className="flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100 whitespace-nowrap">
                <div className="w-3 h-3 rounded-full bg-rose-500 border border-rose-600"></div>
                <span className="font-bold text-rose-700">Proton (+e)</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 whitespace-nowrap">
                <div className="w-3 h-3 rounded-full bg-slate-500 border border-slate-600"></div>
                <span className="font-bold text-slate-700">Neutron (0)</span>
            </div>
        </div>
      </div>

      {/* Right: Symbolic Representation & Controls */}
      <div className="flex-1 w-full min-w-0">
        <div className="bg-purple-50 p-6 md:p-8 rounded-2xl border border-purple-100 mb-6 md:mb-8 flex flex-col items-center relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-purple-600"></div>
           <h4 className="text-[10px] md:text-xs font-bold text-purple-300 uppercase tracking-wider mb-4 md:mb-6">Notation Symbolique</h4>
           
           <div className="flex items-center justify-center gap-2 md:gap-4">
             {/* A and Z numbers */}
             <div className="flex flex-col items-end font-mono font-bold leading-none gap-1 md:gap-2 mr-1">
                <div className="relative group cursor-help">
                    <motion.span 
                        key={`A-${massNumber}`}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl md:text-4xl text-purple-600 block"
                    >
                        {massNumber}
                    </motion.span>
                    <span className="absolute right-full mr-2 md:mr-3 top-1/2 -translate-y-1/2 text-[10px] font-sans text-purple-400 font-normal opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity bg-white px-2 py-1 rounded shadow border border-purple-100 z-20">Nombre de masse (A)</span>
                </div>
                
                <div className="w-full h-0.5 bg-purple-200 rounded-full opacity-30 my-0.5"></div>

                <div className="relative group cursor-help">
                    <motion.span 
                        key={`Z-${protons}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl md:text-4xl text-yellow-500 block shadow-sm"
                        style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}
                    >
                        {protons}
                    </motion.span>
                    <span className="absolute right-full mr-2 md:mr-3 top-1/2 -translate-y-1/2 text-[10px] font-sans text-yellow-600 font-normal opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity bg-white px-2 py-1 rounded shadow border border-yellow-100 z-20">Numéro atomique (Z)</span>
                </div>
             </div>
             
             {/* Element Symbol */}
             <div className="relative">
                 <motion.div 
                    key={`sym-${element.symbol}`}
                    initial={{ scale: 0.8, opacity: 0, rotateX: 90 }}
                    animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                    className="text-6xl md:text-8xl font-serif font-bold text-slate-800 leading-none"
                 >
                    {element.symbol}
                 </motion.div>
             </div>
           </div>
           
           <div className="mt-4 text-lg md:text-xl font-bold text-purple-900 bg-white px-4 py-1 rounded-full shadow-sm border border-purple-100">{element.name}</div>
           <div className="text-xs text-purple-500 font-mono mt-3 bg-white/50 px-3 py-1 rounded border border-purple-100 whitespace-nowrap">
                N = A - Z = {massNumber} - {protons} = {neutrons}
           </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 gap-4">
            {/* Proton Control */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-purple-700">Protons (Z)</span>
                    <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{protons}</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-purple-100 shadow-sm">
                    <button type="button" 
                        onClick={() => setProtons(Math.max(1, protons - 1))}
                        className="w-8 h-8 flex items-center justify-center bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg font-bold transition-colors border border-purple-100 touch-manipulation"
                    >-</button>
                    <input 
                        type="range" min="1" max="10" value={protons} 
                        onChange={(e) => setProtons(parseInt(e.target.value))}
                        className="flex-1 accent-purple-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <button type="button" 
                        onClick={() => setProtons(Math.min(10, protons + 1))}
                        className="w-8 h-8 flex items-center justify-center bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg font-bold transition-colors border border-purple-100 touch-manipulation"
                    >+</button>
                </div>
            </div>

            {/* Neutron Control */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-600">Neutrons (N)</span>
                    <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{neutrons}</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
                    <button type="button" 
                        onClick={() => setNeutrons(Math.max(0, neutrons - 1))}
                        className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg font-bold transition-colors border border-slate-100 touch-manipulation"
                    >-</button>
                    <input 
                        type="range" min="0" max="15" value={neutrons} 
                        onChange={(e) => setNeutrons(parseInt(e.target.value))}
                        className="flex-1 accent-slate-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <button type="button" 
                        onClick={() => setNeutrons(Math.min(15, neutrons + 1))}
                        className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg font-bold transition-colors border border-slate-100 touch-manipulation"
                    >+</button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
