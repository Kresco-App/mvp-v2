'use client';

/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
import React from 'react';
import { motion } from 'framer-motion';

interface DecayDiagramsProps {
  type: 'alpha' | 'beta-minus' | 'beta-plus';
}

export const DecayDiagrams: React.FC<DecayDiagramsProps> = ({ type }) => {
  const configs = {
    alpha: {
      title: "Diagramme (N, Z) - Radioactivité α",
      color: "#ec4899", // pink-500
      dx: -2,
      dy: -2,
      label: "α",
      parentLabel: "(Z, N)",
      daughterLabel: "(Z-2, N-2)",
      description: "Le noyau perd 2 protons et 2 neutrons."
    },
    'beta-minus': {
      title: "Diagramme (N, Z) - Radioactivité β⁻",
      color: "#3b82f6", // blue-500
      dx: 1,
      dy: -1,
      label: "β⁻",
      parentLabel: "(Z, N)",
      daughterLabel: "(Z+1, N-1)",
      description: "Un neutron devient un proton (N - 1, Z + 1)."
    },
    'beta-plus': {
      title: "Diagramme (N, Z) - Radioactivité β⁺",
      color: "#10b981", // emerald-500
      dx: -1,
      dy: 1,
      label: "β⁺",
      parentLabel: "(Z, N)",
      daughterLabel: "(Z-1, N+1)",
      description: "Un proton devient un neutron (N + 1, Z - 1)."
    }
  };

  const config = configs[type];

  // Grid setup
  const gridSize = 40;
  const originX = 50;
  const originY = 250;
  
  // Center parent somewhat centrally but leave room for movement
  const parentX = originX + 4 * gridSize; // Z position
  const parentY = originY - 4 * gridSize; // N position

  // Calculate daughter position
  const daughterX = parentX + config.dx * gridSize;
  const daughterY = parentY - config.dy * gridSize; // Y is inverted in SVG

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 my-8 flex flex-col items-center">
      <h4 className="text-lg font-bold text-slate-800 mb-2">{config.title}</h4>
      <p className="text-slate-500 text-sm mb-6">{config.description}</p>
      
      <svg width="350" height="300" className="overflow-visible">
        {/* Defs for arrowheads */}
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
          <marker id={`arrow-${type}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={config.color} />
          </marker>
        </defs>

        {/* Axes */}
        <line x1={originX} y1={originY} x2={originX + 250} y2={originY} stroke="#64748b" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <line x1={originX} y1={originY} x2={originX} y2={20} stroke="#64748b" strokeWidth="2" markerEnd="url(#arrowhead)" />
        
        {/* Axis Labels */}
        <text x={originX + 260} y={originY + 5} className="font-serif font-bold fill-slate-700">Z</text>
        <text x={originX - 20} y={20} className="font-serif font-bold fill-slate-700">N</text>

        {/* Dashed Lines for Parent */}
        <line x1={parentX} y1={parentY} x2={parentX} y2={originY} stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="5,5" />
        <line x1={parentX} y1={parentY} x2={originX} y2={parentY} stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="5,5" />

        {/* Dashed Lines for Daughter */}
        <line x1={daughterX} y1={daughterY} x2={daughterX} y2={originY} stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="5,5" />
        <line x1={daughterX} y1={daughterY} x2={originX} y2={daughterY} stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="5,5" />

        {/* Transition Vector */}
        <motion.line
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 2 }}
          x1={parentX} y1={parentY}
          x2={daughterX} y2={daughterY}
          stroke={config.color}
          strokeWidth="3"
          markerEnd={`url(#arrow-${type})`}
        />

        {/* Points */}
        <circle cx={parentX} cy={parentY} r="6" fill="#1e293b" />
        <circle cx={daughterX} cy={daughterY} r="6" fill={config.color} />

        {/* Point Labels */}
        <text x={parentX + 10} y={parentY - 10} className="font-bold fill-slate-800 text-sm">Père {config.parentLabel}</text>
        <text x={daughterX + 10} y={daughterY + 15} fill={config.color} className="font-bold text-sm">Fils</text>

        {/* Ticks Labels (Dynamic) */}
        {/* Z axis ticks */}
        <text x={parentX} y={originY + 20} textAnchor="middle" className="text-xs fill-slate-500">Z</text>
        <text x={daughterX} y={originY + 20} textAnchor="middle" className="text-xs fill-slate-500">
           {type === 'alpha' ? 'Z-2' : type === 'beta-minus' ? 'Z+1' : 'Z-1'}
        </text>

        {/* N axis ticks */}
        <text x={originX - 10} y={parentY + 5} textAnchor="end" className="text-xs fill-slate-500">N</text>
        <text x={originX - 10} y={daughterY + 5} textAnchor="end" className="text-xs fill-slate-500">
            {type === 'alpha' ? 'N-2' : type === 'beta-minus' ? 'N-1' : 'N+1'}
        </text>

      </svg>
    </div>
  );
};
