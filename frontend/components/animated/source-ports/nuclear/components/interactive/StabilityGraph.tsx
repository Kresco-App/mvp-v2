/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, Label, Cell, CartesianGrid } from 'recharts';

// Define CustomTooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg text-sm z-50 ring-1 ring-black/5">
        <p className="font-bold mb-1 text-slate-800 border-b border-slate-100 pb-1">Noyau {data.z}-{data.n}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 my-1">
           <span className="text-slate-500">Protons (Z):</span> <span className="font-mono font-bold">{data.z}</span>
           <span className="text-slate-500">Neutrons (N):</span> <span className="font-mono font-bold">{data.n}</span>
        </div>
        <div className={`mt-2 px-2 py-1.5 rounded text-white text-center text-xs font-bold tracking-wide uppercase shadow-sm
          ${data.type === 'stable' ? 'bg-slate-900' : 
            data.type === 'beta-minus' ? 'bg-rose-500' : 
            data.type === 'beta-plus' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
          {data.tooltip}
        </div>
      </div>
    );
  }
  return null;
};

export const StabilityGraph: React.FC = () => {
  
  const data = useMemo(() => {
    const points = [];
    
    // We want a very clear valley. 
    // Let's generate points for Z from 0 to 100.
    
    for (let z = 2; z <= 96; z += 2) { 
        // Stability line approximation: N = Z * (1 + 0.006 * Z)
        const nStable = Math.round(z * (1 + 0.006 * z));
        
        // Stable Nuclei - The "Backbone"
        // Rendered on top (zIndex 10)
        points.push({ z, n: nStable, type: 'stable', tooltip: 'Stable', zIndex: 10 });
        if (z > 20) points.push({ z, n: nStable + 1, type: 'stable', tooltip: 'Stable', zIndex: 10 });
        if (z > 50) points.push({ z, n: nStable + 2, type: 'stable', tooltip: 'Stable', zIndex: 10 });

        // Unstable regions - visually distinct "clouds"
        
        // Beta Minus (N > N_stable) - Red/Rose (Excess Neutrons)
        for (let n = nStable + 3; n <= nStable + 20 + (z/5); n += 3) {
             points.push({ z, n, type: 'beta-minus', tooltip: 'Instable (β⁻)', zIndex: 1 });
        }

        // Beta Plus (N < N_stable) - Green/Emerald (Excess Protons)
        for (let n = nStable - 3; n >= z - 5 && n > 2; n -= 3) {
             points.push({ z, n, type: 'beta-plus', tooltip: 'Instable (β⁺)', zIndex: 1 });
        }

        // Alpha (Heavy Z) - Yellow/Amber
        if (z >= 84) {
             for (let n = nStable - 10; n <= nStable + 25; n += 4) {
                 points.push({ z, n, type: 'alpha', tooltip: 'Instable (α)', zIndex: 5 });
             }
        }
    }
    // Sort to draw stable points (higher zIndex) last
    return points.sort((a, b) => a.zIndex - b.zIndex);
  }, []);

  return (
    <div className="bg-white p-2 md:p-6 rounded-xl shadow-lg border border-purple-100 flex flex-col h-[500px] md:h-[600px] w-full max-w-4xl mx-auto">
      <div className="text-center mb-4 px-4">
        <h4 className="font-bold text-lg text-slate-900">Diagramme de Segré (N-Z)</h4>
        <p className="text-xs md:text-sm text-slate-500">Répartition des noyaux stables et instables</p>
      </div>
      
      <div className="flex-1 w-full min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis 
                type="number" 
                dataKey="z" 
                name="Protons (Z)" 
                domain={[0, 100]} 
                tickCount={11} 
                stroke="#64748b"
                tick={{fontSize: 10}}
            >
               <Label value="Nombre de Protons (Z)" offset={0} position="insideBottom" fill="#475569" style={{fontSize: '12px', fontWeight: 600}} />
            </XAxis>
            <YAxis 
                type="number" 
                dataKey="n" 
                name="Neutrons (N)" 
                domain={[0, 160]} 
                tickCount={9}
                stroke="#64748b"
                tick={{fontSize: 10}}
                width={40}
            >
               <Label value="Nombre de Neutrons (N)" angle={-90} position="insideLeft" fill="#475569" style={{textAnchor: 'middle', fontSize: '12px', fontWeight: 600}} />
            </YAxis>
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} isAnimationActive={false} />
            
            {/* N=Z Line */}
            <ReferenceLine 
              segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} 
              stroke="#94a3b8" 
              strokeWidth={2}
              strokeDasharray="5 5"
            />
            <ReferenceLine y={150} x={10} stroke="none" label={{ position: 'insideRight', value: 'N > Z (Excès de neutrons)', fill: '#f43f5e', fontSize: 12, fontWeight: 500 }} />
            <ReferenceLine y={10} x={80} stroke="none" label={{ position: 'top', value: 'N < Z (Excès de protons)', fill: '#10b981', fontSize: 12, fontWeight: 500 }} />

            <Scatter data={data} shape="circle" isAnimationActive={false}>
              {data.map((entry, index) => (
                <Cell 
                    key={`cell-${index}`} 
                    fill={
                        entry.type === 'stable' ? '#0f172a' : // Dark Slate
                        entry.type === 'beta-minus' ? '#fda4af' : // Lighter Rose
                        entry.type === 'beta-plus' ? '#6ee7b7' : // Lighter Emerald
                        '#fcd34d' // Lighter Amber
                    } 
                    stroke="none"
                    // Stable points larger
                    r={entry.type === 'stable' ? 4 : 3}
                    className="transition-opacity hover:opacity-100"
                    // Unstable points semi-transparent to reduce visual noise
                    style={{ opacity: entry.type === 'stable' ? 1 : 0.6 }}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-4 px-2 pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full shadow-sm">
            <div className="w-3 h-3 bg-slate-900 border-2 border-slate-500 rounded-full"></div>
            <span className="text-xs font-bold text-white">Vallée de Stabilité</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-full">
            <div className="w-3 h-3 bg-rose-400 rounded-full"></div>
            <span className="text-xs font-bold text-rose-800">β⁻ (Excès Neutrons)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full">
            <div className="w-3 h-3 bg-emerald-400 rounded-full"></div>
            <span className="text-xs font-bold text-emerald-800">β⁺ (Excès Protons)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-full">
            <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
            <span className="text-xs font-bold text-amber-800">α (Noyaux Lourds)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full">
             <div className="w-4 h-0.5 bg-slate-400 border-t border-b border-transparent"></div>
             <span className="text-xs font-bold text-slate-500">Ligne N = Z</span>
        </div>
      </div>
    </div>
  );
};
