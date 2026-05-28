/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

const NucleusBlock = ({ A, Z, Sym, color, label }: any) => (
  <div className="flex flex-col items-center">
    <div className={`relative flex items-center justify-center w-16 h-16 md:w-24 md:h-24 rounded-xl ${color} border-2 border-slate-900/10 shadow-md mb-2 transition-colors`}>
       <div className="absolute top-1 md:top-2 left-1 md:left-2 flex flex-col leading-none font-mono text-[10px] md:text-sm font-bold opacity-70">
          <span className="text-purple-700" title="Nombre de masse (A)">{A}</span>
          <span className="text-rose-700" title="Numéro atomique (Z)">{Z}</span>
       </div>
       <span className="text-xl md:text-3xl font-serif font-bold text-slate-800">{Sym}</span>
    </div>
    <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
  </div>
);

const EXAMPLES = [
  {
    type: "Désintégration α",
    desc: "Radium-226",
    parent: { A: 226, Z: 88, Sym: 'Ra', color: 'bg-slate-100' },
    daughter: { A: 222, Z: 86, Sym: 'Rn', color: 'bg-purple-100' },
    particle: { A: 4, Z: 2, Sym: 'He', color: 'bg-amber-100' }
  },
  {
    type: "Désintégration β⁻",
    desc: "Carbone-14",
    parent: { A: 14, Z: 6, Sym: 'C', color: 'bg-slate-100' },
    daughter: { A: 14, Z: 7, Sym: 'N', color: 'bg-blue-100' },
    particle: { A: 0, Z: -1, Sym: 'e', color: 'bg-blue-200' }
  },
  {
    type: "Désintégration β⁺",
    desc: "Phosphore-30",
    parent: { A: 30, Z: 15, Sym: 'P', color: 'bg-slate-100' },
    daughter: { A: 30, Z: 14, Sym: 'Si', color: 'bg-emerald-100' },
    particle: { A: 0, Z: 1, Sym: 'e', color: 'bg-emerald-200' }
  }
];

export const SoddyLawDemonstrator: React.FC = () => {
  const [disintegrated, setDisintegrated] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);

  const currentExample = EXAMPLES[exampleIndex];
  const { parent, daughter, particle } = currentExample;

  const nextExample = () => {
    setDisintegrated(false);
    setTimeout(() => {
        setExampleIndex((prev) => (prev + 1) % EXAMPLES.length);
    }, 200);
  };

  const prevExample = () => {
    setDisintegrated(false);
    setTimeout(() => {
        setExampleIndex((prev) => (prev - 1 + EXAMPLES.length) % EXAMPLES.length);
    }, 200);
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-purple-100 my-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 border-b border-slate-100 pb-4 gap-4">
        <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-base md:text-lg text-purple-900">Démonstration : Lois de Soddy</h3>
                <span className="text-[10px] font-bold bg-purple-100 text-purple-600 px-2 py-0.5 rounded border border-purple-200">
                    {currentExample.type}
                </span>
            </div>
            <p className="text-xs text-purple-400">Exemple : {currentExample.desc}</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
            <button type="button" 
                onClick={prevExample}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500"
                title="Exemple précédent"
            >
                <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-mono font-bold text-slate-400 px-2">
                {exampleIndex + 1}/{EXAMPLES.length}
            </span>
            <button type="button" 
                onClick={nextExample}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500"
                title="Exemple suivant"
            >
                <ChevronRight size={16} />
            </button>
        </div>

        <button type="button" 
            onClick={() => setDisintegrated(!disintegrated)}
            className="w-full md:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg text-xs md:text-sm font-bold hover:bg-purple-700 transition-colors shadow-sm"
        >
            {disintegrated ? 'Réinitialiser' : 'Désintégrer'}
        </button>
      </div>

      {/* Reaction Stage */}
      <div className="flex items-center justify-center h-32 md:h-40 relative mb-6 md:mb-8 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
         <div className="absolute inset-0 grid grid-cols-[repeat(20,1fr)] grid-rows-[repeat(10,1fr)] opacity-[0.02] pointer-events-none">
            {[...Array(200)].map((_,i) => <div key={i} className="border border-slate-900" />)}
         </div>
         
         <AnimatePresence mode="wait">
            {!disintegrated ? (
                <motion.div 
                    key={`parent-${exampleIndex}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: -50, filter: 'blur(10px)' }}
                    transition={{ duration: 0.3 }}
                    className="absolute"
                >
                    <NucleusBlock {...parent} label="Noyau Père" />
                </motion.div>
            ) : (
                <motion.div className="flex items-center gap-2 md:gap-8 z-10" key={`products-${exampleIndex}`}>
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
                    >
                        <NucleusBlock {...daughter} label="Noyau Fils" />
                    </motion.div>
                    
                    <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                         transition={{ delay: 0.3 }}
                    >
                        <span className="text-2xl md:text-3xl font-bold text-slate-300">+</span>
                    </motion.div>

                    <motion.div
                         initial={{ opacity: 0, x: 20, rotate: 180 }}
                         animate={{ opacity: 1, x: 0, rotate: 0 }}
                         transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
                    >
                        <NucleusBlock {...particle} label="Particule" />
                    </motion.div>
                </motion.div>
            )}
         </AnimatePresence>
      </div>

      {/* Math Verification System of Equations */}
      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 transition-all duration-500 relative overflow-hidden flex flex-col items-center">
         {disintegrated && (
             <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: '100%' }} 
                className="absolute top-0 left-0 h-1 bg-green-500" 
             />
         )}
         
         <p className="font-serif italic text-slate-700 mb-4 text-center">"D'après les lois de conservation de Soddy :"</p>
         
         <div className="flex items-center justify-center gap-2 md:gap-4 pl-4 md:pl-0">
             {/* Big Brace */}
             <span className="text-4xl md:text-[5rem] font-light text-slate-300 leading-none transform scale-y-110 select-none">{'{'}</span>
             
             <div className="flex flex-col gap-3 md:gap-5 font-mono text-base md:text-xl">
                {/* A Equation */}
                <div className="flex items-center gap-2 md:gap-4">
                    <span className="font-bold text-purple-600 w-8 md:w-10 text-right text-xs md:text-base tracking-widest">A:</span>
                    <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-100 shadow-sm">
                        <span>{parent.A}</span>
                        <span>=</span>
                        <div className="relative min-w-[2.5ch] text-center">
                            <AnimatePresence mode="wait">
                                {!disintegrated ? (
                                    <motion.span 
                                        key="qA"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="text-slate-300"
                                    >?</motion.span>
                                ) : (
                                    <motion.span 
                                        key="resA"
                                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                        className="text-purple-700 font-bold"
                                    >{daughter.A}</motion.span>
                                )}
                            </AnimatePresence>
                        </div>
                        <span>+</span>
                        <span>{particle.A}</span>
                    </div>
                    {disintegrated && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <Check className="text-emerald-500" size={20} />
                        </motion.div>
                    )}
                </div>

                {/* Z Equation */}
                <div className="flex items-center gap-2 md:gap-4">
                    <span className="font-bold text-rose-600 w-8 md:w-10 text-right text-xs md:text-base tracking-widest">Z:</span>
                    <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-100 shadow-sm">
                        <span>{parent.Z}</span>
                        <span>=</span>
                        <div className="relative min-w-[2.5ch] text-center">
                            <AnimatePresence mode="wait">
                                {!disintegrated ? (
                                    <motion.span 
                                        key="qZ"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="text-slate-300"
                                    >?</motion.span>
                                ) : (
                                    <motion.span 
                                        key="resZ"
                                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                        className="text-rose-700 font-bold"
                                    >{daughter.Z}</motion.span>
                                )}
                            </AnimatePresence>
                        </div>
                        <span>{particle.Z < 0 ? '-' : '+'}</span>
                        <span>{Math.abs(particle.Z)}</span>
                    </div>
                     {disintegrated && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <Check className="text-emerald-500" size={20} />
                        </motion.div>
                    )}
                </div>
             </div>
         </div>
         
         {disintegrated && (
            <motion.p 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-6 text-xs text-emerald-600 font-bold uppercase tracking-wider bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100"
            >
                Lois vérifiées
            </motion.p>
         )}
      </div>
    </div>
  );
};
