
'use client';

/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Calculator, Clock, Atom, Activity, Scale, Ruler } from 'lucide-react';

interface FormulaCardProps {
  title: string;
  formula: React.ReactNode;
  variables: { symbol: string; definition: string; unit?: string }[];
  icon: React.ReactNode;
  color: string;
  iconColor: string;
}

const FormulaCard: React.FC<FormulaCardProps> = ({ title, formula, variables, icon, color, iconColor }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
  <motion.div 
    whileHover={shouldReduceMotion ? undefined : { y: -2 }}
    transition={{ duration: 0.15, ease: "easeOut" }}
    className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col"
  >
    <div className={`p-3 ${color} flex items-center gap-2 border-b border-slate-100`}>
      <div className={`p-1.5 bg-white rounded-lg ${iconColor}`}>
        {icon}
      </div>
      <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">{title}</h4>
    </div>
    
    <div className="p-6 flex flex-col items-center justify-center bg-slate-50/50 border-b border-slate-100 min-h-[100px]">
      <div className="text-2xl md:text-3xl font-serif text-slate-800 font-bold text-center leading-relaxed">
        {formula}
      </div>
    </div>

    <div className="p-4 bg-white text-sm text-slate-600 flex-1">
      <ul className="space-y-2">
        {variables.map((v, i) => (
          <li key={i} className="flex justify-between items-baseline border-b border-slate-50 last:border-0 pb-1 last:pb-0">
            <span className="font-medium text-slate-800 mr-2">{v.symbol} :</span>
            <span className="text-right text-slate-500 text-xs">
              {v.definition} {v.unit && <span className="bg-slate-100 px-1.5 py-0.5 rounded ml-1 font-mono text-slate-600">{v.unit}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  </motion.div>
  );
};

export const FormulaSummary: React.FC = () => {
  const formulas = [
    {
      title: "Composition du Noyau",
      icon: <Atom size={16} />,
      color: "bg-purple-50",
      iconColor: "text-purple-600",
      formula: (
        <>
          N = A - Z
        </>
      ),
      variables: [
        { symbol: "A", definition: "Nombre de masse", unit: "" },
        { symbol: "Z", definition: "Numéro atomique", unit: "" },
        { symbol: "N", definition: "Nombre de neutrons", unit: "" },
      ]
    },
    {
      title: "Rayon du Noyau",
      icon: <Ruler size={16} />,
      color: "bg-blue-50",
      iconColor: "text-blue-600",
      formula: (
        <>
          R = r₀ · A<sup>1/3</sup>
        </>
      ),
      variables: [
        { symbol: "R", definition: "Rayon nucléaire", unit: "m" },
        { symbol: "r₀", definition: "Constante (1,4 fm)", unit: "m" },
        { symbol: "A", definition: "Nombre de masse", unit: "" },
      ]
    },
    {
      title: "Quantité de Matière",
      icon: <Scale size={16} />,
      color: "bg-amber-50",
      iconColor: "text-amber-600",
      formula: (
        <>
          N = <span className="text-sm align-middle">m</span>/<span className="text-sm align-middle">M</span> · N<sub>A</sub>
        </>
      ),
      variables: [
        { symbol: "N", definition: "Nombre de noyaux", unit: "" },
        { symbol: "m", definition: "Masse échantillon", unit: "g" },
        { symbol: "M", definition: "Masse molaire", unit: "g/mol" },
        { symbol: "NA", definition: "Avogadro", unit: "mol⁻¹" },
      ]
    },
    {
      title: "Loi de Décroissance",
      icon: <Activity size={16} />,
      color: "bg-yellow-50",
      iconColor: "text-yellow-600",
      formula: (
        <>
          N(t) = N₀e<sup>-λt</sup>
        </>
      ),
      variables: [
        { symbol: "N(t)", definition: "Noyaux restants", unit: "" },
        { symbol: "N₀", definition: "Nombre initial", unit: "" },
        { symbol: "λ", definition: "Cste radioactive", unit: "s⁻¹" },
      ]
    },
     {
      title: "Loi d'Activité (Temps)",
      icon: <Activity size={16} />,
      color: "bg-rose-50",
      iconColor: "text-rose-600",
      formula: (
        <>
          a(t) = a₀e<sup>-λt</sup>
        </>
      ),
      variables: [
        { symbol: "a(t)", definition: "Activité à t", unit: "Bq" },
        { symbol: "a₀", definition: "Activité initiale", unit: "Bq" },
        { symbol: "t", definition: "Temps écoulé", unit: "s" },
      ]
    },
    {
      title: "Activité Instantanée",
      icon: <Activity size={16} />,
      color: "bg-purple-50",
      iconColor: "text-purple-600",
      formula: (
        <>
          a(t) = λ · N(t)
        </>
      ),
      variables: [
        { symbol: "a(t)", definition: "Activité", unit: "Bq" },
        { symbol: "λ", definition: "Cste radioactive", unit: "s⁻¹" },
        { symbol: "N(t)", definition: "Nombre de noyaux", unit: "" },
      ]
    },
    {
      title: "Demi-vie",
      icon: <Clock size={16} />,
      color: "bg-emerald-50",
      iconColor: "text-emerald-600",
      formula: (
        <>
          t<sub>1/2</sub> = <span className="mx-1">ln(2)</span> / λ
        </>
      ),
      variables: [
        { symbol: "t1/2", definition: "Demi-vie", unit: "s" },
        { symbol: "ln(2)", definition: "Logarithme", unit: "≈ 0.7" },
        { symbol: "λ", definition: "Cste radioactive", unit: "s⁻¹" },
      ]
    },
    {
      title: "Constante de Temps",
      icon: <Clock size={16} />,
      color: "bg-purple-50",
      iconColor: "text-purple-600",
      formula: (
        <>
          τ = 1 / λ
        </>
      ),
      variables: [
        { symbol: "τ", definition: "Constante de temps", unit: "s" },
        { symbol: "λ", definition: "Cste radioactive", unit: "s⁻¹" },
      ]
    },
    {
      title: "Relation t1/2 et τ",
      icon: <Calculator size={16} />,
      color: "bg-yellow-50",
      iconColor: "text-yellow-600",
      formula: (
        <>
          t<sub>1/2</sub> = τ · ln(2)
        </>
      ),
      variables: [
        { symbol: "t1/2", definition: "Demi-vie", unit: "s" },
        { symbol: "τ", definition: "Constante de temps", unit: "s" },
      ]
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 my-8">
      {formulas.map((f, i) => (
        <FormulaCard key={i} {...f} />
      ))}
    </div>
  );
};
