/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical } from 'lucide-react';

type IndicatorId = 'heliantine' | 'bromothymol' | 'phenolphthaleine';

interface Indicator {
  id: IndicatorId;
  name: string;
  pka: number;
  virageStart: number;
  virageEnd: number;
  acidColorName: string;
  baseColorName: string;
  mixColorName: string;
}

const indicators: Indicator[] = [
  { 
    id: 'heliantine',
    name: 'Hélianthine', 
    pka: 3.7, 
    virageStart: 3.1, 
    virageEnd: 4.4, 
    acidColorName: 'Rouge', 
    baseColorName: 'Jaune', 
    mixColorName: 'Orange' 
  },
  { 
    id: 'bromothymol',
    name: 'Bleu de Bromothymol', 
    pka: 7.1, 
    virageStart: 6.0, 
    virageEnd: 7.6, 
    acidColorName: 'Jaune', 
    baseColorName: 'Bleu', 
    mixColorName: 'Vert' 
  },
  { 
    id: 'phenolphthaleine',
    name: 'Phénolphtaléine', 
    pka: 9.4, 
    virageStart: 8.2, 
    virageEnd: 10.0, 
    acidColorName: 'Incolore', 
    baseColorName: 'Rose Fuchsia', 
    mixColorName: 'Rose Pâle' 
  },
];

const indicatorClasses: Record<IndicatorId, {
  acidBg: string;
  baseBg: string;
  observedAcidText: string;
  observedBaseText: string;
  scaleAcidOpacity: string;
  acidWidth: string;
  mixWidth: string;
  baseWidth: string;
  mixGradient: string;
  pkaLeft: string;
  startLeft: string;
  endLeft: string;
  zoneLeft: string;
}> = {
  heliantine: {
    acidBg: 'bg-red-500',
    baseBg: 'bg-amber-400',
    observedAcidText: 'text-red-500',
    observedBaseText: 'text-amber-400',
    scaleAcidOpacity: 'opacity-80',
    acidWidth: 'w-[22.142857%]',
    mixWidth: 'w-[9.285714%]',
    baseWidth: 'w-[68.571429%]',
    mixGradient: 'bg-gradient-to-r from-red-500 to-amber-400',
    pkaLeft: 'left-[26.428571%]',
    startLeft: 'left-[22.142857%]',
    endLeft: 'left-[31.428571%]',
    zoneLeft: 'left-[26.785714%]',
  },
  bromothymol: {
    acidBg: 'bg-yellow-400',
    baseBg: 'bg-blue-600',
    observedAcidText: 'text-yellow-400',
    observedBaseText: 'text-blue-600',
    scaleAcidOpacity: 'opacity-80',
    acidWidth: 'w-[42.857143%]',
    mixWidth: 'w-[11.428571%]',
    baseWidth: 'w-[45.714286%]',
    mixGradient: 'bg-gradient-to-r from-yellow-400 to-blue-600',
    pkaLeft: 'left-[50.714286%]',
    startLeft: 'left-[42.857143%]',
    endLeft: 'left-[54.285714%]',
    zoneLeft: 'left-[48.571429%]',
  },
  phenolphthaleine: {
    acidBg: 'bg-white',
    baseBg: 'bg-pink-600',
    observedAcidText: 'text-slate-400',
    observedBaseText: 'text-pink-600',
    scaleAcidOpacity: 'opacity-10',
    acidWidth: 'w-[58.571429%]',
    mixWidth: 'w-[12.857143%]',
    baseWidth: 'w-[28.571429%]',
    mixGradient: 'bg-gradient-to-r from-transparent to-pink-600',
    pkaLeft: 'left-[67.142857%]',
    startLeft: 'left-[58.571429%]',
    endLeft: 'left-[71.428571%]',
    zoneLeft: 'left-[65%]',
  },
};

export const IndicatorSimulator: React.FC = () => {
  const [selectedInd, setSelectedInd] = useState(indicators[0]);
  const [ph, setPh] = useState(3.5);

  const getBlend = (currentPh: number, start: number, end: number) => {
    if (currentPh <= start) return 0; 
    if (currentPh >= end) return 1;   
    return (currentPh - start) / (end - start); 
  };

  const blendFactor = getBlend(ph, selectedInd.virageStart, selectedInd.virageEnd);
  const classes = indicatorClasses[selectedInd.id];
  const acidLiquidClass = selectedInd.id === 'phenolphthaleine'
    ? `bg-white ${blendFactor === 0 ? 'opacity-[0.05]' : 'opacity-0'}`
    : `${classes.acidBg} opacity-100`;
  const observedToneClass = blendFactor < 0.2
    ? classes.observedAcidText
    : blendFactor > 0.8
      ? classes.observedBaseText
      : 'text-slate-500';

  return (
    <div className="bg-white p-6 md:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 my-12">
       {/* Header */}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
           <div>
               <h3 className="text-xl font-bold text-[#1e1b4b] flex items-center">
                 <FlaskConical className="mr-2 text-[#fbbf24]" size={24}/>
                 Simulateur de Zone de Virage
               </h3>
               <p className="text-slate-500 text-sm mt-1 font-medium">Visualisez le changement de teinte précis.</p>
           </div>
           
           <div className="relative">
               <select 
                className="pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] appearance-none cursor-pointer shadow-sm w-full md:w-auto"
                value={selectedInd.name}
                onChange={(e) => {
                    const ind = indicators.find(i => i.name === e.target.value);
                    if (ind) {
                        setSelectedInd(ind);
                        setPh(ind.pka);
                    }
                }}
                >
                {indicators.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
           </div>
       </div>

       <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Beaker Visualization */}
            <div className="flex flex-col items-center justify-center order-2 md:order-1 bg-slate-50/50 p-8 rounded-2xl border border-slate-100">
                <div className="relative w-40 h-52">
                    {/* Beaker Glass */}
                    <div className="absolute inset-0 border-x-4 border-b-4 border-slate-200 rounded-b-[3rem] bg-white/20 z-20 pointer-events-none shadow-[inset_0_-10px_20px_rgba(0,0,0,0.05)] ring-1 ring-white/50"></div>
                    
                    {/* Liquid Container */}
                    <div className="absolute bottom-2 left-2 right-2 top-12 rounded-b-[2.5rem] overflow-hidden z-10 transition-all duration-300">
                        {/* Acid Color Layer */}
                        <div 
                            className={`absolute inset-0 transition-colors duration-200 ${acidLiquidClass}`}
                        ></div>
                         {/* Incolore bg */}
                         {selectedInd.id === 'phenolphthaleine' && blendFactor < 1 && (
                            <div className="absolute inset-0 bg-slate-100/50"></div>
                         )}

                        {/* Base Color Layer */}
                        <motion.div 
                            className={`absolute inset-0 ${classes.baseBg}`}
                            animate={{ opacity: blendFactor }}
                            transition={{ duration: 0.1 }}
                        />

                        {/* Liquid Shine */}
                        <div className="absolute top-0 left-4 right-4 h-3 bg-white/40 rounded-[100%] blur-md"></div>
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Teinte Observée</div>
                    <div className={`text-2xl font-black transition-colors duration-300 tracking-tight ${observedToneClass}`}>
                        {blendFactor < 0.1 ? selectedInd.acidColorName : 
                         blendFactor > 0.9 ? selectedInd.baseColorName : 
                         selectedInd.mixColorName}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="order-1 md:order-2">
                <div className="bg-slate-50 p-6 md:p-8 rounded-2xl border border-slate-200 mb-8 relative shadow-inner">
                    <div className="flex justify-between items-end mb-4 relative z-10">
                        <label className="font-bold text-slate-700 text-sm uppercase tracking-wide">pH de la solution</label>
                        <span className="font-math text-4xl font-black text-[#4c1d95] bg-white px-4 py-1 rounded-xl shadow-sm border border-purple-100 min-w-[3ch] text-center">{ph.toFixed(1)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="14" 
                        step="0.1" 
                        value={ph}
                        onChange={(e) => setPh(parseFloat(e.target.value))}
                        className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#4c1d95] relative z-10"
                    />
                     <div className="flex justify-between text-xs font-bold text-slate-400 mt-2 font-mono relative z-10">
                        <span>0</span>
                        <span>7</span>
                        <span>14</span>
                    </div>
                </div>

                {/* Diagram */}
                <div className="relative pt-10 pb-4 select-none px-2">
                    
                    {/* Scale Bar */}
                    <div className="h-4 w-full rounded-full relative overflow-hidden flex shadow-sm border border-slate-100">
                        <div 
                            className={`h-full transition-all duration-500 ${classes.acidWidth} ${classes.acidBg} ${classes.scaleAcidOpacity}`}
                        />
                        <div 
                            className={`h-full transition-all duration-500 ${classes.mixWidth} ${classes.mixGradient}`}
                        />
                        <div 
                            className={`h-full transition-all duration-500 ${classes.baseWidth} ${classes.baseBg} opacity-80`}
                        />
                    </div>

                    {/* pKa Marker */}
                    <div 
                        className={`absolute top-0 flex -translate-x-1/2 flex-col items-center transition-all duration-500 ${classes.pkaLeft}`}
                    >
                         <span className="font-math text-[10px] font-bold text-slate-500 mb-1 whitespace-nowrap bg-white px-1 rounded shadow-sm">pKₐ = {selectedInd.pka}</span>
                         <div className="w-px h-12 bg-slate-400/50 dashed"></div>
                    </div>

                    {/* Zone Labels */}
                    <div className="mt-2 text-[10px] text-slate-400 font-mono relative h-6">
                        <span className={`absolute -translate-x-1/2 transition-all duration-500 ${classes.startLeft}`}>{selectedInd.virageStart}</span>
                        <span className={`absolute -translate-x-1/2 transition-all duration-500 ${classes.endLeft}`}>{selectedInd.virageEnd}</span>
                        
                        <div 
                            className={`absolute top-6 -translate-x-1/2 text-[9px] font-bold uppercase tracking-widest text-[#4c1d95] transition-all duration-500 whitespace-nowrap bg-purple-50 px-2 py-0.5 rounded-full ${classes.zoneLeft}`}
                        >
                            Zone de Virage
                        </div>
                    </div>
                    
                    {/* Cursor */}
                    <motion.div 
                        className="absolute top-8 bottom-0 w-0.5 bg-slate-900 z-30 pointer-events-none"
                        animate={{ left: `${(ph / 14) * 100}%` }}
                    >
                        <div className="absolute -top-8 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded font-bold shadow-lg">pH</div>
                    </motion.div>
                </div>
            </div>
       </div>
    </div>
  );
};
