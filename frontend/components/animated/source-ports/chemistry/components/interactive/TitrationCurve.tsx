/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const data = [
  { v: 0, ph: 2.0 }, { v: 2, ph: 2.2 }, { v: 4, ph: 2.5 }, { v: 6, ph: 2.9 },
  { v: 8, ph: 3.5 }, { v: 9, ph: 4.0 }, { v: 9.5, ph: 4.8 }, { v: 9.8, ph: 5.5 },
  { v: 10, ph: 7.0 }, // Equivalence
  { v: 10.2, ph: 8.5 }, { v: 10.5, ph: 9.2 }, { v: 11, ph: 10.0 },
  { v: 12, ph: 10.8 }, { v: 14, ph: 11.3 }, { v: 16, ph: 11.6 }, { v: 18, ph: 11.8 }, { v: 20, ph: 12.0 }
];

export const TitrationCurve: React.FC = () => {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 my-6">
      <h3 className="text-lg font-bold text-emerald-900 mb-2">Courbe de Dosage (Acide fort / Base forte)</h3>
      <p className="text-sm text-slate-500 mb-4">Évolution du pH en fonction du volume de base versé (Vb).</p>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis 
                dataKey="v" 
                label={{ value: 'Vb (mL)', position: 'insideBottomRight', offset: -10 }} 
                type="number"
                domain={[0, 20]}
            />
            <YAxis 
                domain={[0, 14]} 
                label={{ value: 'pH', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            <Line type="monotone" dataKey="ph" stroke="#059669" strokeWidth={3} dot={false} />
            <ReferenceLine x={10} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Veq', position: 'insideTopLeft', fill: '#ef4444', fontSize: 12 }} />
            <ReferenceLine y={7} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'pHeq', position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-emerald-50 p-3 rounded text-sm text-emerald-800 mt-2 border border-emerald-100">
        <strong>Point d'équivalence (E) :</strong> Le point d'inflexion de la courbe où le saut de pH est maximal (ici Vb=10mL, pH=7).
      </div>
    </div>
  );
};
