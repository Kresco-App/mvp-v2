/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Scale, Zap, Atom, Calculator } from 'lucide-react';

const FormulaItem = ({ title, formula, units }: any) => (
  <div className="mb-6 last:mb-0">
    <div className="flex justify-between items-center mb-2">
      <h5 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{title}</h5>
    </div>
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-serif text-center text-xl md:text-2xl text-indigo-900 font-bold shadow-inner">
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

export const NuclearFormulas: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const cardHover = shouldReduceMotion ? undefined : { y: -2 };

  return (
    <div className="grid md:grid-cols-2 gap-6 my-8">
      {/* Card 1: Masse et Énergie */}
      <motion.div whileHover={cardHover} transition={{ duration: 0.15, ease: "easeOut" }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-indigo-500">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><Scale size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Masse & Énergie</h4>
        </div>
        
        <FormulaItem 
          title="Équivalence Masse-Énergie (Einstein)"
          formula={<>E = m · c²</>}
          units={["E : Joules (J)", "m : Masse (kg)", "c : Célérité (m.s⁻¹)"]}
        />
        
        <FormulaItem 
          title="Défaut de Masse"
          formula={<>Δm = [Z·mₚ + (A-Z)·mₙ] - m<sub>noyau</sub></>}
          units={["Δm > 0", "mₚ : masse proton", "mₙ : masse neutron"]}
        />

        <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 mt-4 text-center">
            <span className="block text-xs font-bold text-orange-800 uppercase mb-1">Conversion Utile</span>
            <span className="font-serif font-bold text-orange-900">1 u ↔ 931,5 MeV/c²</span>
        </div>
      </motion.div>

      {/* Card 2: Stabilité et Réactions */}
      <motion.div whileHover={cardHover} transition={{ duration: 0.15, ease: "easeOut" }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-emerald-500">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><Zap size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Stabilité & Réactions</h4>
        </div>

        <FormulaItem 
          title="Énergie de Liaison"
          formula={<>E<sub>ℓ</sub> = Δm · c²</>}
          units={["Eℓ : MeV ou J"]}
        />

        <FormulaItem 
          title="Énergie de Liaison par Nucléon"
          formula={<>ξ = E<sub>ℓ</sub> / A</>}
          units={["MeV / nucléon", "Plus ξ est grand, plus le noyau est stable"]}
        />

        <FormulaItem 
          title="Bilan Énergétique (Réaction)"
          formula={<>ΔE = (m<sub>réactifs</sub> - m<sub>produits</sub>) · c²</>}
          units={["Si Δm > 0 (perte de masse) → Énergie libérée"]}
        />
      </motion.div>

      {/* Card 3: Loi de Décroissance */}
      <motion.div whileHover={cardHover} transition={{ duration: 0.15, ease: "easeOut" }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-purple-500 md:col-span-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><Calculator size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Loi de Décroissance Radioactive</h4>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
            <FormulaItem 
                title="Population des Noyaux"
                formula={<>N(t) = N₀ · e<sup>-λt</sup></>}
            />
            <FormulaItem 
                title="Constante de Temps & Demi-vie"
                formula={<>t<sub>1/2</sub> = ln(2)/λ = τ·ln(2)</>}
            />
            <FormulaItem 
                title="Activité (Becquerel)"
                formula={<>a(t) = λ · N(t)</>}
                units={["1 Bq = 1 désintégration/s"]}
            />
        </div>
      </motion.div>
    </div>
  );
};
