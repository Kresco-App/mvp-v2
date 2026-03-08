'use client'

import { useState } from 'react'

const MATH_GROUPS = [
  {
    label: 'Analyse',
    symbols: [
      { label: '\\sum', latex: '\\sum_{i=0}^{n}' },
      { label: '\\int', latex: '\\int_{a}^{b}' },
      { label: '\\lim', latex: '\\lim_{x \\to }' },
      { label: '\\frac', latex: '\\frac{}{}' },
      { label: '\\sqrt', latex: '\\sqrt{}' },
      { label: '\\infty', latex: '\\infty' },
      { label: "f'", latex: "f'(x)" },
      { label: 'dx', latex: '\\,dx' },
    ],
  },
  {
    label: 'Symboles',
    symbols: [
      { label: '\\rightarrow', latex: '\\rightarrow' },
      { label: '\\Rightarrow', latex: '\\Rightarrow' },
      { label: '\\Leftrightarrow', latex: '\\Leftrightarrow' },
      { label: '\\forall', latex: '\\forall' },
      { label: '\\exists', latex: '\\exists' },
      { label: '\\in', latex: '\\in' },
      { label: '\\notin', latex: '\\notin' },
      { label: '\\subset', latex: '\\subset' },
    ],
  },
  {
    label: 'Ensembles',
    symbols: [
      { label: '\\mathbb{R}', latex: '\\mathbb{R}' },
      { label: '\\mathbb{N}', latex: '\\mathbb{N}' },
      { label: '\\mathbb{Z}', latex: '\\mathbb{Z}' },
      { label: '\\mathbb{Q}', latex: '\\mathbb{Q}' },
      { label: '\\mathbb{C}', latex: '\\mathbb{C}' },
      { label: '\\emptyset', latex: '\\emptyset' },
      { label: '\\cup', latex: '\\cup' },
      { label: '\\cap', latex: '\\cap' },
    ],
  },
  {
    label: 'Geometrie',
    symbols: [
      { label: '\\vec', latex: '\\vec{}' },
      { label: '\\overrightarrow', latex: '\\overrightarrow{}' },
      { label: '\\perp', latex: '\\perp' },
      { label: '\\parallel', latex: '\\parallel' },
      { label: '\\angle', latex: '\\angle' },
      { label: '\\triangle', latex: '\\triangle' },
      { label: '\\pi', latex: '\\pi' },
      { label: '\\theta', latex: '\\theta' },
    ],
  },
  {
    label: 'Matrices',
    symbols: [
      { label: 'matrice', latex: '\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}' },
      { label: 'det', latex: '\\det' },
      { label: '\\cdot', latex: '\\cdot' },
      { label: '\\times', latex: '\\times' },
      { label: '\\leq', latex: '\\leq' },
      { label: '\\geq', latex: '\\geq' },
      { label: '\\neq', latex: '\\neq' },
      { label: '\\approx', latex: '\\approx' },
    ],
  },
]

interface Props {
  onInsert: (latex: string) => void
}

export default function MathToolbar({ onInsert }: Props) {
  const [activeGroup, setActiveGroup] = useState(0)

  return (
    <div className="border-b border-slate-800 bg-slate-900/50">
      {/* Group tabs */}
      <div className="flex gap-0.5 px-3 pt-2">
        {MATH_GROUPS.map((group, i) => (
          <button
            key={group.label}
            onClick={() => setActiveGroup(i)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-t-lg transition ${
              i === activeGroup
                ? 'bg-slate-800 text-indigo-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {group.label}
          </button>
        ))}
      </div>
      {/* Symbols */}
      <div className="flex flex-wrap gap-1 px-3 py-2 bg-slate-800/40">
        {MATH_GROUPS[activeGroup].symbols.map((sym) => (
          <button
            key={sym.label}
            onClick={() => onInsert(sym.latex)}
            title={sym.latex}
            className="px-2.5 py-1.5 text-xs font-mono text-slate-300 bg-slate-800 hover:bg-indigo-600/30 hover:text-indigo-300 rounded-lg border border-slate-700 hover:border-indigo-500/40 transition"
          >
            {sym.label}
          </button>
        ))}
      </div>
    </div>
  )
}
