/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React from 'react';
import { motion } from 'framer-motion';
import { Atom, Scale, Calculator, TrendingDown, Clock } from 'lucide-react';

const FormulaItem = ({ title, formula, units }: any) => (
  <div className="mb-6 last:mb-0">
    <div className="flex justify-between items-center mb-2">
      <h5 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{title}</h5>
    </div>
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-serif text-center text-xl md:text-2xl text-purple-900 font-bold shadow-inner overflow-x-auto whitespace-nowrap scrollbar-hide">
      {formula}
    </div>
    {units && (
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
        {units.map((u: string, i: number) => (
          <span key={i} className="bg-white border border-slate-100 px-2 py-1 rounded-md">{u}</span>
        ))}
      </div>
    )}
  </div>
);

export const RadioactivityFormulas: React.FC = () => {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 my-8">
      {/* Card 1: Lois de Décroissance */}
      <motion.div whileHover={{ y: -5 }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-indigo-500 md:col-span-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><TrendingDown size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Lois de Décroissance Radioactive</h4>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8">
            <FormulaItem 
            title="Loi de Décroissance"
            formula={<>N(t) = N₀ · e<sup>-λt</sup></>}
            units={["N(t) : noyaux restants", "N₀ : nombre initial", "λ : constante radioactive (s⁻¹ ou an⁻¹)"]}
            />
            <FormulaItem 
            title="Loi d'Activité"
            formula={<>A(t) = A₀ · e<sup>-λt</sup> = λ · N(t)</>}
            units={["A(t) : activité à t (Bq)", "A₀ : activité initiale (Bq)", "1 Bq = 1 désintégration/s"]}
            />
        </div>
      </motion.div>

      {/* Card 2: Temps Caractéristiques */}
      <motion.div whileHover={{ y: -5 }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-emerald-500">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><Clock size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Temps Caractéristiques</h4>
        </div>

        <FormulaItem 
          title="Demi-vie (t₁/₂)"
          formula={<>t₁/₂ = ln(2) / λ</>}
          units={["ln(2) ≈ 0.693"]}
        />

        <FormulaItem 
          title="Constante de temps (τ)"
          formula={<>τ = 1 / λ</>}
          units={["τ = t₁/₂ / ln(2)"]}
        />
      </motion.div>
      
      {/* Card 3: Conservation */}
      <motion.div whileHover={{ y: -5 }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-sky-500 md:col-span-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-sky-100 p-2 rounded-lg text-sky-600"><Atom size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Lois de Conservation (Soddy)</h4>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            <FormulaItem 
                title="Alpha (α) Decay"
                formula={<><sup>A</sup><sub>Z</sub>X &rarr; <sup>A-4</sup><sub>Z-2</sub>Y + <sup>4</sup><sub>2</sub>He</>}
            />
            <FormulaItem 
                title="Bêta Moins (β⁻) Decay"
                formula={<><sup>A</sup><sub>Z</sub>X &rarr; <sup>A</sup><sub>Z+1</sub>Y + <sup>0</sup><sub>-1</sub>e</>}
            />
            <FormulaItem 
                title="Bêta Plus (β⁺) Decay"
                formula={<><sup>A</sup><sub>Z</sub>X &rarr; <sup>A</sup><sub>Z-1</sub>Y + <sup>0</sup><sub>+1</sub>e</>}
            />
        </div>
      </motion.div>
    </div>
  );
};
