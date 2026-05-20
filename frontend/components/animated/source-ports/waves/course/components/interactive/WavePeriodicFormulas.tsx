/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React from 'react';
import { FormulaCard } from '../FormulaCard';
import { Clock, Ruler, ArrowRight, Zap } from 'lucide-react';

export const WavePeriodicFormulas: React.FC = () => {
  // Note: We must double-escape backslashes for LaTeX in JS strings.
  // e.g. "\\frac" becomes \frac in the string, which KaTeX parses.

  const formulas = [
    {
      title: "Période et Fréquence",
      latex: "f = \\frac{1}{T}",
      description: "f en Hertz (Hz), T en secondes (s).",
      icon: <Clock className="text-blue-500" size={20} />
    },
    {
      title: "Relation Fondamentale",
      latex: "v = \\frac{\\lambda}{T} = \\lambda \\cdot f",
      description: "v en m.s⁻¹, λ en mètres (m). La célérité dépend du milieu.",
      icon: <Ruler className="text-purple-500" size={20} />
    },
    {
      title: "Condition de Diffraction",
      latex: "a \\leq \\lambda",
      description: "Diffraction marquée si l'ouverture a est de l'ordre de la longueur d'onde λ.",
      icon: <ArrowRight className="text-emerald-500" size={20} />
    },
    {
      title: "Immobilité Stroboscopique",
      latex: "N_e = \\frac{N}{k}",
      description: "Immobilité pour Nₑ = N, N/2, N/3... (k entier). La plus grande fréquence est N.",
      icon: <Zap className="text-yellow-500" size={20} />
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-8">
      {formulas.map((item, idx) => (
        <div key={idx} className="flex flex-col h-full">
          {/* We use the shared FormulaCard component for consistency */}
          <FormulaCard
            title={item.title}
            formula={item.latex}
            description={item.description}
            icon={item.icon}
          />
        </div>
      ))}
    </div>
  );
};