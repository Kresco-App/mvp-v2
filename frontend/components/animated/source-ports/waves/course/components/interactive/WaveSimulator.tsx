/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';

export const WaveSimulator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'transverse' | 'longitudinal'>('transverse');

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden my-8">
      <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center justify-center gap-4">
        <button type="button"
          onClick={() => setActiveTab('transverse')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-[background-color,box-shadow,color] duration-150 ease-out ${
            activeTab === 'transverse'
              ? 'bg-white shadow text-purple-600'
              : 'text-slate-500 hover:bg-white/50'
          }`}
        >
          Transversale
        </button>
        <button type="button"
          onClick={() => setActiveTab('longitudinal')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-[background-color,box-shadow,color] duration-150 ease-out ${
            activeTab === 'longitudinal'
              ? 'bg-white shadow text-emerald-600'
              : 'text-slate-500 hover:bg-white/50'
          }`}
        >
          Longitudinale
        </button>
      </div>

      <div className="p-8 flex items-center justify-center bg-slate-900 min-h-[300px]">
        {activeTab === 'transverse' ? (
          <div className="relative w-full h-40 flex items-center">
             {/* SVG Animation for Transverse Wave */}
             <div className="w-full px-4">
                <svg className="h-24 w-full overflow-visible" aria-hidden="true" focusable="false">
                  {Array.from({ length: 50 }).map((_, i) => {
                    const x = `${2 + (i / 49) * 96}%`;
                    const begin = i === 0 ? '0s' : `-${(i * 0.06).toFixed(2)}s`;

                    return (
                      <circle key={i} cx={x} cy="50%" r="4" className="fill-purple-500 drop-shadow-sm">
                        <animateTransform
                          attributeName="transform"
                          type="translate"
                          values="0 0; 0 -25; 0 0; 0 25; 0 0"
                          dur="1.5s"
                          begin={begin}
                          repeatCount="indefinite"
                        />
                      </circle>
                    );
                  })}
                </svg>
             </div>
             
             {/* Propagation Arrow */}
             <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/50 text-xs font-mono flex items-center gap-2">
               <span>Propagation</span>
               <div className="w-12 h-px bg-white/30 relative">
                 <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 border-t border-r border-white/30 rotate-45"></div>
               </div>
             </div>
          </div>
        ) : (
          <div className="relative w-full h-40 flex items-center justify-center">
             {/* SVG Animation for Longitudinal Wave */}
             <div className="w-full overflow-hidden px-8">
                <svg className="h-24 w-full overflow-visible" aria-hidden="true" focusable="false">
                  {Array.from({ length: 60 }).map((_, i) => {
                    const x = `${1.5 + (i / 59) * 97}%`;
                    const begin = i === 0 ? '0s' : `-${(i * 0.05).toFixed(2)}s`;

                    return (
                      <rect key={i} x={x} y="28" width="2" height="40" rx="1" className="fill-emerald-500 opacity-90">
                        <animateTransform
                          attributeName="transform"
                          type="translate"
                          values="0 0; 8 0; 0 0; -8 0; 0 0"
                          dur="1.5s"
                          begin={begin}
                          repeatCount="indefinite"
                        />
                      </rect>
                    );
                  })}
                </svg>
             </div>
             
             <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/50 text-xs font-mono flex items-center gap-2">
               <span>Propagation</span>
               <div className="w-12 h-px bg-white/30 relative">
                 <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 border-t border-r border-white/30 rotate-45"></div>
               </div>
             </div>
          </div>
        )}
      </div>
      
      <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-sm text-slate-600">
        {activeTab === 'transverse' 
          ? "Les points du milieu (billes) se déplacent verticalement, tandis que l'onde avance horizontalement." 
          : "Les spires se rapprochent et s'écartent dans la même direction que la propagation de l'onde."}
      </div>
    </div>
  );
};
