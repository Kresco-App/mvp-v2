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
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'transverse'
              ? 'bg-white shadow text-purple-600'
              : 'text-slate-500 hover:bg-white/50'
          }`}
        >
          Transversale
        </button>
        <button type="button"
          onClick={() => setActiveTab('longitudinal')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
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
             {/* CSS Animation for Transverse Wave */}
             <div className="w-full flex justify-between items-center px-4">
                {Array.from({ length: 50 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-purple-500 rounded-full shadow-sm"
                    style={{
                      animation: `bounce 1.5s infinite linear`,
                      animationDelay: `-${i * 0.06}s`
                    }}
                  />
                ))}
             </div>
             <style>{`
               @keyframes bounce {
                 0% { transform: translateY(0); animation-timing-function: ease-out; }
                 25% { transform: translateY(-25px); animation-timing-function: ease-in; }
                 50% { transform: translateY(0); animation-timing-function: ease-out; }
                 75% { transform: translateY(25px); animation-timing-function: ease-in; }
                 100% { transform: translateY(0); }
               }
             `}</style>
             
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
             {/* CSS Animation for Longitudinal Wave */}
             <div className="w-full flex justify-between items-center px-8 overflow-hidden">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 h-10 bg-emerald-500/90 rounded-full"
                    style={{
                      animation: `compress 1.5s infinite linear`,
                      animationDelay: `-${i * 0.05}s` // 60 * 0.05 = 3s total phase (2 cycles)
                    }}
                  />
                ))}
             </div>
             <style>{`
               @keyframes compress {
                 0% { transform: translateX(0); animation-timing-function: ease-out; }
                 25% { transform: translateX(8px); animation-timing-function: ease-in; }
                 50% { transform: translateX(0); animation-timing-function: ease-out; }
                 75% { transform: translateX(-8px); animation-timing-function: ease-in; }
                 100% { transform: translateX(0); }
               }
             `}</style>
             
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
