
'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, RefreshCw, Calculator, ListChecks, HelpCircle } from 'lucide-react';

// --- Shared Components ---

const TabButton = ({ active, onClick, label, icon: Icon }: any) => (
  <button type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-3 md:px-4 py-3 rounded-lg font-bold transition-all flex-1 md:flex-none justify-center text-sm md:text-base ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
        : 'bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-600 border border-slate-200'
    }`}
  >
    <Icon size={18} />
    <span className="hidden md:inline">{label}</span>
    <span className="md:hidden text-xs">{label.includes(':') ? label.split(':')[1].trim() : label}</span>
  </button>
);

// --- Exercise 1: Calculations ---

const CALC_QUESTIONS = [
  {
    id: 1,
    prompt: "Un circuit RC série est composé d'une résistance R = 1 kΩ et d'un condensateur C = 1000 μF. Calculez la constante de temps τ.",
    unit: "s",
    answer: 1,
    tolerance: 0.1,
    explanation: "τ = R × C = 1000 Ω × 1000×10⁻⁶ F = 1 s."
  },
  {
    id: 2,
    prompt: "On charge un condensateur avec un générateur de tension E = 10 V. Quelle est la tension uC à l'instant t = τ ?",
    unit: "V",
    answer: 6.3,
    tolerance: 0.2,
    explanation: "À t = τ, la tension atteint 63% de E. uC = 0.63 × 10 = 6.3 V."
  },
  {
    id: 3,
    prompt: "Si R = 10 kΩ et τ = 0.1 s, quelle est la capacité C du condensateur (en μF) ?",
    unit: "μF",
    answer: 10,
    tolerance: 0.5,
    explanation: "C = τ / R = 0.1 / 10000 = 10⁻⁵ F = 10 μF."
  }
];

const CalcExercise = () => {
  const [qIndex, setQIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>('idle');

  const question = CALC_QUESTIONS[qIndex];

  const checkAnswer = () => {
    const val = parseFloat(input);
    if (Math.abs(val - question.answer) <= question.tolerance) {
      setFeedback('correct');
    } else {
      setFeedback('incorrect');
    }
  };

  const next = () => {
    if (qIndex < CALC_QUESTIONS.length - 1) {
      setQIndex(prev => prev + 1);
      setInput('');
      setFeedback('idle');
    }
  };

  const reset = () => {
    setQIndex(0);
    setInput('');
    setFeedback('idle');
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm min-h-[300px] flex flex-col">
       <h3 className="font-bold text-blue-900 mb-4">Question {qIndex + 1}/{CALC_QUESTIONS.length}</h3>
       <p className="text-slate-700 mb-6 text-lg">{question.prompt}</p>
       
       <div className="flex gap-3 mb-6">
         <input 
           type="number" 
           value={input}
           onChange={(e) => setInput(e.target.value)}
           placeholder="Votre réponse"
           className="flex-1 border-2 border-slate-200 rounded-lg px-4 py-3 text-lg focus:border-blue-500 outline-none"
         />
         <span className="flex items-center font-bold text-slate-500">{question.unit}</span>
       </div>

       <AnimatePresence mode="wait">
        {feedback === 'idle' && (
           <button type="button" onClick={checkAnswer} className="bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors w-full">
             Valider
           </button>
        )}
        {feedback === 'correct' && (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
             <div className="flex items-center gap-2 font-bold text-emerald-700 mb-2">
               <Check /> Correct !
             </div>
             <p className="text-emerald-600 mb-4">{question.explanation}</p>
             {qIndex < CALC_QUESTIONS.length - 1 ? (
               <button type="button" onClick={next} className="bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 w-full">
                 Suivant <ArrowRight className="inline ml-1" size={16} />
               </button>
             ) : (
               <button type="button" onClick={reset} className="bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 w-full">
                 <RefreshCw className="inline mr-1" size={16} /> Recommencer
               </button>
             )}
           </motion.div>
        )}
        {feedback === 'incorrect' && (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-rose-50 p-4 rounded-lg border border-rose-200">
             <div className="flex items-center gap-2 font-bold text-rose-700 mb-2">
               <X /> Incorrect
             </div>
             <button type="button" onClick={() => setFeedback('idle')} className="bg-white text-rose-600 font-bold py-2 px-4 rounded-lg border border-rose-200 hover:bg-rose-50 w-full">
               Réessayer
             </button>
           </motion.div>
        )}
       </AnimatePresence>
    </div>
  );
};

// --- Exercise 2: QCM ---

const QCM_QUESTIONS = [
  {
    question: "Quelle est l'unité de la constante de temps τ = RC ?",
    options: ["Volt (V)", "Ampère (A)", "Seconde (s)", "Farad (F)"],
    correct: 2,
    expl: "L'homogénéité de la formule montre que [R]×[C] = [T]. C'est une durée."
  },
  {
    question: "Si on double la résistance R, comment évolue la durée de charge ?",
    options: ["Elle est divisée par 2", "Elle ne change pas", "Elle double", "Elle quadruple"],
    correct: 2,
    expl: "τ = RC. Si R double, τ double, donc la charge est deux fois plus lente."
  },
  {
    question: "Lors de la décharge, quelle est l'allure de la tension uC(t) ?",
    options: ["Croissance linéaire", "Croissance exponentielle", "Décroissance linéaire", "Décroissance exponentielle"],
    correct: 3,
    expl: "La solution est de la forme E·exp(-t/τ), c'est une décroissance exponentielle."
  },
  {
    question: "À l'instant initial t=0 de la charge (condensateur déchargé), comment se comporte le condensateur ?",
    options: ["Comme un fil (court-circuit)", "Comme un interrupteur ouvert", "Comme une résistance R", "Comme un générateur E"],
    correct: 0,
    expl: "À t=0, uC=0. D'après la loi des mailles, uR = E, donc i = E/R. Le condensateur se comporte comme un fil."
  }
];

const QCMExercise = () => {
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);

  const q = QCM_QUESTIONS[qIndex];
  const isCorrect = selected === q.correct;

  const handleSelect = (i: number) => {
    if (!isAnswered) {
      setSelected(i);
      setIsAnswered(true);
    }
  };

  const next = () => {
    if (qIndex < QCM_QUESTIONS.length - 1) {
      setQIndex(prev => prev + 1);
      setSelected(null);
      setIsAnswered(false);
    }
  };

  const reset = () => {
    setQIndex(0);
    setSelected(null);
    setIsAnswered(false);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm min-h-[300px] flex flex-col">
       <div className="flex justify-between items-center mb-6">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Question {qIndex + 1}/{QCM_QUESTIONS.length}</span>
       </div>
       
       <h3 className="font-bold text-slate-800 text-lg mb-6">{q.question}</h3>

       <div className="space-y-3 mb-6">
         {q.options.map((opt, i) => {
           let style = "bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200";
           if (isAnswered) {
             if (i === q.correct) style = "bg-emerald-100 border-emerald-300 text-emerald-800";
             else if (i === selected) style = "bg-rose-100 border-rose-300 text-rose-800";
             else style = "opacity-50";
           }
           return (
             <button type="button" 
               key={i} 
               onClick={() => handleSelect(i)}
               disabled={isAnswered}
               className={`w-full text-left p-4 rounded-lg border-2 font-medium transition-all ${style}`}
             >
               {opt}
             </button>
           );
         })}
       </div>

       <AnimatePresence>
         {isAnswered && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-4 rounded-lg ${isCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
             <div className="flex gap-2 items-start">
               <HelpCircle className="mt-0.5 flex-shrink-0" size={18} />
               <div>
                 <p className="font-bold mb-1">{isCorrect ? "Correct !" : "Incorrect"}</p>
                 <p className="text-sm mb-3">{q.expl}</p>
                 {qIndex < QCM_QUESTIONS.length - 1 ? (
                   <button type="button" onClick={next} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">Suivant</button>
                 ) : (
                   <button type="button" onClick={reset} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">Recommencer</button>
                 )}
               </div>
             </div>
           </motion.div>
         )}
       </AnimatePresence>
    </div>
  );
};

export const RCExercises: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'calc' | 'qcm'>('calc');

  return (
    <div className="space-y-6">
      <div className="flex bg-slate-100 p-1.5 rounded-xl">
         <TabButton 
            active={activeTab === 'calc'} 
            onClick={() => setActiveTab('calc')} 
            label="Calculs & Application" 
            icon={Calculator}
         />
         <TabButton 
            active={activeTab === 'qcm'} 
            onClick={() => setActiveTab('qcm')} 
            label="QCM de compréhension" 
            icon={ListChecks}
         />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
        >
            {activeTab === 'calc' && <CalcExercise />}
            {activeTab === 'qcm' && <QCMExercise />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
