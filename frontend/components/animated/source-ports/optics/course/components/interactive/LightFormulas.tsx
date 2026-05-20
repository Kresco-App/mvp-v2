/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React from 'react';
import { FormulaCard } from '../FormulaCard';
import { Ruler, Triangle, Maximize, Spline, Sun, Blend } from 'lucide-react';

export const LightFormulas: React.FC = () => {
  const formulas = [
    {
      title: "Modèle Ondulatoire",
      latex: "\\lambda = c \\cdot T = \\frac{c}{\\nu}",
      description: "Relation fondamentale. c ≈ 3,00×10⁸ m/s (vide). λ en m, T en s, ν en Hz.",
      icon: <Spline className="text-violet-500" size={20} />
    },
    {
      title: "Indice de Réfraction",
      latex: "n = \\frac{c}{v} \\geq 1",
      description: "n caractérise le milieu. v est la vitesse de la lumière dans ce milieu (toujours ≤ c).",
      icon: <Ruler className="text-blue-500" size={20} />
    },
    {
      title: "Écart Angulaire (Diffraction)",
      latex: "\\theta = \\frac{\\lambda}{a}",
      description: "Pour une fente de largeur a. θ en radians (rad). Diffraction marquée si a est petit.",
      icon: <Maximize className="text-emerald-500" size={20} />
    },
    {
      title: "Largeur Tache Centrale",
      latex: "L = \\frac{2 \\lambda D}{a}",
      description: "Largeur de la tache sur l'écran situé à distance D. (Hypothèse tan θ ≈ θ).",
      icon: <Maximize className="text-emerald-600" size={20} />
    },
    {
      title: "Lois de Descartes",
      latex: "n_1 \\sin i_1 = n_2 \\sin i_2",
      description: "Conservation du produit n·sin(i) à la traversée d'un dioptre. Permet de calculer l'angle réfracté.",
      icon: <Triangle className="text-orange-500" size={20} />
    },
    {
      title: "Prisme : Angle au Sommet",
      latex: "A = r + r'",
      description: "A est l'angle du prisme; r et r' sont les angles de réfraction à l'intérieur du prisme.",
      icon: <Triangle className="text-red-500" size={20} />
    },
    {
      title: "Prisme : Déviation Totale",
      latex: "D = i + i' - A",
      description: "D est la déviation totale; i et i' sont les angles d'incidence et d'émergence.",
      icon: <Triangle className="text-purple-500" size={20} />
    },
    {
      title: "Angle Limite",
      latex: "\\sin i_L = \\frac{n_2}{n_1}",
      description: "Angle d'incidence à partir duquel il y a réflexion totale (n1 > n2).",
      icon: <Blend className="text-cyan-500" size={20} />
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
      {formulas.map((item, idx) => (
        <div key={idx} className="flex flex-col h-full">
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