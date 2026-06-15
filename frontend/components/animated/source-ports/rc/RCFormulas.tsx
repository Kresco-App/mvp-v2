
'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Activity, Battery, Layers } from 'lucide-react';

// Helper for mathematical fractions
const MathFrac = ({ n, d }: { n: React.ReactNode, d: React.ReactNode }) => (
  <span className="mx-1 inline-flex flex-col items-center align-middle">
    <span className="border-b border-slate-800 w-full text-center leading-tight pb-[1px] mb-[1px]">{n}</span>
    <span className="w-full text-center leading-tight">{d}</span>
  </span>
);

// Helper for math variables (serif + italic)
const M = ({ children }: { children: React.ReactNode }) => (
  <span className="font-serif italic">{children}</span>
);

interface FormulaCardProps {
  title: string;
  formula: React.ReactNode;
  variables: { symbol: React.ReactNode; definition: string; unit?: string }[];
  icon: React.ReactNode;
  color: string;
  iconColor: string;
}

const FormulaCard: React.FC<FormulaCardProps> = ({ title, formula, variables, icon, color, iconColor }) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col"
  >
    <div className={`p-3 ${color} flex items-center gap-2 border-b border-slate-100`}>
      <div className={`p-1.5 bg-white rounded-lg ${iconColor}`}>
        {icon}
      </div>
      <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">{title}</h4>
    </div>
    
    <div className="p-6 flex flex-col items-center justify-center bg-slate-50/50 border-b border-slate-100 min-h-[100px]">
      <div className="text-xl md:text-2xl font-serif text-slate-800 font-bold text-center leading-relaxed flex items-center justify-center flex-wrap">
        {formula}
      </div>
    </div>

    <div className="p-4 bg-white text-sm text-slate-600 flex-1">
      <ul className="space-y-2">
        {variables.map((v, i) => (
          <li key={i} className="flex justify-between items-baseline border-b border-slate-50 last:border-0 pb-1 last:pb-0">
            <span className="font-medium text-slate-800 mr-2 font-serif italic">{v.symbol} :</span>
            <span className="text-right text-slate-500 text-xs">
              {v.definition} {v.unit && <span className="bg-slate-100 px-1.5 py-0.5 rounded ml-1 font-mono text-slate-600 not-italic">{v.unit}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  </motion.div>
);

export const RCFormulas: React.FC = () => {
  const formulas = [
    {
      title: "Charge & Tension",
      icon: <Battery size={16} />,
      color: "bg-blue-50",
      iconColor: "text-blue-600",
      formula: (
        <>
          <M>q</M> = <M>C</M> · <M>u<sub>C</sub></M>
        </>
      ),
      variables: [
        { symbol: "q", definition: "Charge", unit: "C" },
        { symbol: "C", definition: "Capacité", unit: "F" },
        { symbol: <>u<sub>C</sub></>, definition: "Tension", unit: "V" },
      ]
    },
    {
      title: "Intensité",
      icon: <Activity size={16} />,
      color: "bg-orange-50",
      iconColor: "text-orange-600",
      formula: (
        <>
          <M>i</M> = <MathFrac n={<M>dq</M>} d={<M>dt</M>} /> = <M>C</M> · <MathFrac n={<M>du<sub>C</sub></M>} d={<M>dt</M>} />
        </>
      ),
      variables: [
        { symbol: "i", definition: "Intensité", unit: "A" },
        { symbol: "C", definition: "Capacité", unit: "F" },
        { symbol: "du/dt", definition: "Dérivée tension", unit: "V/s" },
      ]
    },
    {
      title: "Constante de Temps",
      icon: <Clock size={16} />,
      color: "bg-emerald-50",
      iconColor: "text-emerald-600",
      formula: (
        <>
          <M>τ</M> = <M>R</M> · <M>C</M>
        </>
      ),
      variables: [
        { symbol: "τ", definition: "Constante de temps", unit: "s" },
        { symbol: "R", definition: "Résistance", unit: "Ω" },
        { symbol: "C", definition: "Capacité", unit: "F" },
      ]
    },
    {
      title: "Loi de Charge",
      icon: <Zap size={16} />,
      color: "bg-cyan-50",
      iconColor: "text-cyan-600",
      formula: (
        <>
          <M>u<sub>C</sub></M>(t) = <M>E</M> · (1 - <M>e</M><sup>-<M>t</M>/<M>τ</M></sup>)
        </>
      ),
      variables: [
        { symbol: "E", definition: "Tension échelon", unit: "V" },
        { symbol: "τ", definition: "Constante RC", unit: "s" },
        { symbol: "t", definition: "Temps", unit: "s" },
      ]
    },
     {
      title: "Loi de Décharge",
      icon: <Zap size={16} />,
      color: "bg-indigo-50",
      iconColor: "text-indigo-600",
      formula: (
        <>
           <M>u<sub>C</sub></M>(t) = <M>E</M> · <M>e</M><sup>-<M>t</M>/<M>τ</M></sup>
        </>
      ),
      variables: [
        { symbol: "E", definition: "Tension initiale", unit: "V" },
        { symbol: "τ", definition: "Constante RC", unit: "s" },
      ]
    },
    {
      title: "Énergie Stockée",
      icon: <Battery size={16} />,
      color: "bg-yellow-50",
      iconColor: "text-yellow-600",
      formula: (
        <>
          <M>ℰ</M> = <MathFrac n="1" d="2" /> <M>C</M> · <M>u<sub>C</sub></M>²
        </>
      ),
      variables: [
        { symbol: "ℰ", definition: "Énergie", unit: "J" },
        { symbol: "C", definition: "Capacité", unit: "F" },
        { symbol: <>u<sub>C</sub></>, definition: "Tension", unit: "V" },
      ]
    },
    {
      title: "Association Série",
      icon: <Layers size={16} />,
      color: "bg-slate-50",
      iconColor: "text-slate-600",
      formula: (
        <>
          <MathFrac n="1" d={<>C<sub>éq</sub></>} /> = <MathFrac n="1" d={<>C<sub>1</sub></>} /> + <MathFrac n="1" d={<>C<sub>2</sub></>} />
        </>
      ),
      variables: [
        { symbol: <>C<sub>éq</sub></>, definition: "Capacité équivalente", unit: "F" },
        { symbol: <>C<sub>n</sub></>, definition: "Capacité n", unit: "F" },
      ]
    },
    {
      title: "Association Parallèle",
      icon: <Layers size={16} />,
      color: "bg-slate-50",
      iconColor: "text-slate-600",
      formula: (
        <>
          <M>C<sub>éq</sub></M> = <M>C<sub>1</sub></M> + <M>C<sub>2</sub></M>
        </>
      ),
      variables: [
        { symbol: <>C<sub>éq</sub></>, definition: "Capacité équivalente", unit: "F" },
        { symbol: <>C<sub>n</sub></>, definition: "Capacité n", unit: "F" },
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
