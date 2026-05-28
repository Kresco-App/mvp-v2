/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const Predominance1D: React.FC = () => {
  return (
    <div className="bg-white p-8 md:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 my-12">
      <div className="text-center mb-10">
        <span className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] block mb-2">Visualisation</span>
        <h4 className="text-2xl font-bold text-[#1e1b4b]">Axe de Prédominance</h4>
      </div>

      <div className="relative pt-12 pb-24 px-4 md:px-12">
        {/* Main Axis Line */}
        <div className="h-3 bg-slate-200 w-full rounded-full relative shadow-inner">
            {/* pKa Marker */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#4c1d95] rounded-full border-4 border-white shadow-xl z-20 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            
            {/* pKa Label */}
            <div className="absolute left-1/2 -top-16 -translate-x-1/2 flex flex-col items-center">
                <span className="font-math text-3xl font-black text-[#4c1d95]">pKₐ</span>
                <div className="h-6 w-0.5 bg-slate-300 mt-2"></div>
            </div>

            {/* Equality Condition */}
            <div className="absolute left-1/2 top-10 -translate-x-1/2 bg-white px-4 py-2 rounded-xl border border-purple-100 shadow-lg z-10 whitespace-nowrap">
                <span className="font-math text-base font-bold text-[#4c1d95]">[AH] = [A⁻]</span>
            </div>
        </div>

        {/* Zones */}
        <div className="flex justify-between w-full mt-4 absolute top-3 left-0 px-4 md:px-12 h-full pointer-events-none">
            
            {/* Acid Zone */}
            <div className="w-1/2 pr-4 flex flex-col items-center justify-center relative">
                <div className="absolute top-[-60px] left-0 md:left-10 text-6xl md:text-8xl font-black text-slate-100 -z-10 select-none">AH</div>
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-red-50/90 border-l-4 border-red-500 p-6 rounded-r-2xl shadow-sm w-full backdrop-blur-sm border-t border-b border-r border-red-100"
                >
                    <div className="font-bold text-red-900 mb-2 uppercase text-xs tracking-wider">Domaine Acide</div>
                    <div className="font-math text-red-700 text-xl md:text-2xl font-bold mb-2">[AH] &gt; [A⁻]</div>
                    <div className="text-xs text-red-500 font-bold bg-white/50 inline-block px-2 py-1 rounded">pH &lt; pKₐ</div>
                </motion.div>
            </div>

            {/* Base Zone */}
            <div className="w-1/2 pl-4 flex flex-col items-center justify-center relative">
                <div className="absolute top-[-60px] right-0 md:right-10 text-6xl md:text-8xl font-black text-slate-100 -z-10 select-none">A⁻</div>
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-blue-50/90 border-r-4 border-blue-500 p-6 rounded-l-2xl shadow-sm w-full text-right backdrop-blur-sm border-t border-b border-l border-blue-100"
                >
                    <div className="font-bold text-blue-900 mb-2 uppercase text-xs tracking-wider">Domaine Basique</div>
                    <div className="font-math text-blue-700 text-xl md:text-2xl font-bold mb-2">[A⁻] &gt; [AH]</div>
                    <div className="text-xs text-blue-500 font-bold bg-white/50 inline-block px-2 py-1 rounded">pH &gt; pKₐ</div>
                </motion.div>
            </div>
        </div>
      </div>
    </div>
  );
};
