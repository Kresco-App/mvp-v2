/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Scale } from 'lucide-react';

export const MassEnergyScale: React.FC = () => {
  const [mass, setMass] = useState(1); // in mg

  // E = mc^2
  // m in kg = mass / 1,000,000
  // c = 3e8
  const energyJoules = (mass / 1e6) * Math.pow(2.998e8, 2);
  
  // Comparisons
  const tntEquivalentTonnes = energyJoules / 4.184e9;
  const householdYears = energyJoules / (3600 * 1000 * 3000); // Assume 3000 kWh/year avg household

  const formatScientific = (num: number) => {
    const str = num.toExponential(2);
    const [base, exponent] = str.split('e');
    // Remove + sign from positive exponents for cleaner look
    const cleanExponent = exponent.replace('+', '');
    return (
      <>
        {base} × 10<sup className="text-lg">{cleanExponent}</sup>
      </>
    );
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border-t-4 border-sky-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-sky-100 p-2 rounded-xl text-sky-600"><Scale size={24} /></div>
        <div>
            <h3 className="text-xl font-bold text-slate-900">Convertisseur Masse-Énergie</h3>
            <p className="text-sm text-slate-500">Selon E = mc², une petite masse contient une énergie colossale.</p>
        </div>
      </div>

      {/* Input Section */}
      <div className="mb-10">
        <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
            <span>Masse perdue (défaut de masse)</span>
            <span className="text-sky-600">{mass} mg</span>
        </div>
        <input 
            type="range" min="1" max="1000" step="1"
            value={mass}
            onChange={(e) => setMass(parseFloat(e.target.value))}
            className="w-full h-3 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />
        <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>1 mg (Grain de sable)</span>
            <span>1 g (Trombone)</span>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div 
            layout
            className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-xl text-white shadow-lg flex flex-col justify-between"
          >
              <div className="flex items-center gap-2 opacity-90 mb-2">
                  <Zap size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Énergie Libérée</span>
              </div>
              <div className="text-3xl md:text-4xl font-black font-mono tracking-tight">
                  {formatScientific(energyJoules)} <span className="text-lg">J</span>
              </div>
          </motion.div>

          <div className="space-y-4">
              {/* TNT Comparison */}
              <motion.div 
                layout
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center gap-4"
              >
                  <div className="text-2xl">🧨</div>
                  <div>
                      <div className="text-xl font-bold text-slate-800">{Math.round(tntEquivalentTonnes).toLocaleString()} <span className="text-sm font-normal text-slate-500">Tonnes de TNT</span></div>
                      <div className="text-xs text-slate-400">Puissance explosive équivalente</div>
                  </div>
              </motion.div>

              {/* Household Comparison */}
              <motion.div 
                layout
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center gap-4"
              >
                  <div className="text-2xl">🏠</div>
                  <div>
                      <div className="text-xl font-bold text-slate-800">{Math.round(householdYears).toLocaleString()} <span className="text-sm font-normal text-slate-500">Années</span></div>
                      <div className="text-xs text-slate-400">D'électricité pour une maison</div>
                  </div>
              </motion.div>
          </div>
      </div>
    </div>
  );
};