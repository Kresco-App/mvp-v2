/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';


import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Scale, FlaskConical, Droplet, Calculator } from 'lucide-react';

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

export const ChimieFormulas: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const cardHover = shouldReduceMotion ? undefined : { y: -2 };

  return (
    <div className="grid md:grid-cols-2 gap-6 my-8">
      {/* Card 1: Eau et pH */}
      <motion.div whileHover={cardHover} transition={{ duration: 0.15, ease: "easeOut" }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-purple-500">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><Droplet size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Eau & pH</h4>
        </div>
        
        <FormulaItem 
          title="Autoprotolyse de l'eau"
          formula={<>2 H₂O<sub>(ℓ)</sub> ⇌ H₃O⁺<sub>(aq)</sub> + HO⁻<sub>(aq)</sub></>}
        />
        
        <FormulaItem 
          title="Produit Ionique de l'eau (Ke)"
          formula={<>Kₑ = [H₃O⁺] · [HO⁻]</>}
          units={["Sans unité", "Dépend de T", "À 25°C, Kₑ = 10⁻¹⁴"]}
        />

        <FormulaItem 
          title="pH d'une solution"
          formula={<>pH = -log[H₃O⁺]</>}
          units={["Sans unité", "[H₃O⁺] en mol/L"]}
        />
        
        <FormulaItem 
          title="Concentration [H₃O⁺]"
          formula={<>[H₃O⁺] = 10<sup>-pH</sup></>}
          units={["mol/L"]}
        />
      </motion.div>

      {/* Card 2: Acides, Bases et Constantes */}
      <motion.div whileHover={cardHover} transition={{ duration: 0.15, ease: "easeOut" }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-emerald-500">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><FlaskConical size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Acides & Bases</h4>
        </div>

        <FormulaItem 
          title="Réaction Acide/Eau"
          formula={<>HA + H₂O ⇌ A⁻ + H₃O⁺</>}
        />

        <FormulaItem 
          title="Constante d'acidité (Ka)"
          formula={<>Kₐ = ([A⁻] · [H₃O⁺]) / [HA]</>}
          units={["Sans unité", "Dépend de T"]}
        />

        <FormulaItem 
          title="pKa du couple Acide/Base"
          formula={<>pKₐ = -log(Kₐ)</>}
          units={["Sans unité", "pKₐ petit = acide fort"]}
        />
        
        <FormulaItem 
          title="Relation d'Henderson-Hasselbalch"
          formula={<>pH = pKₐ + log([A⁻]/[HA])</>}
          units={["Permet de déterminer l'espèce prédominante"]}
        />
      </motion.div>

      {/* Card 3: Réactions Générales */}
      <motion.div whileHover={cardHover} transition={{ duration: 0.15, ease: "easeOut" }} className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-amber-500 md:col-span-2">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-100 p-2 rounded-lg text-amber-600"><Calculator size={20} /></div>
          <h4 className="font-bold text-lg text-slate-800">Constante d'Équilibre</h4>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            <FormulaItem 
                title="Réaction Acide₁ + Base₂"
                formula={<>A₁H + A₂⁻ ⇌ A₁⁻ + A₂H</>}
            />
            <FormulaItem 
                title="Constante K de la réaction"
                formula={<>K = Kₐ₁ / Kₐ₂ = 10<sup>(pKₐ₂ - pKₐ₁)</sup></>}
                units={["K > 10⁴ : réaction quasi totale", "K < 10⁻⁴ : réaction quasi nulle", "Entre les deux : équilibre"]}
            />
        </div>
      </motion.div>
    </div>
  );
};
