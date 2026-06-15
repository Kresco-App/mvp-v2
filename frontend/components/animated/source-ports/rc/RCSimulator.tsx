'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, ReferenceDot } from 'recharts';
import { Play, Pause, RotateCcw, Settings, Zap, Activity, TrendingUp, Battery } from 'lucide-react';
import { motion } from 'framer-motion';

export const RCSimulator: React.FC = () => {
  const [resistance, setResistance] = useState<number>(1); // kOhm
  const [capacitance, setCapacitance] = useState<number>(1000); // microFarad
  const [voltage, setVoltage] = useState<number>(10); // Volts
  const [isCharging, setIsCharging] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [time, setTime] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<number>(10); // Default time range 10s
  
  // New Toggles
  const [showTangent, setShowTangent] = useState<boolean>(false);
  const [showEnergy, setShowEnergy] = useState<boolean>(false);

  // Constants
  const tau = (resistance * 1000) * (capacitance * 1e-6); // seconds (R in Ohms, C in Farads)

  // Animation loop
  useEffect(() => {
    let animationFrame: number;
    let lastTimestamp: number;

    const animate = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = (timestamp - lastTimestamp) / 1000; // seconds
      lastTimestamp = timestamp;

      if (isPlaying) {
        setTime((prevTime) => {
          const newTime = prevTime + delta;
          if (newTime >= timeRange) {
            setIsPlaying(false);
            return timeRange;
          }
          return newTime;
        });
        animationFrame = requestAnimationFrame(animate);
      }
    };

    if (isPlaying) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      lastTimestamp = 0; // Reset timestamp
    }

    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, timeRange]);

  // Calculate data points for the graph
  const data = useMemo(() => {
    const points = [];
    const steps = 150; 
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * timeRange;
      let uc, i_current;
      
      if (isCharging) {
        uc = voltage * (1 - Math.exp(-t / tau));
        i_current = (voltage / (resistance * 1000)) * Math.exp(-t / tau) * 1000; // mA
      } else {
        uc = voltage * Math.exp(-t / tau);
        i_current = -(voltage / (resistance * 1000)) * Math.exp(-t / tau) * 1000; // mA
      }
      
      // Energy in Joules (mJ for display) -> E = 0.5 * C * u^2
      const energy = 0.5 * (capacitance * 1e-6) * uc * uc * 1000; // mJ

      // Tangent calculation at t=0 for charging: y = (E/tau) * t
      // For discharging: y = E - (E/tau) * t
      let tangent = null;
      if (showTangent) {
          if (isCharging) {
              tangent = (voltage / tau) * t;
              // Clamp tangent for better visual
              if (tangent > voltage * 1.5) tangent = null; 
          } else {
              tangent = voltage - (voltage / tau) * t;
              if (tangent < -voltage * 0.5) tangent = null;
          }
      }
      
      points.push({
        t: t, 
        t_formatted: t.toFixed(2),
        uc: parseFloat(uc.toFixed(2)),
        i: parseFloat(i_current.toFixed(2)),
        energy: parseFloat(energy.toFixed(2)),
        tangent: tangent ? parseFloat(tangent.toFixed(2)) : null,
      });
    }
    return points;
  }, [resistance, capacitance, voltage, isCharging, tau, timeRange, showTangent]);

  // Current values based on 'time' state
  const currentValues = useMemo(() => {
    let uc, i_current;
    if (isCharging) {
      uc = voltage * (1 - Math.exp(-time / tau));
      i_current = (voltage / (resistance * 1000)) * Math.exp(-time / tau) * 1000; // mA
    } else {
      uc = voltage * Math.exp(-time / tau);
      i_current = -(voltage / (resistance * 1000)) * Math.exp(-time / tau) * 1000; // mA
    }
    const energy = 0.5 * (capacitance * 1e-6) * uc * uc * 1000; // mJ
    return { uc, i_current, energy };
  }, [time, isCharging, voltage, tau, resistance, capacitance]);

  const handleReset = () => {
    setIsPlaying(false);
    setTime(0);
  };

  const togglePlay = () => {
    if (time >= timeRange) {
      setTime(0);
    }
    setIsPlaying(!isPlaying);
  };
  
  // Visual helpers
  const currentOpacity = Math.min(Math.abs(currentValues.i_current || 0) / (voltage / resistance), 1);
  const capacitorChargeRatio = currentValues.uc / voltage;

  return (
    <div className="w-full max-w-6xl mx-auto my-8 font-sans">
      {/* Main Simulator Card */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
         
         {/* Header */}
         <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
             <div>
                 <h2 className="text-2xl font-bold flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-lg">
                        <Activity size={24} className="text-white" />
                    </div>
                    Simulateur Circuit RC
                 </h2>
                 <p className="text-slate-400 text-sm mt-1 ml-14">Analyse dynamique de la charge et décharge</p>
             </div>
             <div className="flex gap-4">
                 <div className="px-4 py-2 bg-slate-800 rounded-xl border border-slate-700 flex flex-col items-end">
                     <span className="text-xs text-slate-400 uppercase font-bold">Constante de temps</span>
                     <span className="text-xl font-mono font-bold text-emerald-400">τ = {tau.toFixed(2)} s</span>
                 </div>
             </div>
         </div>

         <div className="grid grid-cols-1 xl:grid-cols-12 bg-slate-50">
             
             {/* Left Column: Visualization & Controls (7 cols) */}
             <div className="xl:col-span-7 p-6 flex flex-col gap-6 border-r border-slate-200">
                
                {/* Circuit Diagram */}
                <div className="relative w-full aspect-[16/9] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-800 group">
                    {/* Grid Background */}
                    <div className="absolute inset-0 opacity-20 bg-[linear-gradient(#334155_1px,transparent_1px),linear-gradient(90deg,#334155_1px,transparent_1px)] [background-size:20px_20px]"></div>

                    <svg viewBox="0 0 500 300" className="w-full h-full relative z-10">
                        <defs>
                            <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                            <linearGradient id="capFill" x1="0" x2="1" y1="0" y2="0">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
                                <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
                            </linearGradient>
                        </defs>

                        {/* STATIC WIRES (Dimmed) */}
                        <g stroke="#475569" strokeWidth="3" strokeLinecap="round" fill="none">
                            {/* Ground Rail */}
                            <path d="M 60 240 L 400 240" /> 
                            
                            {/* Generator Vertical */}
                            <path d="M 60 240 L 60 160 M 60 120 L 60 60 L 140 60" />

                            {/* Discharge Loop (Vertical down from switch pos 2 to ground) */}
                            <path d="M 140 140 L 140 240" strokeDasharray="4 4" opacity="0.5" />

                            {/* Common Path (Switch -> R -> C) */}
                            <path d="M 190 100 L 240 100" /> {/* Switch Arm Pivot to Resistor start */}
                            <path d="M 320 100 L 400 100 L 400 120" /> {/* Resistor end to Cap top */}
                            <path d="M 400 180 L 400 240" /> {/* Cap bottom to ground */}
                        </g>

                        {/* --- ACTIVE GLOWING PATHS --- */}
                        {/* Charging Loop Glow */}
                        <g opacity={isCharging ? 0.4 + currentOpacity * 0.6 : 0.1} className="transition-opacity duration-200">
                            <path 
                                d="M 60 240 L 60 160 M 60 120 L 60 60 L 140 60 M 168 78 L 190 100 L 240 100 M 320 100 L 400 100 L 400 120 M 400 180 L 400 240 L 60 240"
                                stroke="#3b82f6" 
                                strokeWidth={isCharging ? 4 : 0}
                                fill="none"
                                strokeLinecap="round"
                                filter={isCharging && isPlaying ? "url(#neon-glow)" : ""}
                                strokeDasharray={isCharging && isPlaying ? "12 6" : "0"}
                            >
                                {isCharging && isPlaying && (
                                    <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.6s" repeatCount="indefinite" />
                                )}
                            </path>
                        </g>

                        {/* Discharging Loop Glow */}
                        <g opacity={!isCharging ? 0.4 + currentOpacity * 0.6 : 0.1} className="transition-opacity duration-200">
                            <path 
                                d="M 400 120 L 400 100 L 320 100 M 240 100 L 190 100 L 168 122 M 140 140 L 140 240 L 400 240 L 400 180"
                                stroke="#f97316" 
                                strokeWidth={!isCharging ? 4 : 0}
                                fill="none"
                                strokeLinecap="round"
                                filter={!isCharging && isPlaying ? "url(#neon-glow)" : ""}
                                strokeDasharray={!isCharging && isPlaying ? "12 6" : "0"}
                            >
                                {!isCharging && isPlaying && (
                                    <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.6s" repeatCount="indefinite" />
                                )}
                            </path>
                        </g>

                        {/* --- COMPONENTS --- */}

                        {/* Generator (DC) */}
                        <g transform="translate(60, 140)">
                            <circle r="22" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                            <text y="5" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">E</text>
                            <text x="-30" y="5" textAnchor="end" fill="#60a5fa" fontSize="12" fontWeight="bold">{voltage}V</text>
                        </g>

                        {/* Switch (SPDT) */}
                        <g transform="translate(140, 60)">
                            <circle r="4" fill="#94a3b8" /> {/* Terminal 1 (Charge) */}
                            <text x="-10" y="-10" textAnchor="end" fill="#94a3b8" fontSize="10">1</text>
                        </g>
                        <g transform="translate(140, 140)">
                             <circle r="4" fill="#94a3b8" /> {/* Terminal 2 (Discharge) */}
                             <text x="-10" y="20" textAnchor="end" fill="#94a3b8" fontSize="10">2</text>
                        </g>
                        <g transform="translate(190, 100)">
                             <circle r="4" fill="#cbd5e1" /> {/* Common Terminal */}
                        </g>
                        
                        {/* Switch Arm (Animated) */}
                        <motion.line 
                            x1="190" y1="100"
                            x2="140" y2={isCharging ? 60 : 140}
                            stroke="white" strokeWidth="4" strokeLinecap="round"
                            animate={{ x2: 140, y2: isCharging ? 60 : 140 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        />

                        {/* Resistor */}
                        <g transform="translate(240, 90)">
                            <rect width="80" height="20" rx="4" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
                            <text x="40" y="15" textAnchor="middle" fill="#334155" fontSize="12" fontWeight="bold">{resistance} kΩ</text>
                        </g>

                        {/* Capacitor */}
                        <g transform="translate(400, 150)">
                            {/* Field Glow */}
                            <rect x="-20" y="-30" width="40" height="60" fill="url(#capFill)" opacity={capacitorChargeRatio} rx="4" />
                            
                            {/* Plates */}
                            <line x1="-25" y1="-30" x2="25" y2="-30" stroke="white" strokeWidth="4" strokeLinecap="round" />
                            <line x1="-25" y1="30" x2="25" y2="30" stroke="white" strokeWidth="4" strokeLinecap="round" />
                            
                            {/* Gap (No line connecting plates) */}

                            <text x="35" y="5" textAnchor="start" fill="#94a3b8" fontSize="12" fontWeight="bold">{capacitance} μF</text>
                        </g>

                        {/* Voltmeter Indicator */}
                        <g transform="translate(460, 150)" opacity="0.8">
                             <circle r="15" fill="#1e293b" stroke="#475569" />
                             <text y="4" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">V</text>
                             <path d="M -45 -30 L -15 -30 L 0 -15" fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="2 2"/>
                             <path d="M -45 30 L -15 30 L 0 15" fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="2 2"/>
                        </g>

                    </svg>

                    {/* Floating Badges */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                        <div className={`px-3 py-1 rounded-full text-xs font-bold shadow-lg transition-colors ${isCharging ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                            Charge
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold shadow-lg transition-colors ${!isCharging ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                            Décharge
                        </div>
                    </div>
                </div>

                {/* Control Panel (Compact) */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                     <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Settings size={18} /> Paramètres
                        </h3>
                        
                        {/* Playback Controls */}
                        <div className="flex gap-2">
                             <button type="button" 
                                onClick={togglePlay}
                                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isPlaying ? 'bg-amber-100 text-amber-600' : 'bg-slate-900 text-white hover:scale-105 shadow-md'}`}
                             >
                                {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
                             </button>
                             <button type="button" 
                                onClick={handleReset}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                             >
                                <RotateCcw size={18} />
                             </button>
                        </div>
                     </div>

                     <div className="space-y-5">
                        {/* Sliders Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <label className="font-medium text-slate-600">Résistance (R)</label>
                                    <span className="font-bold text-blue-600">{resistance} kΩ</span>
                                </div>
                                <input 
                                    type="range" min="0.1" max="10" step="0.1" value={resistance}
                                    onChange={(e) => { setResistance(parseFloat(e.target.value)); handleReset(); }}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <label className="font-medium text-slate-600">Capacité (C)</label>
                                    <span className="font-bold text-blue-600">{capacitance} μF</span>
                                </div>
                                <input 
                                    type="range" min="100" max="5000" step="100" value={capacitance}
                                    onChange={(e) => { setCapacitance(parseFloat(e.target.value)); handleReset(); }}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <label className="font-medium text-slate-600">Tension (E)</label>
                                    <span className="font-bold text-blue-600">{voltage} V</span>
                                </div>
                                <input 
                                    type="range" min="1" max="24" step="1" value={voltage}
                                    onChange={(e) => { setVoltage(parseFloat(e.target.value)); handleReset(); }}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <label className="font-medium text-slate-600">Zoom (Temps)</label>
                                    <span className="font-bold text-slate-500">{timeRange} s</span>
                                </div>
                                <input 
                                    type="range" min="1" max="50" step="1" value={timeRange}
                                    onChange={(e) => setTimeRange(parseFloat(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-500"
                                />
                            </div>
                        </div>

                        {/* Mode Switcher */}
                        <div className="bg-slate-100 p-1 rounded-xl flex mt-4">
                            <button type="button" 
                                onClick={() => { setIsCharging(true); handleReset(); }}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${isCharging ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Zap size={16} /> Position 1 : Charge
                            </button>
                            <button type="button" 
                                onClick={() => { setIsCharging(false); handleReset(); }}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${!isCharging ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Activity size={16} /> Position 2 : Décharge
                            </button>
                        </div>
                     </div>
                </div>
             </div>

             {/* Right Column: Data & Graph (5 cols) */}
             <div className="xl:col-span-5 bg-white p-6 flex flex-col border-t xl:border-t-0 xl:border-l border-slate-200">
                
                {/* Digital Readouts */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center">
                        <span className="text-xs font-bold text-slate-400 uppercase mb-1">Tension uC</span>
                        <div className="text-3xl font-mono font-bold text-blue-600">
                            {currentValues.uc?.toFixed(2)}<span className="text-sm text-slate-400 ml-1">V</span>
                        </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center">
                        <span className="text-xs font-bold text-slate-400 uppercase mb-1">Intensité i</span>
                        <div className="text-3xl font-mono font-bold text-orange-600">
                            {currentValues.i_current?.toFixed(2)}<span className="text-sm text-slate-400 ml-1">mA</span>
                        </div>
                    </div>
                </div>

                {/* Toggles for Analysis */}
                <div className="flex gap-2 mb-4">
                    <button type="button" 
                        onClick={() => setShowTangent(!showTangent)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-2 ${showTangent ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                        <TrendingUp size={14} /> {showTangent ? 'Masquer Tangente' : 'Voir Tangente'}
                    </button>
                    <button type="button" 
                        onClick={() => setShowEnergy(!showEnergy)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-2 ${showEnergy ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                        <Battery size={14} /> {showEnergy ? 'Masquer Énergie' : 'Voir Énergie'}
                    </button>
                </div>

                {/* Chart */}
                <div className="flex-1 min-h-[300px] bg-white rounded-2xl border border-slate-100 p-2 shadow-inner relative">
                    <div className="absolute top-4 right-4 z-10 bg-white/80 backdrop-blur px-2 py-1 rounded border border-slate-100 text-xs font-mono text-slate-500">
                        t = {time.toFixed(2)}s
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis 
                                dataKey="t" 
                                type="number" 
                                domain={[0, timeRange]} 
                                tickFormatter={(val) => `${val}s`}
                                stroke="#94a3b8"
                                tick={{fontSize: 10}}
                            />
                            <YAxis 
                                yAxisId="left"
                                domain={[0, 25]} 
                                stroke="#3b82f6"
                                tick={{fontSize: 10}}
                                width={30}
                            />
                            <YAxis 
                                yAxisId="right" 
                                orientation="right"
                                domain={['auto', 'auto']} 
                                stroke="#f97316"
                                tick={{fontSize: 10}}
                                width={30}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -5px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                labelFormatter={(val) => `t = ${Number(val).toFixed(2)}s`}
                            />
                            <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                            
                            <ReferenceLine x={tau} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'τ', fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
                            
                            {!showEnergy && (
                                <>
                                    <Line 
                                        yAxisId="left" type="monotone" dataKey="uc" 
                                        stroke="#3b82f6" strokeWidth={3} dot={false} 
                                        name="Tension (V)" isAnimationActive={false} 
                                    />
                                    <Line 
                                        yAxisId="right" type="monotone" dataKey="i" 
                                        stroke="#f97316" strokeWidth={2} dot={false} 
                                        name="Intensité (mA)" isAnimationActive={false} 
                                    />
                                    {showTangent && (
                                        <Line 
                                            yAxisId="left" type="linear" dataKey="tangent" 
                                            stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" dot={false}
                                            name="Tangente (t=0)" isAnimationActive={false}
                                        />
                                    )}
                                </>
                            )}

                            {showEnergy && (
                                <Line 
                                    yAxisId="left" type="monotone" dataKey="energy" 
                                    stroke="#eab308" strokeWidth={3} dot={false} 
                                    fill="url(#energyGradient)"
                                    name="Énergie (mJ)" isAnimationActive={false} 
                                />
                            )}
                            
                            <ReferenceLine x={time} stroke="#ef4444" strokeWidth={2} />
                            
                            {!showEnergy && (
                                <>
                                    <ReferenceDot x={time} y={currentValues.uc} yAxisId="left" r={4} fill="#3b82f6" stroke="white" strokeWidth={2} />
                                    <ReferenceDot x={time} y={currentValues.i_current} yAxisId="right" r={4} fill="#f97316" stroke="white" strokeWidth={2} />
                                </>
                            )}
                            {showEnergy && (
                                <ReferenceDot x={time} y={currentValues.energy} yAxisId="left" r={4} fill="#eab308" stroke="white" strokeWidth={2} />
                            )}

                        </LineChart>
                    </ResponsiveContainer>
                </div>
             </div>
         </div>
      </div>

    </div>
  );
};
