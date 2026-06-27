/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';


import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, RefreshCw, HelpCircle, Target, BarChart, Calculator, TrendingDown } from 'lucide-react';
import { DifficultyBadge, type ExerciseState } from '../../../../shared/DifficultyBadge';

// --- Exercise 1: Half-Life Calculation ---
const HalfLifeExercise = () => {
  const [lambdaInput, setLambdaInput] = useState('');
  const [status, setStatus] = useState<ExerciseState>('idle');

  const halfLife = 5730; // years for C-14
  const correctLambda = Math.log(2) / halfLife; // approx 1.21 x 10^-4 year^-1

  const checkAnswer = () => {
    const userLambda = parseFloat(lambdaInput.replace(',', '.'));
    // Allow a small margin of error for scientific notation input and calculation
    if (Math.abs(userLambda - correctLambda) < 1e-6) {
      setStatus('correct');
    } else {
      setStatus('incorrect');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
            <div className="flex items-center gap-3 mb-1">
                <h4 className="font-bold text-slate-800 text-lg">Exercice 1 : Constante Radioactive</h4>
                <DifficultyBadge level="Facile" />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <Target size={14} />
                <span>Objectif : Calculer la constante radioactive à partir de la demi-vie.</span>
            </div>
        </div>
      </div>
      
      <p className="text-sm text-slate-600 mb-6 bg-slate-50 p-4 rounded-lg">
        Le carbone 14 a une demi-vie (t<sub>1/2</sub>) de 5730 ans. Calculez sa constante radioactive (λ) en an<sup>-1</sup>.
      </p>

      <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 w-fit">
        <span className="text-sm font-bold text-slate-500">λ (an⁻¹) =</span>
        <input 
            type="number" 
            step="0.00001"
            className="w-32 rounded-lg border-2 border-slate-200 p-2 text-center text-lg font-bold tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100"
            placeholder="Ex: 0.000121"
            value={lambdaInput}
            onChange={e => setLambdaInput(e.target.value)}
        />
        <button type="button" onClick={checkAnswer} className="min-h-10 rounded-lg bg-indigo-600 px-6 py-2 font-bold text-white shadow-sm transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-indigo-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 motion-reduce:transition-none motion-reduce:active:scale-100">
            Vérifier
        </button>
      </div>

      {status === 'correct' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-emerald-100 p-1 rounded-full"><Check size={16} className="text-emerald-700" /></div>
            <div className="text-emerald-800 text-sm">
                <span className="font-bold block">Correct !</span>
                λ = ln(2) / t<sub>1/2</sub> = ln(2) / 5730 ≈ 1.21 × 10<sup>-4</sup> an<sup>-1</sup>.
            </div>
        </motion.div>
      )}
      
      {status === 'incorrect' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-rose-50 border border-rose-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-rose-100 p-1 rounded-full"><X size={16} className="text-rose-700" /></div>
            <div className="text-rose-800 text-sm">
                <span className="font-bold block">Incorrect</span>
                Rappelez-vous la formule λ = ln(2) / t<sub>1/2</sub>.
            </div>
        </motion.div>
      )}
    </div>
  );
};

// --- Exercise 2: Radioactive Dating ---
const DatingExercise = () => {
  const [ageInput, setAgeInput] = useState('');
  const [status, setStatus] = useState<ExerciseState>('idle');

  const tHalf = 5730; // years
  const lambda = Math.log(2) / tHalf;
  const A0 = 100; // arbitrary initial activity
  const At = 50; // measured activity
  
  // A(t) = A0 * exp(-lambda * t)
  // At / A0 = exp(-lambda * t)
  // ln(At / A0) = -lambda * t
  // t = -ln(At / A0) / lambda = ln(A0 / At) / lambda
  const correctAge = Math.log(A0 / At) / lambda; // should be exactly 5730 years for At=A0/2

  const checkAnswer = () => {
    const userAge = parseFloat(ageInput.replace(',', '.'));
    if (Math.abs(userAge - correctAge) < 10) { // Allow +/- 10 years margin
      setStatus('correct');
    } else {
      setStatus('incorrect');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
       <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
            <div className="flex items-center gap-3 mb-1">
                <h4 className="font-bold text-slate-800 text-lg">Exercice 2 : Datation au Carbone 14</h4>
                <DifficultyBadge level="Moyen" />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <Target size={14} />
                <span>Objectif : Déterminer l'âge d'un échantillon par datation.</span>
            </div>
        </div>
      </div>
      
      <p className="text-sm text-slate-600 mb-6 bg-slate-50 p-4 rounded-lg">
        Un archéologue découvre un échantillon de bois fossile. L'activité mesurée du Carbone 14 (A) est la moitié de celle d'un échantillon de bois frais (A₀). 
        Sachant que la demi-vie du Carbone 14 est de 5730 ans, déterminez l'âge de l'échantillon.
      </p>

      <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 w-fit">
        <span className="text-sm font-bold text-slate-500">Âge (ans) =</span>
        <input 
            type="number" 
            step="1"
            className="w-32 rounded-lg border-2 border-slate-200 p-2 text-center text-lg font-bold tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100"
            placeholder="?"
            value={ageInput}
            onChange={e => setAgeInput(e.target.value)}
        />
        <button type="button" onClick={checkAnswer} className="min-h-10 rounded-lg bg-indigo-600 px-6 py-2 font-bold text-white shadow-sm transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-indigo-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 motion-reduce:transition-none motion-reduce:active:scale-100">
            Vérifier
        </button>
      </div>

      {status === 'correct' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-emerald-100 p-1 rounded-full"><Check size={16} className="text-emerald-700" /></div>
            <div className="text-emerald-800 text-sm">
                <span className="font-bold block">Correct !</span>
                Lorsque l'activité est réduite de moitié, le temps écoulé correspond à une demi-vie. Donc l'âge est de 5730 ans.
            </div>
        </motion.div>
      )}
      
      {status === 'incorrect' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-rose-50 border border-rose-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-rose-100 p-1 rounded-full"><X size={16} className="text-rose-700" /></div>
            <div className="text-rose-800 text-sm">
                <span className="font-bold block">Incorrect</span>
                Utilisez la loi de décroissance radioactive et la définition de la demi-vie.
            </div>
        </motion.div>
      )}
    </div>
  );
};

// --- Exercise 3: Activity Calculation ---
const ActivityCalculationExercise = () => {
  const [activityInput, setActivityInput] = useState('');
  const [status, setStatus] = useState<ExerciseState>('idle');

  const N0 = 1e20; // initial nuclei
  const tHalf = 10; // seconds
  const t = 20; // seconds
  
  const lambda = Math.log(2) / tHalf;
  const Nt = N0 * Math.exp(-lambda * t);
  const correctActivity = lambda * Nt; // Bq

  const checkAnswer = () => {
    const userAnswer = parseFloat(activityInput.replace(',', '.'));
    if (Math.abs(userAnswer - correctActivity) < 1e12) { // Large margin for scientific notation
      setStatus('correct');
    } else {
      setStatus('incorrect');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
       <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
            <div className="flex items-center gap-3 mb-1">
                <h4 className="font-bold text-slate-800 text-lg">Exercice 3 : Calcul d'Activité</h4>
                <DifficultyBadge level="Difficile" />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <TrendingDown size={14} />
                <span>Objectif : Appliquer les lois de décroissance pour calculer l'activité.</span>
            </div>
        </div>
      </div>
      
      <p className="text-sm text-slate-600 mb-6 bg-slate-50 p-4 rounded-lg">
        Un échantillon contient initialement 1,0 × 10<sup>20</sup> noyaux radioactifs. Sa demi-vie est de 10 secondes.
        Calculez l'activité de l'échantillon après 20 secondes.
      </p>

      <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 w-fit">
        <span className="text-sm font-bold text-slate-500">Activité (Bq) =</span>
        <input 
            type="number" 
            step="1e12"
            className="w-32 rounded-lg border-2 border-slate-200 p-2 text-center text-lg font-bold tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100"
            placeholder="Ex: 6.93e18"
            value={activityInput}
            onChange={e => setActivityInput(e.target.value)}
        />
        <button type="button" onClick={checkAnswer} className="min-h-10 rounded-lg bg-indigo-600 px-6 py-2 font-bold text-white shadow-sm transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-indigo-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 motion-reduce:transition-none motion-reduce:active:scale-100">
            Vérifier
        </button>
      </div>

      {status === 'correct' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-emerald-100 p-1 rounded-full"><Check size={16} className="text-emerald-700" /></div>
            <div className="text-emerald-800 text-sm">
                <span className="font-bold block">Correct !</span>
                λ = ln(2) / 10 ≈ 0.0693 s<sup>-1</sup>.<br/>
                Après 20s (2 demi-vies), N(t) = N0 / 4 = 2.5 × 10<sup>19</sup>.<br/>
                A(t) = λN(t) ≈ 1.73 × 10<sup>18</sup> Bq.
            </div>
        </motion.div>
      )}
      
      {status === 'incorrect' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-rose-50 border border-rose-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-rose-100 p-1 rounded-full"><X size={16} className="text-rose-700" /></div>
            <div className="text-rose-800 text-sm">
                <span className="font-bold block">Incorrect</span>
                N'oubliez pas que A(t) = λN(t) et que N(t) diminue avec le temps.
            </div>
        </motion.div>
      )}
    </div>
  );
};


export const RadioactivityExercises: React.FC = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <HalfLifeExercise />
      <DatingExercise />
      <ActivityCalculationExercise />
    </div>
  );
};
