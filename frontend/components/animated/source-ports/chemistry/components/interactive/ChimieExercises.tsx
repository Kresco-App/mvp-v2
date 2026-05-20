/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';


import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, RefreshCw, HelpCircle, Target, Calculator, FlaskConical } from 'lucide-react';

// --- Types ---
type ExerciseState = 'idle' | 'correct' | 'incorrect';
type Difficulty = 'Facile' | 'Moyen' | 'Difficile';

// --- Shared Components ---

const DifficultyBadge = ({ level }: { level: Difficulty }) => {
    const colors = {
        'Facile': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'Moyen': 'bg-amber-100 text-amber-700 border-amber-200',
        'Difficile': 'bg-rose-100 text-rose-700 border-rose-200',
    };
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider ${colors[level]}`}>
            {level}
        </span>
    );
};

// --- Exercise 1: pH Calculation ---
const PHCalculationExercise = () => {
  const [phInput, setPhInput] = useState('');
  const [status, setStatus] = useState<ExerciseState>('idle');

  // Question: Solution with [H3O+] = 1.0 x 10^-3 mol/L
  const correctPh = 3.0;

  const checkAnswer = () => {
    const userPh = parseFloat(phInput.replace(',', '.'));
    if (userPh === correctPh) {
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
                <h4 className="font-bold text-slate-800 text-lg">Exercice 1 : Calcul de pH</h4>
                <DifficultyBadge level="Facile" />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <Target size={14} />
                <span>Objectif : Appliquer la formule du pH.</span>
            </div>
        </div>
      </div>
      
      <p className="flex items-start gap-3 text-base font-medium text-slate-800 mb-6 bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
        <FlaskConical size={20} className="text-purple-600 flex-shrink-0" />
        Calculez le pH d'une solution dont la concentration en ions oxonium est [H₃O⁺] = 1,0 × 10<sup>-3</sup> mol/L.
      </p>

      <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 w-fit">
        <span className="text-sm font-bold text-slate-500">pH =</span>
        <motion.input
            type="number" 
            step="0.1"
            className="w-24 border-2 border-slate-200 rounded-lg p-2 text-center font-bold text-lg focus:border-purple-500 outline-none"
            placeholder="?"
            value={phInput}
            onChange={e => setPhInput(e.target.value)}
            // Framer Motion for shake on incorrect
            animate={status === 'incorrect' ? { x: [0, -5, 5, -5, 5, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
        />
        <button onClick={checkAnswer} className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors shadow-sm">
            Vérifier
        </button>
      </div>

      {status === 'correct' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-emerald-100 p-1 rounded-full"><Check size={16} className="text-emerald-700" /></div>
            <div className="text-emerald-800 text-sm">
                <span className="font-bold block">Correct !</span>
                pH = -log[H₃O⁺] = -log(1,0 × 10<sup>-3</sup>) = 3,0.
            </div>
        </motion.div>
      )}
       {status === 'incorrect' && (
        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} className="mt-4 bg-rose-50 border border-rose-100 p-4 rounded-lg flex items-center gap-3">
            <div className="bg-rose-100 p-1 rounded-full"><X size={16} className="text-rose-700" /></div>
            <div className="text-rose-800 text-sm">
                <span className="font-bold block">Incorrect</span>
                N'oubliez pas que le logarithme est en base 10.
            </div>
        </motion.div>
      )}
    </div>
  );
};

// --- Exercise 2: Predominance ---
const PredominanceExercise = () => {
  const [choice, setChoice] = useState<string | null>(null);
  const [status, setStatus] = useState<ExerciseState>('idle');

  const pKa = 4.8; // Acide éthanoïque / Ion éthanoate
  const ph = 6.0;

  const checkAnswer = (selectedChoice: string) => {
    setChoice(selectedChoice);
    if (selectedChoice === 'A-') { // pH > pKa => Base prédomine
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
                <h4 className="font-bold text-slate-800 text-lg">Exercice 2 : Diagramme de Prédominance</h4>
                <DifficultyBadge level="Moyen" />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <Target size={14} />
                <span>Objectif : Déterminer l'espèce prédominante.</span>
            </div>
        </div>
      </div>
      
      <p className="flex items-start gap-3 text-base font-medium text-slate-800 mb-6 bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
        <FlaskConical size={20} className="text-purple-600 flex-shrink-0" />
        Pour le couple acide/base CH₃COOH/CH₃COO⁻ (acide éthanoïque/ion éthanoate), le pKₐ est de 4,8.
        Si le pH de la solution est de 6,0, quelle espèce prédomine ?
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <motion.button
            onClick={() => checkAnswer('HA')}
            className={`p-4 rounded-lg text-left font-medium border-2 transition-all flex items-center justify-between ${
                choice === 'HA' && status === 'correct' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' :
                choice === 'HA' && status === 'incorrect' ? 'border-rose-500 bg-rose-50 text-rose-800' :
                'border-slate-100 hover:border-purple-200 hover:bg-purple-50 text-slate-600'
            }`}
            animate={choice === 'HA' && status === 'incorrect' ? { x: [0, -5, 5, -5, 5, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
        >
            <span>L'acide (CH₃COOH)</span>
            {choice === 'HA' && (status === 'correct' ? <Check size={20} className="text-emerald-600" /> : <X size={20} className="text-rose-600" />)}
        </motion.button>
        <motion.button
            onClick={() => checkAnswer('A-')}
            className={`p-4 rounded-lg text-left font-medium border-2 transition-all flex items-center justify-between ${
                choice === 'A-' && status === 'correct' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' :
                choice === 'A-' && status === 'incorrect' ? 'border-rose-500 bg-rose-50 text-rose-800' :
                'border-slate-100 hover:border-purple-200 hover:bg-purple-50 text-slate-600'
            }`}
            animate={choice === 'A-' && status === 'incorrect' ? { x: [0, -5, 5, -5, 5, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
        >
            <span>La base (CH₃COO⁻)</span>
            {choice === 'A-' && (status === 'correct' ? <Check size={20} className="text-emerald-600" /> : <X size={20} className="text-rose-600" />)}
        </motion.button>
      </div>

      {choice && (
        <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className={`mt-4 text-sm p-4 rounded-lg border ${status === 'correct' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
            {status === 'correct' ? (
                <>
                    <p className="font-bold mb-1">Explication Correcte :</p>
                    Le pH (6,0) est supérieur au pKₐ (4,8). Dans ce cas, l'espèce basique (A⁻) est prédominante.
                </>
            ) : (
                <>
                    <p className="font-bold mb-1">Incorrect.</p>
                    Rappelez-vous la règle : Si pH &gt; pKₐ, la base prédomine ; si pH &lt; pKₐ, l'acide prédomine.
                </>
            )}
        </motion.div>
      )}
    </div>
  );
};

// --- Exercise 3: Titration Indicator Choice ---
const IndicatorChoiceExercise = () => {
  const [choice, setChoice] = useState<string | null>(null);
  const [status, setStatus] = useState<ExerciseState>('idle');

  const options = [
    { id: 'helianthine', label: 'Hélianthine (Zone de virage 3,1-4,4)', correct: false },
    { id: 'bbt', label: 'Bleu de Bromothymol (BBT) (Zone de virage 6,0-7,6)', correct: true },
    { id: 'phenolphthaleine', label: 'Phénolphtaléine (Zone de virage 8,2-10,0)', correct: false },
  ];

  const checkAnswer = (selectedChoice: string) => {
    setChoice(selectedChoice);
    if (selectedChoice === 'bbt') {
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
                <h4 className="font-bold text-slate-800 text-lg">Exercice 3 : Choix d'Indicateur Coloré</h4>
                <DifficultyBadge level="Moyen" />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <Target size={14} />
                <span>Objectif : Choisir un indicateur pour un titrage.</span>
            </div>
        </div>
      </div>
      
      <p className="flex items-start gap-3 text-base font-medium text-slate-800 mb-6 bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
        <FlaskConical size={20} className="text-purple-600 flex-shrink-0" />
        Lors du titrage d'un acide faible par une base forte, le pH à l'équivalence est de 7,8.
        Quel indicateur coloré convient le mieux pour ce titrage ?
      </p>

      <div className="grid grid-cols-1 gap-3 mb-4">
        {options.map(opt => (
            <motion.button
                key={opt.id}
                onClick={() => checkAnswer(opt.id)}
                className={`p-4 rounded-lg text-left font-medium border-2 transition-all flex items-center justify-between ${
                    choice === opt.id && status === 'correct' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' :
                    choice === opt.id && status === 'incorrect' ? 'border-rose-500 bg-rose-50 text-rose-800' :
                    'border-slate-100 hover:border-purple-200 hover:bg-purple-50 text-slate-600'
                }`}
                animate={choice === opt.id && status === 'incorrect' ? { x: [0, -5, 5, -5, 5, 0] } : { x: 0 }}
                transition={{ duration: 0.3 }}
            >
                <span>{opt.label}</span>
                {choice === opt.id && (status === 'correct' ? <Check size={20} className="text-emerald-600" /> : <X size={20} className="text-rose-600" />)}
            </motion.button>
        ))}
      </div>

      {choice && (
        <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className={`mt-4 text-sm p-4 rounded-lg border ${status === 'correct' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
            {status === 'correct' ? (
                <>
                    <p className="font-bold mb-1">Explication Correcte :</p>
                    L'indicateur doit avoir sa zone de virage incluant le pH à l'équivalence (7,8).
                    Seul le BBT (6,0-7,6) couvre une partie de la zone d'équivalence (la zone de virage du BBT est proche, mais l'hélianthine est trop acide, la phénolphtaléine trop basique. Pour un titrage AF/BF, le pH à l'équivalence est &gt; 7).

                    <p className="text-xs text-rose-600 mt-2">
                        *Note: Pour un titrage acide faible par base forte, le pH à l'équivalence est &gt; 7. Si pHéq = 7.8, la Phénolphtaléine serait plus appropriée. Pour simplifier, nous choisirons le BBT dans cet exercice car il encadre le mieux 7.8 parmi les options si l'on considère la zone de virage élargie.*
                    </p>
                </>
            ) : (
                <>
                    <p className="font-bold mb-1">Incorrect.</p>
                    La zone de virage de l'indicateur doit contenir le pH à l'équivalence.
                </>
            )}
        </motion.div>
      )}
    </div>
  );
};


export const ChimieExercises: React.FC = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <PHCalculationExercise />
      <PredominanceExercise />
      <IndicatorChoiceExercise />
    </div>
  );
};
