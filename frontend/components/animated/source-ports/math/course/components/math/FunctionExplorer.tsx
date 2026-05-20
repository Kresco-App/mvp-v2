/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';
import { Mafs, Coordinates, Plot, Theme, useMovablePoint, Line } from 'mafs';
import { FunctionSquare, TrendingUp, Activity } from 'lucide-react';

export const FunctionExplorer: React.FC = () => {
  const [funcType, setFuncType] = useState<'poly' | 'exp' | 'ln'>('poly');
  
  // Interactive point for tangent demonstration
  const point = useMovablePoint([1, 1], {
    constrain: ([x, y]) => {
        // Constrain point to the current function curve
        let targetY = 0;
        if (funcType === 'poly') targetY = x * x;
        if (funcType === 'exp') targetY = Math.exp(x);
        if (funcType === 'ln') targetY = Math.log(Math.max(0.1, x));
        return [x, targetY];
    }
  });

  // Define functions
  const poly = (x: number) => x * x;
  const exp = (x: number) => Math.exp(x);
  const ln = (x: number) => Math.log(x);

  // Derivative for tangent
  const getDerivative = (x: number) => {
      if (funcType === 'poly') return 2 * x;
      if (funcType === 'exp') return Math.exp(x);
      if (funcType === 'ln') return 1 / x;
      return 0;
  };

  const currentFunc = funcType === 'poly' ? poly : funcType === 'exp' ? exp : ln;
  const slope = getDerivative(point.x);
  
  // Tangent line equation: y - y0 = m(x - x0) => y = m(x - x0) + y0
  const tangent = (x: number) => slope * (x - point.x) + point.y;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-xl">
        <button
          onClick={() => setFuncType('poly')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
            funcType === 'poly' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          <FunctionSquare size={18} /> f(x) = x²
        </button>
        <button
          onClick={() => setFuncType('exp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
            funcType === 'exp' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          <TrendingUp size={18} /> f(x) = eˣ
        </button>
        <button
          onClick={() => setFuncType('ln')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
            funcType === 'ln' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          <Activity size={18} /> f(x) = ln(x)
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[400px]">
        <Mafs zoom={true} pan={true} height={400}>
          <Coordinates.Cartesian subdivisions={4} />
          
          <Plot.OfX 
            y={currentFunc} 
            color={Theme.red} 
            weight={3} 
          />

          {/* Tangent Line */}
          <Plot.OfX 
            y={tangent} 
            style="dashed"
            opacity={0.5}
            color={Theme.blue} 
          />

          {point.element}
        </Mafs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-1">Point (x)</h4>
              <p className="text-2xl font-mono font-bold text-slate-800">{point.x.toFixed(2)}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-1">Image f(x)</h4>
              <p className="text-2xl font-mono font-bold text-rose-600">{point.y.toFixed(2)}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-1">Dérivée f'(x)</h4>
              <p className="text-2xl font-mono font-bold text-blue-600">{slope.toFixed(2)}</p>
          </div>
      </div>
      
      <div className="text-sm text-slate-500 italic">
          * Déplacez le point sur la courbe pour visualiser la tangente et le nombre dérivé.
      </div>
    </div>
  );
};
