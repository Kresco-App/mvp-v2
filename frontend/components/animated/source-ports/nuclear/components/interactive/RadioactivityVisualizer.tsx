/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';

const TYPES = [
  { id: 'alpha', label: 'Alpha (α)', particle: 'He', charge: '+2', color: 'bg-amber-500', desc: 'Émission d\'un noyau d\'Hélium. Arrêté par une feuille de papier.' },
  { id: 'beta-', label: 'Bêta Moins (β⁻)', particle: 'e⁻', charge: '-1', color: 'bg-blue-500', desc: 'Émission d\'un électron. Arrêté par de l\'aluminium.' },
  { id: 'gamma', label: 'Gamma (γ)', particle: 'γ', charge: '0', color: 'bg-yellow-400', desc: 'Rayonnement électromagnétique. Arrêté par du plomb.' },
];

export const RadioactivityVisualizer: React.FC = () => {
  const [activeType, setActiveType] = useState('alpha');
  const [key, setKey] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const current = TYPES.find(t => t.id === activeType)!;
  const quickTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' as const };
  const emissionTransition = shouldReduceMotion ? { duration: 0 } : { duration: 1.2, delay: 0.45, ease: 'easeOut' as const };
  const labelTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.2, delay: 1.25 };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
      <div className="flex flex-wrap gap-2 mb-8 justify-center md:justify-start">
        {TYPES.map(t => (
            <button type="button"
                key={t.id}
                onClick={() => { setActiveType(t.id); setKey(k => k+1); }}
                aria-pressed={activeType === t.id}
                className={`min-h-10 rounded-full px-4 py-2 text-sm font-bold transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                    activeType === t.id 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
                {t.label}
            </button>
        ))}
      </div>

      <div className="relative h-64 bg-slate-50 rounded-xl border-2 border-slate-100 overflow-hidden flex items-center justify-center">
         {/* Background Grid */}
         <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]"></div>

         <AnimatePresence mode='wait'>
            <motion.div key={key} className="relative">
                {/* Parent Nucleus */}
                <motion.div 
                    initial={{ scale: 1 }}
                    animate={{ scale: activeType === 'gamma' ? 1 : 0.9 }} // Shrink slightly if losing particle
                    transition={quickTransition}
                    className="w-24 h-24 bg-indigo-900 rounded-full shadow-xl flex items-center justify-center relative z-10"
                >
                    <span className="text-white font-serif font-bold text-2xl">
                        {activeType === 'gamma' ? 'Y*' : 'X'}
                    </span>
                    {activeType === 'gamma' && (
                        <motion.div 
                            animate={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: [0,1,0], scale: [1, 1.2, 1] }}
                            transition={shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 1 }}
                            className="absolute inset-0 border-4 border-yellow-400 rounded-full opacity-0"
                        />
                    )}
                </motion.div>

                {/* Emitted Particle */}
                <motion.div
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                    animate={{ 
                        x: shouldReduceMotion ? 120 : 150,
                        y: shouldReduceMotion ? -40 : -50,
                        opacity: shouldReduceMotion ? 1 : [0, 1, 1, 0],
                        scale: 1 
                    }}
                    transition={emissionTransition}
                    className={`absolute top-1/2 left-1/2 w-12 h-12 -mt-6 -ml-6 rounded-full flex items-center justify-center font-bold text-white shadow-lg z-20 ${current.color}`}
                >
                    {current.particle}
                </motion.div>

                {/* Daughter Nucleus Label (After decay) */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={labelTransition}
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-indigo-900 font-bold text-sm whitespace-nowrap"
                >
                    {activeType === 'gamma' ? 'Noyau Stable' : 'Noyau Fils'}
                </motion.div>
            </motion.div>
         </AnimatePresence>

         <button type="button" 
            onClick={() => setKey(k => k+1)}
            aria-label="Rejouer l'emission radioactive"
            className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-indigo-600 shadow transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-indigo-50 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 motion-reduce:transition-none motion-reduce:active:scale-100"
         >
             <RotateCcw size={20} />
         </button>
      </div>

      <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <h5 className="font-bold text-indigo-900 flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${current.color}`}></div>
              {current.label}
          </h5>
          <p className="text-sm text-indigo-700 mt-1">{current.desc}</p>
      </div>
    </div>
  );
};
