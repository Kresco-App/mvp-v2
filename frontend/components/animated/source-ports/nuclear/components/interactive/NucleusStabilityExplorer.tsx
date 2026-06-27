'use client';

/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Info } from 'lucide-react';

const ELEMENTS = [
  { z: 1, symbol: 'H', name: 'Hydrogene' },
  { z: 2, symbol: 'He', name: 'Helium' },
  { z: 3, symbol: 'Li', name: 'Lithium' },
  { z: 4, symbol: 'Be', name: 'Beryllium' },
  { z: 5, symbol: 'B', name: 'Bore' },
  { z: 6, symbol: 'C', name: 'Carbone' },
  { z: 7, symbol: 'N', name: 'Azote' },
  { z: 8, symbol: 'O', name: 'Oxygene' },
  { z: 9, symbol: 'F', name: 'Fluor' },
  { z: 10, symbol: 'Ne', name: 'Neon' },
  { z: 11, symbol: 'Na', name: 'Sodium' },
  { z: 12, symbol: 'Mg', name: 'Magnesium' },
  { z: 13, symbol: 'Al', name: 'Aluminium' },
  { z: 14, symbol: 'Si', name: 'Silicium' },
  { z: 15, symbol: 'P', name: 'Phosphore' },
  { z: 16, symbol: 'S', name: 'Soufre' },
  { z: 17, symbol: 'Cl', name: 'Chlore' },
  { z: 18, symbol: 'Ar', name: 'Argon' },
  { z: 19, symbol: 'K', name: 'Potassium' },
  { z: 20, symbol: 'Ca', name: 'Calcium' },
  { z: 21, symbol: 'Sc', name: 'Scandium' },
  { z: 22, symbol: 'Ti', name: 'Titane' },
  { z: 23, symbol: 'V', name: 'Vanadium' },
  { z: 24, symbol: 'Cr', name: 'Chrome' },
  { z: 25, symbol: 'Mn', name: 'Manganese' },
  { z: 26, symbol: 'Fe', name: 'Fer' },
  { z: 27, symbol: 'Co', name: 'Cobalt' },
  { z: 28, symbol: 'Ni', name: 'Nickel' },
  { z: 29, symbol: 'Cu', name: 'Cuivre' },
  { z: 30, symbol: 'Zn', name: 'Zinc' },
  { z: 31, symbol: 'Ga', name: 'Gallium' },
  { z: 32, symbol: 'Ge', name: 'Germanium' },
  { z: 33, symbol: 'As', name: 'Arsenic' },
  { z: 34, symbol: 'Se', name: 'Selenium' },
  { z: 35, symbol: 'Br', name: 'Brome' },
  { z: 36, symbol: 'Kr', name: 'Krypton' },
  { z: 37, symbol: 'Rb', name: 'Rubidium' },
  { z: 38, symbol: 'Sr', name: 'Strontium' },
  { z: 39, symbol: 'Y', name: 'Yttrium' },
  { z: 40, symbol: 'Zr', name: 'Zirconium' },
  { z: 41, symbol: 'Nb', name: 'Niobium' },
  { z: 42, symbol: 'Mo', name: 'Molybdene' },
  { z: 43, symbol: 'Tc', name: 'Technetium' },
  { z: 44, symbol: 'Ru', name: 'Ruthenium' },
  { z: 45, symbol: 'Rh', name: 'Rhodium' },
  { z: 46, symbol: 'Pd', name: 'Palladium' },
  { z: 47, symbol: 'Ag', name: 'Argent' },
  { z: 48, symbol: 'Cd', name: 'Cadmium' },
  { z: 49, symbol: 'In', name: 'Indium' },
  { z: 50, symbol: 'Sn', name: 'Etain' },
  { z: 51, symbol: 'Sb', name: 'Antimoine' },
  { z: 52, symbol: 'Te', name: 'Tellure' },
  { z: 53, symbol: 'I', name: 'Iode' },
  { z: 54, symbol: 'Xe', name: 'Xenon' },
  { z: 55, symbol: 'Cs', name: 'Cesium' },
  { z: 56, symbol: 'Ba', name: 'Baryum' },
  { z: 57, symbol: 'La', name: 'Lanthane' },
  { z: 58, symbol: 'Ce', name: 'Cerium' },
  { z: 59, symbol: 'Pr', name: 'Praseodyme' },
  { z: 60, symbol: 'Nd', name: 'Neodyme' },
  { z: 61, symbol: 'Pm', name: 'Promethium' },
  { z: 62, symbol: 'Sm', name: 'Samarium' },
  { z: 63, symbol: 'Eu', name: 'Europium' },
  { z: 64, symbol: 'Gd', name: 'Gadolinium' },
  { z: 65, symbol: 'Tb', name: 'Terbium' },
  { z: 66, symbol: 'Dy', name: 'Dysprosium' },
  { z: 67, symbol: 'Ho', name: 'Holmium' },
  { z: 68, symbol: 'Er', name: 'Erbium' },
  { z: 69, symbol: 'Tm', name: 'Thulium' },
  { z: 70, symbol: 'Yb', name: 'Ytterbium' },
  { z: 71, symbol: 'Lu', name: 'Lutetium' },
  { z: 72, symbol: 'Hf', name: 'Hafnium' },
  { z: 73, symbol: 'Ta', name: 'Tantale' },
  { z: 74, symbol: 'W', name: 'Tungstene' },
  { z: 75, symbol: 'Re', name: 'Rhenium' },
  { z: 76, symbol: 'Os', name: 'Osmium' },
  { z: 77, symbol: 'Ir', name: 'Iridium' },
  { z: 78, symbol: 'Pt', name: 'Platine' },
  { z: 79, symbol: 'Au', name: 'Or' },
  { z: 80, symbol: 'Hg', name: 'Mercure' },
  { z: 81, symbol: 'Tl', name: 'Thallium' },
  { z: 82, symbol: 'Pb', name: 'Plomb' },
  { z: 83, symbol: 'Bi', name: 'Bismuth' },
  { z: 84, symbol: 'Po', name: 'Polonium' },
  { z: 85, symbol: 'At', name: 'Astate' },
  { z: 86, symbol: 'Rn', name: 'Radon' },
  { z: 87, symbol: 'Fr', name: 'Francium' },
  { z: 88, symbol: 'Ra', name: 'Radium' },
  { z: 89, symbol: 'Ac', name: 'Actinium' },
  { z: 90, symbol: 'Th', name: 'Thorium' },
  { z: 91, symbol: 'Pa', name: 'Protactinium' },
  { z: 92, symbol: 'U', name: 'Uranium' },
  { z: 93, symbol: 'Np', name: 'Neptunium' },
  { z: 94, symbol: 'Pu', name: 'Plutonium' },
  { z: 95, symbol: 'Am', name: 'Americium' },
  { z: 96, symbol: 'Cm', name: 'Curium' },
];

const MAX_Z = 96;
const MAX_N = 160;
const MAX_DRAWN_PARTICLES = 34;
const stableNeutronsFor = (z: number) => Math.round(z * (1 + 0.006 * z));
const plotX = (z: number) => 58 + (z / 100) * 864;
const plotY = (n: number) => 278 - (n / MAX_N) * 236;
const smoothEase = [0.22, 1, 0.36, 1] as const;

export const NucleusStabilityExplorer: React.FC = () => {
  const [protons, setProtons] = useState(2);
  const [neutrons, setNeutrons] = useState(2);
  const shouldReduceMotion = useReducedMotion();

  const element = ELEMENTS.find((e) => e.z === protons) || { symbol: '?', name: `Z=${protons}` };
  const massNumber = protons + neutrons;
  const stableNeutrons = stableNeutronsFor(protons);
  const delta = neutrons - stableNeutrons;
  const isStable = Math.abs(delta) <= (protons < 20 ? 2 : 4);
  const drawnTotal = Math.min(massNumber || 1, MAX_DRAWN_PARTICLES);
  const drawnProtons = massNumber <= MAX_DRAWN_PARTICLES ? protons : Math.max(1, Math.round((protons / massNumber) * drawnTotal));
  const drawnNeutrons = Math.max(0, drawnTotal - drawnProtons);
  const numberTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: smoothEase };
  const graphTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: smoothEase };
  const currentPoint = { x: plotX(protons), y: plotY(neutrons) };

  const stabilityText = isStable
    ? 'Le point est proche de la vallee de stabilite pour ce nombre de protons.'
    : delta > 0
      ? 'Le noyau a trop de neutrons: une transformation beta- peut rapprocher le point de la stabilite.'
      : 'Le noyau a trop de protons: une transformation beta+ peut rapprocher le point de la stabilite.';

  const graphData = useMemo(() => {
    const points: Array<{ z: number; n: number; type: 'stable' | 'beta-minus' | 'beta-plus' | 'alpha' }> = [];

    for (let z = 2; z <= 96; z += 4) {
      const stableN = stableNeutronsFor(z);
      points.push({ z, n: stableN, type: 'stable' });
      if (z > 20) points.push({ z, n: stableN + 2, type: 'stable' });
      if (z > 50) points.push({ z, n: stableN + 4, type: 'stable' });

      for (let n = stableN + 8; n <= stableN + 28 + z / 6; n += 12) {
        points.push({ z, n, type: 'beta-minus' });
      }

      for (let n = stableN - 8; n >= z - 6 && n > 2; n -= 12) {
        points.push({ z, n, type: 'beta-plus' });
      }

      if (z >= 84) {
        for (let n = stableN - 8; n <= stableN + 24; n += 12) {
          points.push({ z, n, type: 'alpha' });
        }
      }
    }

    return points;
  }, []);

  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-lg border border-indigo-100 flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10 items-center">
        <div className="flex flex-col items-center w-full">
          <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-4">Vue du Noyau</h4>
          <div className="relative w-full max-w-[230px] aspect-square bg-indigo-50/50 rounded-full border-4 border-indigo-50 flex items-center justify-center overflow-hidden shadow-[inset_0_0_40px_rgba(99,102,241,0.1)]">
            <div className="relative w-32 h-32 flex flex-wrap justify-center items-center content-center">
              {Array.from({ length: drawnProtons }).map((_, i) => (
                <div
                  key={`p-${i}`}
                  className="w-6 h-6 rounded-full bg-rose-500 shadow-[0_2px_5px_rgba(244,63,94,0.4)] border-2 border-white flex items-center justify-center text-[8px] text-white font-black z-10 m-[-4px]"
                >
                  +
                </div>
              ))}
              {Array.from({ length: drawnNeutrons }).map((_, i) => (
                <div
                  key={`n-${i}`}
                  className="w-6 h-6 rounded-full bg-slate-600 shadow-[0_2px_5px_rgba(71,85,105,0.4)] border-2 border-white flex items-center justify-center text-[8px] text-white font-black m-[-4px]"
                />
              ))}
            </div>

            <div className="absolute inset-0 rounded-full border border-dashed border-indigo-200/30 scale-110 animate-[spin_20s_linear_infinite] motion-reduce:animate-none" />
            <div className="absolute inset-0 rounded-full border border-dashed border-indigo-200/30 scale-150 animate-[spin_25s_linear_infinite_reverse] motion-reduce:animate-none" />
          </div>

          <div className="mt-5 flex justify-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="font-bold text-slate-600">Proton (+e)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-600" />
              <span className="font-bold text-slate-600">Neutron (0)</span>
            </div>
          </div>
          {massNumber > MAX_DRAWN_PARTICLES && (
            <div className="mt-3 text-[10px] font-bold text-indigo-400">
              Visualisation compacte: <span className="tabular-nums">{massNumber}</span> nucleons au total
            </div>
          )}
        </div>

        <div className="w-full bg-slate-50 p-5 rounded-xl border border-slate-200">
          <div className="text-center mb-5">
            <div className="inline-flex items-baseline gap-1 font-serif font-bold text-slate-800">
              <div className="flex flex-col text-xs items-end leading-tight opacity-70 tabular-nums">
                <motion.span
                  key={`A-${massNumber}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={numberTransition}
                >
                  {massNumber}
                </motion.span>
                <motion.span
                  key={`Z-${protons}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={numberTransition}
                >
                  {protons}
                </motion.span>
              </div>
              <span className="text-5xl">{element.symbol}</span>
            </div>
            <div className="text-lg font-bold text-indigo-900 mt-2">{element.name}</div>

            <div className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none ${isStable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {isStable ? 'Noyau Stable' : 'Noyau Instable'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 transition-[border-color,box-shadow] duration-150 ease-out hover:border-rose-100 hover:shadow-[0_8px_20px_rgba(244,63,94,0.08)] motion-reduce:transition-none">
              <div className="flex justify-between mb-2 text-xs font-bold text-slate-500 uppercase">
                <span>Protons (Z)</span>
                <span className="tabular-nums">{protons}</span>
              </div>
              <input
                type="range"
                min="1"
                max={MAX_Z}
                value={protons}
                onChange={(e) => setProtons(parseInt(e.target.value))}
                className="w-full h-2 bg-rose-100 rounded-lg appearance-none cursor-pointer accent-rose-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200/70"
                aria-label="Protons"
              />
            </div>

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 transition-[border-color,box-shadow] duration-150 ease-out hover:border-slate-200 hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)] motion-reduce:transition-none">
              <div className="flex justify-between mb-2 text-xs font-bold text-slate-500 uppercase">
                <span>Neutrons (N)</span>
                <span className="tabular-nums">{neutrons}</span>
              </div>
              <input
                type="range"
                min="0"
                max={MAX_N}
                value={neutrons}
                onChange={(e) => setNeutrons(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200/80"
                aria-label="Neutrons"
              />
            </div>
          </div>

          <div className="mt-5 p-3 bg-indigo-50 rounded-lg text-xs text-indigo-800 flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p className="text-pretty">{stabilityText}</p>
          </div>
        </div>
      </div>

      <div className="w-full bg-slate-50 p-3 md:p-5 rounded-xl border border-slate-200">
        <div className="flex flex-col gap-1 text-center mb-3">
          <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Diagramme de Segre (N-Z)</h4>
          <p className="text-xs text-slate-500">Le point cyan montre exactement le noyau construit dans la vallee de stabilite.</p>
        </div>

        <div className="h-[240px] md:h-[285px] bg-white rounded-lg shadow-sm border border-slate-100 p-1">
          <svg viewBox="0 0 960 300" className="h-full w-full" role="img" aria-label="Diagramme de stabilite N-Z">
            {[0, 20, 40, 60, 80, 100].map((z) => (
              <g key={`x-${z}`}>
                <line x1={plotX(z)} y1="42" x2={plotX(z)} y2="278" stroke="#f1f5f9" strokeDasharray="4 4" />
                <text x={plotX(z)} y="294" textAnchor="middle" className="fill-slate-500 text-[11px]">{z}</text>
              </g>
            ))}
            {[0, 40, 80, 120, 160].map((n) => (
              <g key={`y-${n}`}>
                <line x1="58" y1={plotY(n)} x2="922" y2={plotY(n)} stroke="#f1f5f9" strokeDasharray="4 4" />
                <text x="48" y={plotY(n) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{n}</text>
              </g>
            ))}

            <line x1="58" y1="278" x2="922" y2="278" stroke="#64748b" strokeWidth="1.4" />
            <line x1="58" y1="278" x2="58" y2="42" stroke="#64748b" strokeWidth="1.4" />
            <line x1={plotX(0)} y1={plotY(0)} x2={plotX(100)} y2={plotY(100)} stroke="#94a3b8" strokeWidth="2" strokeDasharray="7 7" />
            <text x="490" y="295" textAnchor="middle" className="fill-slate-600 text-[12px] font-bold">Nombre de Protons (Z)</text>
            <text x="16" y="166" textAnchor="middle" transform="rotate(-90 16 166)" className="fill-slate-600 text-[12px] font-bold">Neutrons (N)</text>

            {graphData.map((point, index) => (
              <circle
                key={`${point.type}-${index}`}
                cx={plotX(point.z)}
                cy={plotY(point.n)}
                r={point.type === 'stable' ? 4.6 : 5.6}
                fill={
                  point.type === 'stable' ? '#0f172a' :
                  point.type === 'beta-minus' ? '#fda4af' :
                  point.type === 'beta-plus' ? '#6ee7b7' :
                  '#fcd34d'
                }
                opacity={point.type === 'stable' ? 1 : 0.64}
              />
            ))}

            <motion.circle
              initial={false}
              animate={{ cx: currentPoint.x, cy: currentPoint.y }}
              transition={graphTransition}
              r="15"
              fill="#06b6d4"
              opacity="0.18"
            />
            <motion.circle
              initial={false}
              animate={{ cx: currentPoint.x, cy: currentPoint.y }}
              transition={graphTransition}
              r="8"
              fill="#06b6d4"
              stroke="#ffffff"
              strokeWidth="3"
            />
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px] font-bold">
          <span className="px-2 py-1 rounded-full bg-slate-900 text-white">Vallee stable</span>
          <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-100">Exces neutrons</span>
          <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">Exces protons</span>
          <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100">Alpha lourds</span>
          <span className="px-2 py-1 rounded-full bg-slate-50 text-slate-500 border border-slate-200">N = Z</span>
          <span className="px-2 py-1 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-100">Noyau actuel</span>
        </div>
      </div>
    </div>
  );
};
