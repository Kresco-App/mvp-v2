/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const TOTAL_ATOMS = 200;
const MAX_TIME = 20; // Simulation duration in seconds

export const DecayLawGraph: React.FC = () => {
  const [halfLife, setHalfLife] = useState(4); // seconds
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Generate a random "survival rank" for each grid position only once on mount.
  const atomRanks = useMemo(() => {
    const ranks = Array.from({ length: TOTAL_ATOMS }, (_, i) => i);
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
    }
    return ranks;
  }, []);

  const lambda = Math.log(2) / halfLife;
  const currentN = Math.round(TOTAL_ATOMS * Math.exp(-lambda * currentTime));
  
  // Animation Loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= MAX_TIME) {
            setIsPlaying(false);
            return MAX_TIME;
          }
          return prev + 0.05; // 50ms steps
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const reset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Chart Data
  const data = useMemo(() => {
    const points = [];
    for (let t = 0; t <= MAX_TIME; t += 0.5) {
      points.push({
        t,
        N: TOTAL_ATOMS * Math.exp(-lambda * t)
      });
    }
    return points;
  }, [lambda]);

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-purple-100 space-y-6">
      
      {/* Controls Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-purple-50 p-4 rounded-lg">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button type="button"
            onClick={togglePlay}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-white transition-all shadow-md ${
              isPlaying ? 'bg-yellow-500 hover:bg-yellow-600 text-purple-900' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {isPlaying ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Simuler</>}
          </button>
          <button type="button"
            onClick={reset}
            className="p-2 rounded-full bg-white text-purple-600 border border-purple-200 hover:bg-purple-100 transition-colors"
            title="Réinitialiser"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
           <div className="flex flex-col w-full">
             <div className="flex justify-between text-xs font-bold text-purple-700 mb-1">
                <span>Demi-vie (t<sub>1/2</sub>)</span>
                <span>{halfLife} s</span>
             </div>
             <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={halfLife}
                onChange={(e) => {
                    setHalfLife(Number(e.target.value));
                    reset();
                }}
                className="w-full md:w-48 accent-purple-600 h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer"
             />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Visual Sample */}
        <div className="space-y-4">
           <div className="flex justify-between items-end">
              <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm md:text-base">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                Échantillon Radioactif
              </h4>
              <div className="text-right">
                 <div className="text-xl md:text-2xl font-mono font-bold text-purple-600">{currentN}</div>
                 <div className="text-xs text-slate-400 uppercase">Noyaux Restants</div>
              </div>
           </div>
           
           {/* Atom Grid */}
           <div className="bg-slate-100 p-3 md:p-4 rounded-xl inner-shadow h-48 md:h-64 flex flex-wrap content-start gap-0.5 md:gap-1 overflow-hidden justify-center border border-slate-200">
              {atomRanks.map((rank, index) => {
                  const isActive = rank < currentN;
                  return (
                    <motion.div
                        key={index}
                        initial={false}
                        animate={{
                            backgroundColor: isActive ? '#9333ea' : '#cbd5e1', // Purple-600 vs Slate-300
                            scale: isActive ? 1 : 0.4,
                            opacity: isActive ? 1 : 0.3,
                        }}
                        transition={{ duration: 0.5 }}
                        className="w-2 h-2 md:w-3 md:h-3 rounded-full"
                    />
                  );
              })}
           </div>
           <div className="text-xs text-slate-500 text-center italic">
              Les noyaux se désintègrent aléatoirement.
           </div>
        </div>

        {/* Right: Graph */}
        <div className="space-y-4">
             <div className="flex justify-between items-end">
                <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm md:text-base">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    Courbe de décroissance
                </h4>
                <div className="flex items-center gap-2 text-xs md:text-sm font-mono bg-purple-50 px-2 py-1 rounded text-purple-700">
                    <Clock size={14} />
                    <span>t = {currentTime.toFixed(1)} s</span>
                </div>
            </div>

            <div className="h-48 md:h-64 w-full bg-white rounded-xl border border-slate-100 p-2">
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis 
                        dataKey="t" 
                        type="number" 
                        domain={[0, MAX_TIME]}
                        tickFormatter={(val) => `${val}s`}
                        stroke="#94a3b8"
                        tick={{fontSize: 10}}
                    />
                    <YAxis 
                        domain={[0, TOTAL_ATOMS]} 
                        hide 
                    />
                    <Tooltip 
                        formatter={(val) => [Math.round(Number(val ?? 0)), 'Noyaux']}
                        labelFormatter={(label) => `t = ${label}s`}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line 
                        type="monotone" 
                        dataKey="N" 
                        stroke="#9333ea" 
                        strokeWidth={3} 
                        dot={false} 
                        animationDuration={0} 
                    />
                    
                    {/* Reference Lines */}
                    <ReferenceLine x={halfLife} stroke="#eab308" strokeDasharray="3 3" />
                    <ReferenceLine y={TOTAL_ATOMS / 2} stroke="#eab308" strokeDasharray="3 3" />
                    
                    {/* Moving Cursor */}
                    <ReferenceDot 
                        x={currentTime} 
                        y={currentN} 
                        r={6} 
                        fill="#fff" 
                        stroke="#eab308" 
                        strokeWidth={3} 
                    />
                </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="flex justify-center gap-6 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span>Demi-vie (t<sub>1/2</sub>)</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                    <span>Loi N(t)</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
