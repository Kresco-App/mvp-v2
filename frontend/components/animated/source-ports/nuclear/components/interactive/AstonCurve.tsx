/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';

const data = [
  { a: 1,  ev: 0, label: '1H' },
  { a: 2,  ev: 1.1, label: '2H' },
  { a: 3,  ev: 2.5, label: '3H' },
  { a: 4,  ev: 7.07, label: '4He' },
  { a: 6,  ev: 5.3, label: '6Li' },
  { a: 12, ev: 7.68, label: '12C' },
  { a: 16, ev: 7.98, label: '16O' },
  { a: 56, ev: 8.79, label: '56Fe (Max)' }, // Iron Peak
  { a: 100, ev: 8.6, label: '' },
  { a: 140, ev: 8.4, label: '140Xe' },
  { a: 190, ev: 7.9, label: '' },
  { a: 235, ev: 7.59, label: '235U' },
  { a: 238, ev: 7.57, label: '238U' },
];

// We plot -El/A, so values will be negative. 
// Stable nuclei are at the bottom (most negative).
const plotData = data.map(d => ({ ...d, negEv: -d.ev }));

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg text-xs z-50">
        <p className="font-bold text-slate-800 mb-1">{d.label || `A = ${d.a}`}</p>
        <p className="text-slate-600">Eℓ/A : <span className="font-mono font-bold text-purple-600">{d.ev} MeV</span></p>
      </div>
    );
  }
  return null;
};

export const AstonCurve: React.FC = () => {
  return (
    <div className="bg-white p-4 md:p-6 rounded-3xl shadow-lg border border-slate-100 my-8">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-slate-900">La Courbe d'Aston</h3>
        <p className="text-slate-500 text-sm">Stabilité des noyaux en fonction du nombre de masse A</p>
      </div>

      <div className="h-[300px] md:h-[500px] w-full font-sans text-xs relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis 
              dataKey="a" 
              type="number" 
              domain={[0, 250]} 
              label={{ value: 'Nombre de masse (A)', position: 'insideBottom', offset: -5, fill: '#64748b' }} 
              tick={{ fill: '#94a3b8' }}
            />
            <YAxis 
              domain={[-10, 0]} 
              label={{ value: '- Eℓ / A (MeV/nucléon)', angle: -90, position: 'insideLeft', fill: '#64748b', offset: 10 }}
              tick={{ fill: '#94a3b8' }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Zones */}
            <ReferenceLine x={20} stroke="#cbd5e1" strokeDasharray="3 3" />
            <ReferenceLine x={190} stroke="#cbd5e1" strokeDasharray="3 3" />
            
            {/* Labels for Zones - Hidden on very small screens to avoid clutter, visible on md */}
            <ReferenceDot x={10} y={-2} r={0} label={{ value: 'FUSION', position: 'inside', fill: '#ea580c', fontSize: 10, fontWeight: 'bold' }} />
            <ReferenceDot x={100} y={-9.5} r={0} label={{ value: 'STABILITÉ', position: 'top', fill: '#16a34a', fontSize: 10, fontWeight: 'bold' }} />
            <ReferenceDot x={220} y={-2} r={0} label={{ value: 'FISSION', position: 'inside', fill: '#ea580c', fontSize: 10, fontWeight: 'bold' }} />

            {/* Curve */}
            <Line 
              type="monotone" 
              dataKey="negEv" 
              stroke="#4f46e5" 
              strokeWidth={3} 
              dot={{ r: 3, fill: '#4f46e5', strokeWidth: 0 }} 
              activeDot={{ r: 5 }} 
            />
          </LineChart>
        </ResponsiveContainer>
        
        {/* Annotations Layer - Responsive visibility */}
        <div className="hidden md:block absolute bottom-12 left-12 bg-orange-50 text-orange-700 px-2 py-1 rounded text-[10px] border border-orange-100">
            Noyaux légers
        </div>
        <div className="hidden md:block absolute bottom-12 right-12 bg-orange-50 text-orange-700 px-2 py-1 rounded text-[10px] border border-orange-100">
            Noyaux lourds
        </div>
        <div className="hidden md:block absolute bottom-[85%] left-1/2 -translate-x-1/2 bg-green-50 text-green-700 px-2 py-1 rounded text-[10px] border border-green-100 shadow-sm">
            Vallée de stabilité
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-sm">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="font-bold text-slate-700 block mb-1">Fusion</span>
            <p className="text-slate-500 leading-relaxed">Les petits noyaux (A &lt; 20) tendent à fusionner pour augmenter leur énergie de liaison par nucléon (descendre dans le creux).</p>
        </div>
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
            <span className="font-bold text-indigo-700 block mb-1">Stabilité</span>
            <p className="text-indigo-600 leading-relaxed">Autour de A ≈ 60 (Fer), l'énergie de liaison est maximale (~8.8 MeV). Ce sont les noyaux les plus stables.</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="font-bold text-slate-700 block mb-1">Fission</span>
            <p className="text-slate-500 leading-relaxed">Les gros noyaux (A &gt; 190) tendent à se casser (fission) pour former des noyaux moyens plus stables.</p>
        </div>
      </div>
    </div>
  );
};
