/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

export const IsotopeComparator: React.FC = () => {
  const [activeIsotope, setActiveIsotope] = useState<'Cu63' | 'Cu65'>('Cu63');
  const shouldReduceMotion = useReducedMotion();

  const Z = 29;
  const isotopes = {
    Cu63: { A: 63, N: 34 },
    Cu65: { A: 65, N: 36 }
  };

  const current = isotopes[activeIsotope];
  const springTransition = shouldReduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 300, damping: 30 };
  const particleTransition = shouldReduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 300, damping: 25 };
  const quickTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const };
  
  const generateParticles = (n: number) => {
    const particles = [];
    // Base particles (Copper-63 core)
    for (let i = 0; i < 63; i++) {
        const isProton = i < Z;
        particles.push({
            id: i,
            type: isProton ? 'proton' : 'neutron',
            isExtra: false
        });
    }
    // Extra particles for Cu-65
    if (n === 36) {
        particles.push({ id: 63, type: 'neutron', isExtra: true });
        particles.push({ id: 64, type: 'neutron', isExtra: true });
    }
    return particles;
  };

  const particles = generateParticles(current.N);

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-purple-100 my-8">
      <h3 className="text-lg md:text-xl font-bold text-center mb-6 text-purple-900">Comparaison des Isotopes du Cuivre</h3>
      
      {/* Enhanced Animated Controls */}
      <div className="flex justify-center mb-8">
        <div className="bg-slate-100 p-1.5 rounded-full flex gap-2 shadow-inner border border-slate-200/60 relative z-0">
            {(['Cu63', 'Cu65'] as const).map((iso) => (
                <button type="button"
                    key={iso}
                    onClick={() => setActiveIsotope(iso)}
                    aria-pressed={activeIsotope === iso}
                    className={`relative z-10 flex min-h-10 items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] focus-visible:ring-4 focus-visible:ring-purple-200 motion-reduce:transition-none motion-reduce:active:scale-100 md:text-base ${
                        activeIsotope === iso ? 'text-white' : 'text-slate-500 hover:text-purple-700'
                    }`}
                >
                    {activeIsotope === iso && (
                        <motion.div
                            layoutId="active-isotope-bg"
                            className="absolute inset-0 bg-purple-600 rounded-full shadow-lg shadow-purple-500/30 -z-10"
                            transition={springTransition}
                        />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                        Cuivre-{iso === 'Cu63' ? '63' : '65'}
                        {activeIsotope === iso && (
                            <motion.span 
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={quickTransition}
                            >
                                <Check size={16} strokeWidth={3} className="opacity-90" />
                            </motion.span>
                        )}
                    </span>
                </button>
            ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
        
        {/* Visualization */}
        <div className="flex-1 flex justify-center w-full">
            <div className="relative w-48 h-48 md:w-64 md:h-64 bg-slate-50 rounded-full border-4 border-slate-100 flex items-center justify-center shadow-inner overflow-hidden">
                <motion.div 
                    layout={!shouldReduceMotion}
                    className="flex flex-wrap justify-center items-center content-center w-36 h-36 md:w-48 md:h-48 gap-0.5 md:gap-1"
                >
                    <AnimatePresence mode='popLayout'>
                        {particles.map((p) => (
                            <motion.div
                                key={p.id}
                                layoutId={`p-${p.id}`}
                                initial={{ scale: 0 }}
                                animate={{ 
                                    scale: 1,
                                    backgroundColor: p.isExtra ? '#f59e0b' : (p.type === 'proton' ? '#e11d48' : '#64748b'),
                                    borderColor: p.isExtra ? '#d97706' : (p.type === 'proton' ? '#be123c' : '#475569'),
                                    zIndex: p.isExtra ? 20 : 1
                                }}
                                transition={particleTransition}
                                className={`
                                    w-4 h-4 md:w-5 md:h-5 rounded-full border shadow-sm flex items-center justify-center
                                    ${p.isExtra ? 'ring-2 ring-amber-200 ring-offset-1 z-20' : ''}
                                `}
                            >
                                <span className="text-[6px] md:text-[8px] text-white font-bold opacity-80 select-none">
                                    {p.type === 'proton' ? '+' : '0'}
                                </span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>

        {/* Data Card */}
        <div className="flex-1 w-full max-w-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition-[background-color,border-color] duration-200 ease-out md:p-6">
                <div className="text-center mb-4 md:mb-6">
                    <span className="text-4xl md:text-5xl font-serif font-bold text-slate-800 flex justify-center items-baseline">
                        <div className="flex flex-col items-end mr-1">
                            <motion.sup 
                                key={`A-disp-${current.A}`}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={quickTransition}
                                className="font-mono text-2xl tabular-nums text-purple-600 md:text-3xl"
                            >
                                {current.A}
                            </motion.sup>
                            <sub className="font-mono text-2xl tabular-nums text-yellow-500 md:text-3xl">{Z}</sub>
                        </div>
                        Cu
                    </span>
                </div>

                <div className="space-y-3 text-sm md:text-base">
                    <div className="flex justify-between items-center p-2 md:p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-rose-600"></div>
                            <span className="font-bold text-slate-600">Protons (Z)</span>
                        </div>
                        <span className="font-mono text-lg font-bold tabular-nums text-yellow-500 md:text-xl">{Z}</span>
                    </div>

                    <div className="flex justify-between items-center p-2 md:p-3 bg-white rounded-lg border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="flex items-center gap-2 relative z-10">
                            <div className="w-3 h-3 rounded-full bg-slate-500"></div>
                            <span className="font-bold text-slate-600">Neutrons (N)</span>
                        </div>
                        <div className="flex items-center gap-2 relative z-10">
                            {activeIsotope === 'Cu65' && (
                                <motion.span 
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={quickTransition}
                                    className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-600"
                                >
                                    +2
                                </motion.span>
                            )}
                            <motion.span 
                                key={`N-val-${current.N}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={quickTransition}
                                className={`font-mono text-lg font-bold tabular-nums md:text-xl ${activeIsotope === 'Cu65' ? 'text-amber-600' : 'text-slate-600'}`}
                            >
                                {current.N}
                            </motion.span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center p-2 md:p-3 bg-purple-50 rounded-lg border border-purple-100 shadow-sm">
                        <span className="font-bold text-purple-900">Masse (A)</span>
                        <motion.span 
                             key={`A-val-${current.A}`}
                             initial={{ opacity: 0, scale: 1.2 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={quickTransition}
                             className="font-mono text-lg font-bold tabular-nums text-purple-700 md:text-xl"
                        >
                            {current.A}
                        </motion.span>
                    </div>
                </div>

                <div className="mt-4 md:mt-6 text-xs text-slate-500 text-center italic">
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={activeIsotope}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={quickTransition}
                        >
                            {activeIsotope === 'Cu63' 
                                ? "L'isotope le plus abondant dans la nature (69%)." 
                                : "Plus lourd à cause des 2 neutrons supplémentaires."}
                        </motion.span>
                    </AnimatePresence>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
