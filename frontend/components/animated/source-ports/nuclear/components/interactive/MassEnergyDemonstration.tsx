/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';

import React from 'react';
import { Calculator, ArrowRight, Zap } from 'lucide-react';
import { Latex } from '@/components/animated/shared/Latex';

export const MassEnergyDemonstration: React.FC = () => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 my-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-yellow-100 text-yellow-700 rounded-lg">
          <Calculator size={24} />
        </div>
        <h3 className="text-xl font-bold text-slate-800">Démonstration : Équivalence Masse-Énergie (1u)</h3>
      </div>

      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 font-mono text-sm md:text-base space-y-6 overflow-x-auto">
        
        {/* Step 1: Formula */}
        <div className="border-b border-slate-200 pb-4">
          <p className="text-slate-500 mb-2">1. Formule d'Einstein</p>
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-lg">
            <Latex formula={String.raw`E = m \cdot c^2`} />
          </div>
        </div>

        {/* Step 2: Substitution */}
        <div className="border-b border-slate-200 pb-4">
          <p className="text-slate-500 mb-2">2. Application pour m = 1u</p>
          <div className="space-y-2">
            <p>On sait que : <span className="text-slate-800 font-bold"><Latex formula={String.raw`1\text{ u} = 1,66054 \times 10^{-27} \text{ kg}`} /></span></p>
            <p>Et : <span className="text-slate-800 font-bold"><Latex formula={String.raw`c = 2,9979 \times 10^8 \text{ m.s}^{-1}`} /></span></p>
            <div className="mt-3 text-slate-700">
              <Latex formula={String.raw`E = (1,66054 \times 10^{-27}) \times (2,9979 \times 10^8)^2`} />
            </div>
          </div>
        </div>

        {/* Step 3: Calculation in Joules */}
        <div className="border-b border-slate-200 pb-4">
          <p className="text-slate-500 mb-2">3. Résultat en Joules (J)</p>
          <div className="flex items-center gap-2">
            <ArrowRight className="text-slate-400" size={16} />
            <span className="font-bold text-slate-800">
              <Latex formula={String.raw`E \approx 1,4924 \times 10^{-10} \text{ J}`} />
            </span>
          </div>
        </div>

        {/* Step 4: Conversion to MeV */}
        <div>
          <p className="text-slate-500 mb-2">4. Conversion en MeV</p>
          <p className="mb-2 text-xs text-slate-400">Rappel : <Latex formula={String.raw`1 \text{ eV} = 1,602 \times 10^{-19} \text{ J}`} /> donc <Latex formula={String.raw`1 \text{ MeV} = 1,602 \times 10^{-13} \text{ J}`} /></p>
          
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="text-slate-700">
                <Latex formula={String.raw`E (\text{MeV}) = \frac{1,4924 \times 10^{-10}}{1,60218 \times 10^{-13}}`} />
            </div>
            <ArrowRight className="hidden md:block text-slate-400" />
            <div className="bg-yellow-50 text-yellow-800 px-4 py-2 rounded-lg border border-yellow-200 font-bold text-lg shadow-sm flex items-center gap-2">
              <Zap size={18} className="fill-yellow-500 text-yellow-600"/>
              <Latex formula={String.raw`E \approx 931,5 \text{ MeV}`} />
            </div>
          </div>
        </div>

      </div>

      <div className="mt-4 text-center">
        <p className="text-slate-600">Conclusion importante pour les exercices :</p>
        <div className="inline-block mt-2 bg-indigo-600 text-white px-6 py-2 rounded-full font-bold shadow-md">
            <Latex formula={String.raw`1 \text{ u} = 931,5 \text{ MeV}/c^2`} />
        </div>
      </div>
    </div>
  );
};
