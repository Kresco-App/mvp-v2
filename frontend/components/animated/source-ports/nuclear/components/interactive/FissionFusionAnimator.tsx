/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Split, Merge } from 'lucide-react';

const FUSION_STAR_CLASSES = [
  'top-[11%] left-[7%]',
  'top-[48%] left-[60%]',
  'top-[85%] left-[13%]',
  'top-[22%] left-[66%]',
  'top-[59%] left-[19%]',
  'top-[96%] left-[72%]',
  'top-[33%] left-[25%]',
  'top-[70%] left-[78%]',
  'top-[7%] left-[31%]',
  'top-[44%] left-[84%]',
  'top-[81%] left-[37%]',
  'top-[18%] left-[90%]',
  'top-[55%] left-[43%]',
  'top-[92%] left-[96%]',
  'top-[29%] left-[49%]',
  'top-[66%] left-[2%]',
  'top-[3%] left-[55%]',
  'top-[40%] left-[8%]',
  'top-[77%] left-[61%]',
  'top-[14%] left-[14%]',
];

export const FissionFusionAnimator: React.FC = () => {
  const [mode, setMode] = useState<'fission' | 'fusion'>('fission');
  const [key, setKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
      setKey(k => k+1);
      setIsPlaying(true);
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-slate-100">
      {/* Tabs */}
      <div className="flex p-1 bg-slate-100 rounded-xl mb-8 w-fit mx-auto">
          <button type="button" 
            onClick={() => { setMode('fission'); setIsPlaying(false); }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-[background-color,box-shadow,color] duration-150 ease-out ${mode === 'fission' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
              <Split size={16} /> Fission
          </button>
          <button type="button" 
            onClick={() => { setMode('fusion'); setIsPlaying(false); }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-[background-color,box-shadow,color] duration-150 ease-out ${mode === 'fusion' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
              <Merge size={16} /> Fusion
          </button>
      </div>

      {/* Animation Area */}
      <div className="relative h-[300px] bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner">
          {/* Starry Background for Fusion */}
          {mode === 'fusion' && (
              <div className="absolute inset-0 opacity-30">
                  {FUSION_STAR_CLASSES.map((starClass) => (
                      <div key={starClass} className={`absolute h-1 w-1 rounded-full bg-white ${starClass}`} />
                  ))}
              </div>
          )}

          <AnimatePresence mode='wait'>
              {mode === 'fission' && isPlaying ? (
                  <FissionAnimation key={`fission-${key}`} />
              ) : mode === 'fission' && !isPlaying ? (
                  <div className="flex items-center gap-8">
                      <div className="h-4 w-4 rounded-full bg-slate-400 motion-safe:animate-[pulse_1.5s_ease-in-out_infinite] motion-reduce:animate-none"></div> {/* Neutron */}
                      <div className="text-white text-2xl">&rarr;</div>
                      <div className="w-24 h-24 bg-orange-500 rounded-full shadow-[0_0_30px_rgba(249,115,22,0.4)] border-4 border-orange-400 flex items-center justify-center font-bold text-white text-xl">
                          <sup>235</sup>U
                      </div>
                  </div>
              ) : null}

              {mode === 'fusion' && isPlaying ? (
                  <FusionAnimation key={`fusion-${key}`} />
              ) : mode === 'fusion' && !isPlaying ? (
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-sky-500 rounded-full shadow-[0_0_20px_rgba(14,165,233,0.4)] flex items-center justify-center font-bold text-white"><sup>2</sup>H</div>
                      <div className="text-white text-xl">+</div>
                      <div className="w-12 h-12 bg-sky-500 rounded-full shadow-[0_0_20px_rgba(14,165,233,0.4)] flex items-center justify-center font-bold text-white"><sup>3</sup>H</div>
                  </div>
              ) : null}
          </AnimatePresence>

          {/* Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
              <button type="button" 
                onClick={handlePlay}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full backdrop-blur-md border border-white/10 transition-[background-color,border-color,color] duration-150 ease-out font-bold"
              >
                  <Play size={18} fill="currentColor" /> Lancer
              </button>
          </div>
      </div>

      <div className="mt-6 text-center text-slate-600 text-sm">
          {mode === 'fission' ? 
            "Un neutron heurte un noyau lourd (Uranium) qui se scinde en deux noyaux plus légers en libérant de l'énergie." :
            "Deux noyaux légers (Isotopes de l'Hydrogène) s'unissent pour former un noyau plus lourd (Hélium) à très haute température."
          }
      </div>
    </div>
  );
};

const FissionAnimation = () => (
    <div className="relative w-full h-full flex items-center justify-center">
        {/* Neutron Incoming */}
        <motion.div 
            initial={{ x: -200, opacity: 1 }}
            animate={{ x: 0, opacity: 0 }}
            transition={{ duration: 1, ease: "linear" }}
            className="absolute w-4 h-4 bg-slate-200 rounded-full z-20"
        />
        
        {/* Uranium Nucleus */}
        <motion.div 
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.1, 1.2, 0] }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="absolute w-24 h-24 bg-orange-500 rounded-full shadow-lg z-10"
        />

        {/* Explosion Flash */}
        <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 3, 4], opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, delay: 1.3 }}
            className="absolute w-32 h-32 bg-yellow-100 rounded-full blur-xl z-0"
        />

        {/* Fragments */}
        <motion.div 
            initial={{ x: 0, y: 0, scale: 0 }}
            animate={{ x: -100, y: -50, scale: 1 }}
            transition={{ duration: 1, delay: 1.4, type: "spring" }}
            className="absolute w-16 h-16 bg-orange-400 rounded-full flex items-center justify-center font-bold text-white text-xs"
        >Sr</motion.div>
        <motion.div 
            initial={{ x: 0, y: 0, scale: 0 }}
            animate={{ x: 100, y: 50, scale: 1 }}
            transition={{ duration: 1, delay: 1.4, type: "spring" }}
            className="absolute w-16 h-16 bg-orange-400 rounded-full flex items-center justify-center font-bold text-white text-xs"
        >Xe</motion.div>

        {/* Released Neutrons */}
        {[1,2,3].map(i => (
            <motion.div 
                key={i}
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: Math.cos(i)*150, y: Math.sin(i)*150, opacity: 1 }}
                transition={{ duration: 1.5, delay: 1.4 }}
                className="absolute w-3 h-3 bg-slate-300 rounded-full"
            />
        ))}
    </div>
);

const FusionAnimation = () => (
    <div className="relative w-full h-full flex items-center justify-center">
        {/* H2 */}
        <motion.div 
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            transition={{ duration: 1.5, ease: "easeIn" }}
            className="absolute w-12 h-12 bg-sky-500 rounded-full shadow-lg z-10 flex items-center justify-center font-bold text-white text-xs"
        ><sup>2</sup>H</motion.div>

        {/* H3 */}
        <motion.div 
            initial={{ x: 150 }}
            animate={{ x: 0 }}
            transition={{ duration: 1.5, ease: "easeIn" }}
            className="absolute w-12 h-12 bg-sky-500 rounded-full shadow-lg z-10 flex items-center justify-center font-bold text-white text-xs"
        ><sup>3</sup>H</motion.div>

        {/* Fusion Flash */}
        <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 2, 3], opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, delay: 1.4 }}
            className="absolute w-24 h-24 bg-white rounded-full blur-xl z-20"
        />

        {/* Helium Product */}
        <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1.2 }}
            transition={{ duration: 0.5, delay: 1.5 }}
            className="absolute w-16 h-16 bg-indigo-500 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.6)] z-10 flex items-center justify-center font-bold text-white"
        >
            <sup>4</sup>He
        </motion.div>

        {/* Energy Waves */}
        <motion.div 
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.5, 0], scale: 3 }}
            transition={{ duration: 1, delay: 1.5, repeat: 1 }}
            className="absolute w-20 h-20 border-2 border-yellow-400 rounded-full z-0"
        />
    </div>
);
