/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RefreshCw, ArrowRight, Zap } from 'lucide-react';

interface DecaySimulatorProps {
  type: 'alpha' | 'beta-minus' | 'beta-plus' | 'gamma';
}

const IsotopeSymbol = ({ 
  A, 
  Z, 
  Symbol, 
  className = "", 
  highlight = false 
}: { 
  A: string | number; 
  Z: string | number; 
  Symbol: string; 
  className?: string;
  highlight?: boolean;
}) => (
  <div className={`flex flex-col items-center font-serif leading-none ${className}`}>
    <div className="flex items-center">
      <div className="flex flex-col text-[0.6em] mr-0.5 font-semibold text-right">
        <span>{A}</span>
        <span>{Z}</span>
      </div>
      <span className={`text-xl md:text-2xl font-bold ${highlight ? 'scale-110 transition-transform' : ''}`}>
        {Symbol}
      </span>
    </div>
  </div>
);

export const DecaySimulator: React.FC<DecaySimulatorProps> = ({ type }) => {
  const [status, setStatus] = useState<'initial' | 'animating' | 'decayed'>('initial');

  const reset = () => setStatus('initial');
  const start = () => setStatus('animating');

  useEffect(() => {
    if (status === 'animating') {
      const timer = setTimeout(() => setStatus('decayed'), 1200);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const configs = {
    alpha: {
      father: { A: 'A', Z: 'Z', Sym: 'X' },
      son: { A: 'A-4', Z: 'Z-2', Sym: 'Y' },
      particle: { A: 4, Z: 2, Sym: 'He', color: 'bg-amber-500' },
      particleName: 'Particule α',
      desc: "Émission d'un noyau d'Hélium",
      equationColor: "text-amber-700 bg-amber-50",
      mechanism: null
    },
    'beta-minus': {
      father: { A: 'A', Z: 'Z', Sym: 'X' },
      son: { A: 'A', Z: 'Z+1', Sym: 'Y' },
      particle: { A: 0, Z: -1, Sym: 'e', color: 'bg-blue-500' },
      particleName: 'Electron (β⁻)',
      desc: "Transformation d'un neutron en proton",
      equationColor: "text-blue-700 bg-blue-50",
      mechanism: "¹₀n → ¹₁p + ⁰₋₁e"
    },
    'beta-plus': {
      father: { A: 'A', Z: 'Z', Sym: 'X' },
      son: { A: 'A', Z: 'Z-1', Sym: 'Y' },
      particle: { A: 0, Z: 1, Sym: 'e', color: 'bg-emerald-500' },
      particleName: 'Positron (β⁺)',
      desc: "Transformation d'un proton en neutron",
      equationColor: "text-emerald-700 bg-emerald-50",
      mechanism: "¹₁p → ¹₀n + ⁰₁e"
    },
    'gamma': {
      father: { A: 'A', Z: 'Z', Sym: 'Y*' },
      son: { A: 'A', Z: 'Z', Sym: 'Y' },
      particle: { A: '', Z: '', Sym: 'γ', color: 'bg-yellow-400' },
      particleName: 'Rayonnement γ',
      desc: "Désexcitation du noyau",
      equationColor: "text-yellow-700 bg-yellow-50",
      mechanism: null
    }
  };

  const config = configs[type];
  const isGamma = type === 'gamma';

  return (
    <div className="w-full max-w-2xl mx-auto my-6">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-purple-100">
        {/* Header */}
        <div className="bg-purple-50 p-4 border-b border-purple-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 text-sm md:text-base flex items-center gap-2">
            <span className={`w-2 h-8 rounded-full ${
              type === 'alpha' ? 'bg-amber-500' : 
              type === 'beta-minus' ? 'bg-blue-500' :
              type === 'beta-plus' ? 'bg-emerald-500' : 'bg-yellow-400'
            }`}></span>
            Simulation : {config.particleName}
          </h3>
          <button type="button"
            onClick={status === 'initial' ? start : reset}
            className={`flex items-center gap-2 px-3 py-1.5 md:px-4 rounded-full font-bold text-xs md:text-sm transition-all ${
              status === 'initial' 
                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md hover:shadow-lg' 
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}
          >
            {status === 'initial' ? <><Play size={14} /> Lancer</> : <><RefreshCw size={14} /> Reset</>}
          </button>
        </div>

        {/* Animation Stage */}
        <div className="relative h-48 md:h-64 bg-slate-100 flex items-center justify-center overflow-hidden">
            {/* Grid Background */}
            <div className="absolute inset-0 grid grid-cols-[repeat(20,1fr)] grid-rows-[repeat(10,1fr)] opacity-5">
                {[...Array(200)].map((_,i) => <div key={i} className="border border-slate-400" />)}
            </div>

            {/* Central Nucleus */}
            <div className="relative z-10">
                <motion.div 
                    layout
                    className={`
                        w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center border-4 shadow-xl
                        ${status === 'decayed' && !isGamma ? 'border-slate-400 bg-slate-200' : 'border-slate-300 bg-white'}
                        ${status === 'animating' && isGamma ? 'animate-pulse border-yellow-400 shadow-yellow-200' : ''}
                    `}
                    animate={status === 'animating' ? {
                        scale: [1, 1.05, 0.95, 1.02, 1],
                        rotate: [0, -2, 2, -1, 1, 0]
                    } : {}}
                    transition={{ duration: 0.5 }}
                >
                    <AnimatePresence mode="wait">
                        {status !== 'decayed' ? (
                             <motion.div 
                                key="father"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="text-slate-800"
                             >
                                <IsotopeSymbol A={config.father.A} Z={config.father.Z} Symbol={config.father.Sym} />
                             </motion.div>
                        ) : (
                            <motion.div 
                                key="son"
                                initial={{ opacity: 0, scale: 1.2 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-slate-800"
                             >
                                <IsotopeSymbol A={config.son.A} Z={config.son.Z} Symbol={config.son.Sym} highlight />
                             </motion.div>
                        )}
                    </AnimatePresence>
                    
                    {/* Excited State Star for Gamma */}
                    {isGamma && status !== 'decayed' && (
                        <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                            className="absolute -top-2 -right-2 text-yellow-500"
                        >
                            <Zap size={24} fill="currentColor" />
                        </motion.div>
                    )}
                </motion.div>
            </div>

            {/* Emitted Particle */}
            <AnimatePresence>
                {status !== 'initial' && (
                    <motion.div
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                        animate={{ 
                            x: '120%', // Use percentage for responsive movement
                            y: -40, 
                            opacity: 1, 
                            scale: 1,
                            rotate: 360
                        }}
                        transition={{ 
                            duration: 1.2, 
                            ease: "circOut",
                            delay: 0.1 
                        }}
                        className={`absolute z-20 flex items-center justify-center w-10 h-10 md:w-14 md:h-14 rounded-full shadow-lg border-2 border-white ${config.particle.color}`}
                    >
                        <div className="text-white drop-shadow-md">
                             <IsotopeSymbol A={config.particle.A} Z={config.particle.Z} Symbol={config.particle.Sym} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Gamma Wave Visual */}
            {isGamma && status !== 'initial' && (
                <motion.svg
                    className="absolute z-10 w-[150px] md:w-[200px]"
                    height="50"
                    style={{ left: '55%', top: '45%' }}
                    initial={{ opacity: 0, pathLength: 0 }}
                    animate={{ opacity: 1, pathLength: 1 }}
                >
                    <motion.path
                        d="M0,25 Q10,5 20,25 T40,25 T60,25 T80,25 T100,25 T120,25"
                        fill="none"
                        stroke="#eab308"
                        strokeWidth="3"
                        initial={{ pathLength: 0, x: 0 }}
                        animate={{ pathLength: 1, x: 100 }}
                        transition={{ duration: 1.5, ease: "linear" }}
                    />
                </motion.svg>
            )}
        </div>

        {/* Equation Footer */}
        <div className={`p-4 md:p-6 ${config.equationColor} transition-colors duration-500`}>
            <div className="flex flex-col items-center justify-center gap-2 md:gap-3">
                <div className="text-xs md:text-sm font-semibold uppercase tracking-wider opacity-70 mb-1">
                    Équation de la réaction
                </div>
                <div className="flex items-center gap-2 md:gap-4 text-lg md:text-2xl flex-wrap justify-center">
                    <div className={`transition-opacity duration-300 ${status === 'decayed' ? 'opacity-50' : 'opacity-100'}`}>
                        <IsotopeSymbol A={config.father.A} Z={config.father.Z} Symbol={config.father.Sym} />
                    </div>
                    
                    <ArrowRight className="text-slate-400" size={20} />
                    
                    <div className={`transition-all duration-500 ${status === 'decayed' ? 'opacity-100 scale-110 font-bold' : 'opacity-30 blur-[1px]'}`}>
                         <IsotopeSymbol A={config.son.A} Z={config.son.Z} Symbol={config.son.Sym} />
                    </div>

                    <span className="text-slate-400 font-light">+</span>
                    
                    <div className={`transition-all duration-500 delay-100 flex items-center gap-2 ${status === 'decayed' ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
                        <div className={`px-3 py-1 rounded-lg bg-white shadow-sm border border-slate-200 ${isGamma ? 'text-yellow-600' : ''}`}>
                            <IsotopeSymbol A={config.particle.A} Z={config.particle.Z} Symbol={config.particle.Sym} />
                        </div>
                    </div>
                </div>
                
                {config.mechanism && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: status === 'decayed' ? 1 : 0, height: status === 'decayed' ? 'auto' : 0 }}
                        className="mt-2 text-xs md:text-sm bg-white/50 px-4 py-1 rounded-full border border-black/5 font-mono text-slate-600 text-center"
                    >
                        Mécanisme : {config.mechanism}
                    </motion.div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
