/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BarChart2 } from 'lucide-react';

export const DistributionChart: React.FC = () => {
  const [pka, setPka] = useState(4.8);

  const data = useMemo(() => {
    const points = [];
    for (let ph = 0; ph <= 14; ph += 0.5) {
      const ratio = Math.pow(10, ph - pka);
      const alphaBase = (ratio / (1 + ratio)) * 100;
      const alphaAcid = 100 - alphaBase;
      points.push({
        ph,
        acid: alphaAcid,
        base: alphaBase
      });
    }
    return points;
  }, [pka]);

  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 my-12">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-[#1e1b4b] flex items-center">
            <BarChart2 className="mr-2 text-[#fbbf24]" size={24}/> Diagramme de Distribution
        </h3>
      </div>
      
      {/* Controls */}
      <div className="mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-200">
        <div className="flex justify-between items-end mb-4">
            <label className="text-sm font-bold text-slate-600 uppercase tracking-wide">
            Ajuster le pKₐ du couple
            </label>
            <span className="font-math text-2xl font-bold text-[#4c1d95] bg-white px-3 py-1 rounded-lg shadow-sm border border-slate-100">{pka.toFixed(1)}</span>
        </div>
        <input 
          type="range" 
          min="2" 
          max="12" 
          step="0.1" 
          value={pka}
          onChange={(e) => setPka(parseFloat(e.target.value))}
          className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#4c1d95]"
        />
      </div>

      {/* Chart */}
      <div className="h-[350px] w-full font-sans text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis 
                dataKey="ph" 
                type="number" 
                domain={[0, 14]} 
                tickCount={15} 
                axisLine={false}
                tickLine={false}
                tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 600}}
                dy={10}
            />
            <YAxis 
                domain={[0, 100]} 
                axisLine={false}
                tickLine={false}
                tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 600}}
                tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
                formatter={(value: number) => value.toFixed(1) + '%'}
                contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    padding: '12px',
                    fontFamily: 'Inter, sans-serif'
                }}
            />
            <ReferenceLine x={pka} stroke="#1e1b4b" strokeDasharray="3 3" strokeWidth={2} label={{ position: 'insideTop', value: `pKₐ`, fill: '#1e1b4b', fontSize: 12, fontWeight: 'bold' }} />
            <Line type="monotone" dataKey="acid" stroke="#ef4444" name="Acide (AH)" strokeWidth={3} dot={false} activeDot={{r: 6}} />
            <Line type="monotone" dataKey="base" stroke="#3b82f6" name="Base (A⁻)" strokeWidth={3} dot={false} activeDot={{r: 6}} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Legend */}
      <div className="mt-6 flex justify-center space-x-8 text-sm font-medium">
        <div className="flex items-center">
            <span className="w-3 h-3 rounded-full bg-red-500 mr-2 shadow-sm"></span>
            <span className="text-slate-600">% Forme Acide (AH)</span>
        </div>
        <div className="flex items-center">
             <span className="w-3 h-3 rounded-full bg-blue-500 mr-2 shadow-sm"></span>
            <span className="text-slate-600">% Forme Basique (A⁻)</span>
        </div>
      </div>
    </div>
  );
};
