/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Info } from 'lucide-react';

export const InteractiveWater: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setKey(prev => prev + 1);
      }, 5000); 
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 my-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 relative z-10 gap-4">
        <div className="flex items-start space-x-3">
           <div className="bg-blue-100 p-2 rounded-lg text-blue-600 mt-1">
             <Info size={20} />
           </div>
           <div>
               <h3 className="text-xl font-bold text-[#1e1b4b]">Mécanisme Microscopique</h3>
               <p className="text-sm text-slate-500 font-medium">Transfert de proton entre molécules d'eau</p>
           </div>
        </div>
        
        <div className="flex space-x-2 w-full md:w-auto">
            <button 
                onClick={() => setKey(prev => prev + 1)}
                className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200"
                title="Rejouer"
            >
                <RotateCcw size={20} />
            </button>
            <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex-1 md:flex-none justify-center flex items-center space-x-2 px-6 py-3 bg-[#4c1d95] rounded-xl shadow-lg shadow-purple-900/20 text-white font-bold text-sm hover:bg-[#3b0764] transition-all transform active:scale-95"
            >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                <span>{isPlaying ? "Pause" : "Lecture"}</span>
            </button>
        </div>
      </div>
      
      {/* Animation Container */}
      <div className="h-[300px] md:h-[400px] w-full bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center relative z-10 select-none overflow-hidden">
        <div className="absolute inset-0 opacity-[0.4] bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]"></div>

        <AnimatePresence mode='wait'>
            <motion.div 
                key={key} 
                className="relative w-full max-w-lg h-full flex items-center justify-center scale-75 md:scale-100"
                initial={false}
            >
                {/* Left Molecule */}
                <motion.div
                    initial={{ x: -120, opacity: 0, rotate: -20 }}
                    animate={{ x: -70, opacity: 1, rotate: 0 }}
                    exit={{ x: -180, opacity: 0 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="absolute flex items-center justify-center"
                >
                    <div className="w-24 h-24 bg-red-500 rounded-full shadow-[inset_-6px_-6px_14px_rgba(0,0,0,0.3)] relative z-10 flex items-center justify-center ring-4 ring-white shadow-xl">
                        <span className="text-white/90 font-black text-xl">O</span>
                        {/* Lone Pairs */}
                        <div className="absolute top-2 left-2 w-3 h-3 bg-[#fbbf24] rounded-full shadow-[0_0_10px_#fbbf24]"></div>
                        <div className="absolute bottom-2 left-2 w-3 h-3 bg-[#fbbf24] rounded-full shadow-[0_0_10px_#fbbf24]"></div>
                        {/* H1 */}
                        <div className="absolute -top-6 -left-4 w-12 h-12 bg-slate-100 rounded-full shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.1)] border border-slate-200 flex items-center justify-center">
                            <span className="text-slate-400 font-bold text-xs">H</span>
                        </div>
                        {/* H2 (Moving) */}
                        <motion.div 
                            initial={{ x: 0, y: 0, scale: 1 }}
                            animate={{ x: 90, y: 0, scale: 0.9 }} 
                            transition={{ delay: 2, duration: 1.2, ease: "easeInOut" }}
                            className="absolute -bottom-6 -right-4 w-12 h-12 bg-slate-100 rounded-full shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.1)] border border-slate-200 z-20 flex items-center justify-center"
                        >
                            <span className="text-slate-500 font-bold text-sm">H⁺</span>
                            <motion.div 
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ delay: 2, duration: 1.2 }}
                                className="absolute inset-0 bg-yellow-400 rounded-full blur-md opacity-0"
                            />
                        </motion.div>
                    </div>
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: 3.2 }}
                        className="absolute -bottom-24 font-bold text-lg text-red-600 bg-white px-4 py-2 rounded-xl shadow-lg border border-red-50"
                    >
                        HO⁻ <span className="text-xs font-normal text-slate-400 block text-center uppercase tracking-wider">Base</span>
                    </motion.div>
                </motion.div>

                {/* Right Molecule */}
                <motion.div
                    initial={{ x: 120, opacity: 0, rotate: 20 }}
                    animate={{ x: 70, opacity: 1, rotate: 0 }}
                    exit={{ x: 180, opacity: 0 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="absolute flex items-center justify-center"
                >
                    <div className="w-24 h-24 bg-red-500 rounded-full shadow-[inset_-6px_-6px_14px_rgba(0,0,0,0.3)] relative z-10 flex items-center justify-center ring-4 ring-white shadow-xl">
                        <span className="text-white/90 font-black text-xl">O</span>
                         {/* Lone Pairs */}
                        <div className="absolute top-2 right-2 w-3 h-3 bg-[#fbbf24] rounded-full shadow-[0_0_10px_#fbbf24]"></div>
                        <div className="absolute bottom-2 right-2 w-3 h-3 bg-[#fbbf24] rounded-full shadow-[0_0_10px_#fbbf24]"></div>
                        {/* H3 */}
                        <div className="absolute -top-6 -right-4 w-12 h-12 bg-slate-100 rounded-full shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.1)] border border-slate-200 flex items-center justify-center">
                            <span className="text-slate-400 font-bold text-xs">H</span>
                        </div>
                        {/* H4 */}
                        <div className="absolute -bottom-6 -left-4 w-12 h-12 bg-slate-100 rounded-full shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.1)] border border-slate-200 flex items-center justify-center">
                            <span className="text-slate-400 font-bold text-xs">H</span>
                        </div>
                    </div>
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: 3.2 }}
                        className="absolute -bottom-24 font-bold text-lg text-[#4c1d95] bg-white px-4 py-2 rounded-xl shadow-lg border border-purple-50"
                    >
                        H₃O⁺ <span className="text-xs font-normal text-slate-400 block text-center uppercase tracking-wider">Acide</span>
                    </motion.div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className="absolute text-4xl text-slate-300 font-bold pb-4 z-0"
                >
                    ⇌
                </motion.div>
            </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress Bar */}
      {isPlaying && (
          <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-100">
            <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 5, ease: "linear", repeat: Infinity }}
                className="h-full bg-[#fbbf24]"
            />
          </div>
      )}
    </div>
  );
};
