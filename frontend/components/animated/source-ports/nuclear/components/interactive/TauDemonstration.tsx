/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';

import React from 'react';
import { Latex } from '@/components/animated/shared/Latex';

export const TauDemonstration: React.FC = () => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200 border-l-4 border-l-[#2E2E8A] my-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-[#2E2E8A]/10 flex items-center justify-center text-2xl">
          ⏱️
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#2E2E8A]">Démonstration : La Constante de Temps (τ)</h3>
          <p className="text-slate-500 text-sm">Méthode graphique et analytique</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Derivation Steps */}
        <div className="space-y-6">
          <div className="group bg-slate-50 hover:bg-white p-5 rounded-2xl border border-slate-200 hover:border-[#2E2E8A]/30 transition-[background-color,border-color] duration-150 ease-out shadow-sm">
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-3">
              <span className="bg-[#2E2E8A] text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-md shadow-indigo-900/20">1</span>
              Définition
            </h4>
            <p className="text-slate-600 mb-3 text-sm pl-11">On définit la constante de temps par la relation :</p>
            <div className="text-center py-2 text-lg">
              <Latex formula="\tau = \frac{1}{\lambda}" />
            </div>
          </div>

          <div className="group bg-slate-50 hover:bg-white p-5 rounded-2xl border border-slate-200 hover:border-[#2E2E8A]/30 transition-[background-color,border-color] duration-150 ease-out shadow-sm">
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-3">
              <span className="bg-[#2E2E8A] text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-md shadow-indigo-900/20">2</span>
              Calcul à t = τ
            </h4>
            <p className="text-slate-600 mb-3 text-sm pl-11">On remplace t par τ dans la loi de décroissance :</p>
            <div className="space-y-3 text-center text-slate-800">
              <div className="opacity-60 text-sm"><Latex formula="N(t) = N_0 \cdot e^{-\lambda t}" /></div>
              <div><Latex formula="N(\tau) = N_0 \cdot e^{-\lambda \cdot \frac{1}{\lambda}}" /></div>
              <div className="font-bold text-[#2E2E8A]"><Latex formula="N(\tau) = N_0 \cdot e^{-1}" /></div>
            </div>
          </div>

          <div className="bg-[#F4D35E]/10 p-5 rounded-2xl border border-[#F4D35E]/30 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-[#F4D35E]/20 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            <h4 className="font-bold text-[#b4860b] mb-3 flex items-center gap-3 relative z-10">
              <span className="bg-[#F4D35E] text-[#2E2E8A] w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm">3</span>
              Résultat
            </h4>
            <p className="text-[#856404] mb-3 text-sm pl-11">Comme <Latex formula="e^{-1} \approx 0,37" /> :</p>
            <div className="text-center py-2 font-bold text-xl text-[#2E2E8A]">
              <Latex formula="N(\tau) \approx 0,37 \cdot N_0" />
            </div>
            <p className="text-xs text-[#856404] mt-3 italic border-t border-[#F4D35E]/20 pt-3 pl-11">
              Interprétation : Au bout de τ, il reste 37% des noyaux initiaux.
            </p>
          </div>
        </div>

        {/* Graphical Visualization */}
        <div className="flex flex-col justify-center">
          <div className="relative border border-slate-200 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200/50">
            <h4 className="text-xs font-bold text-slate-400 mb-6 text-center uppercase tracking-widest">Interprétation Graphique</h4>
            
            <svg viewBox="-20 -20 340 250" className="w-full h-auto overflow-visible select-none">
              <defs>
                <marker id="arrow-axis" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto">
                  <path d="M0,0 L0,8 L12,4 z" fill="#64748b" />
                </marker>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#f1f5f9" strokeWidth="1"/>
                </pattern>
              </defs>

              {/* Grid Background */}
              <rect width="300" height="200" fill="url(#grid)" />
              
              {/* Axes */}
              <line x1="0" y1="200" x2="315" y2="200" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow-axis)" strokeLinecap="round" />
              <line x1="0" y1="200" x2="0" y2="-15" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrow-axis)" strokeLinecap="round" />
              
              {/* Axis Labels */}
              <text x="320" y="215" className="text-sm fill-slate-500 font-bold font-sans">t (s)</text>
              <text x="-15" y="-10" className="text-sm fill-slate-500 font-bold font-sans">N(t)</text>
              
              {/* Y-Axis Values */}
              <text x="-10" y="45" className="text-xs fill-[#2E2E8A] font-bold text-right font-sans">N₀</text>
              <line x1="-5" y1="40" x2="5" y2="40" stroke="#2E2E8A" strokeWidth="2" />
              
              <text x="-10" y="145" className="text-xs fill-[#F4D35E] font-bold text-right shadow-sm font-sans [text-shadow:0_1px_2px_rgba(0,0,0,0.1)]">0,37N₀</text>
              <line x1="-5" y1="140.8" x2="5" y2="140.8" stroke="#F4D35E" strokeWidth="2" />

              {/* Exponential Curve */}
              <path 
                d="M 0 40 C 30 140, 90 190, 300 198"
                fill="none"
                stroke="#2E2E8A" 
                strokeWidth="3"
                filter="url(#glow)"
              />

              {/* Tangent Line at t=0 */}
              <line x1="0" y1="40" x2="60" y2="200" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,4" />
              
              {/* Projection of tau */}
              <line x1="60" y1="200" x2="60" y2="140.8" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,3" />
              <line x1="0" y1="140.8" x2="60" y2="140.8" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,3" />
              
              {/* Tau Label on Axis */}
              <text x="60" y="220" textAnchor="middle" className="text-sm font-bold fill-[#ef4444] font-sans">τ</text>
              
              {/* Intersection Point */}
              <circle cx="60" cy="140.8" r="5" fill="#F4D35E" stroke="white" strokeWidth="2" />

              {/* Tangent Annotation */}
              <text x="75" y="100" className="text-[10px] fill-[#ef4444] font-medium" transform="rotate(-20 75 100)">Tangente à t=0</text>
            </svg>
            
            <div className="mt-4 bg-yellow-50 text-yellow-800 text-xs p-3 rounded-xl border border-yellow-200 flex gap-2 items-start">
              <span className="text-lg">💡</span>
              <p>
                <strong>Astuce pratique :</strong> La tangente à l'origine coupe l'axe des temps exactement à l'instant <span className="font-bold">t = τ</span>. C'est la méthode graphique la plus rapide !
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
