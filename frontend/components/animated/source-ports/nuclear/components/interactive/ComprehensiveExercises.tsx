
'use client';

/* eslint-disable react/no-unescaped-entities, react/jsx-key, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, RefreshCw, Crosshair, Calculator, HelpCircle, ListChecks } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine } from 'recharts';

// --- Shared Components ---

const TabButton = ({ active, onClick, label, icon: Icon }: any) => (
  <button type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-3 md:px-4 py-3 rounded-lg font-bold transition-all flex-1 md:flex-none justify-center text-sm md:text-base ${
      active 
        ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' 
        : 'bg-white text-slate-500 hover:bg-purple-50 hover:text-purple-600 border border-slate-200'
    }`}
  >
    <Icon size={18} />
    <span className="hidden md:inline">{label}</span>
    {/* On mobile, show the specific topic (part after :) if available, else full label */}
    <span className="md:hidden text-xs">{label.includes(':') ? label.split(':')[1].trim() : label}</span>
  </button>
);

// --- Exercise 1: Nuclear Reactions (Based on PDF Ex 2) ---

const REACTION_QUESTIONS = [
  {
    id: 1,
    title: "Désintégration du Plutonium",
    type: "Alpha (α)",
    prompt: "Le Plutonium-238 est un émetteur alpha. Complétez l'équation de désintégration.",
    equation: {
      parent: { A: 238, Z: 94, Sym: 'Pu' },
      daughter: { A: '?', Z: '?', Sym: 'U' }, // Answers: 234, 92
      particle: { A: 4, Z: 2, Sym: 'He' }
    },
    solution: { A: 234, Z: 92 },
    explanation: "Conservation de A : 238 = A + 4 → A = 234. Conservation de Z : 94 = Z + 2 → Z = 92."
  },
  {
    id: 2,
    title: "Désintégration du Césium",
    type: "Bêta Moins (β⁻)",
    prompt: "Le Césium-135 se désintègre en Baryum. Équilibrez la réaction.",
    equation: {
      parent: { A: 135, Z: 55, Sym: 'Cs' },
      daughter: { A: '?', Z: '?', Sym: 'Ba' }, // Answers: 135, 56
      particle: { A: 0, Z: -1, Sym: 'e' }
    },
    solution: { A: 135, Z: 56 },
    explanation: "Conservation de A : 135 = A + 0 → A = 135. Conservation de Z : 55 = Z + (-1) → Z = 56."
  },
  {
    id: 3,
    title: "Désintégration de l'Azote",
    type: "Bêta Plus (β⁺)",
    prompt: "L'Azote-13 est instable. Il se transforme en Carbone.",
    equation: {
      parent: { A: 13, Z: 7, Sym: 'N' },
      daughter: { A: '?', Z: '?', Sym: 'C' }, // Answers: 13, 6
      particle: { A: 0, Z: 1, Sym: 'e' }
    },
    solution: { A: 13, Z: 6 },
    explanation: "Conservation de A : 13 = A + 0 → A = 13. Conservation de Z : 7 = Z + 1 → Z = 6."
  },
  {
    id: 4,
    title: "Désintégration de l'Uranium",
    type: "Alpha (α)",
    prompt: "L'Uranium-235 se désintègre naturellement en Thorium.",
    equation: {
      parent: { A: 235, Z: 92, Sym: 'U' },
      daughter: { A: '?', Z: '?', Sym: 'Th' }, // Answers: 231, 90
      particle: { A: 4, Z: 2, Sym: 'He' }
    },
    solution: { A: 231, Z: 90 },
    explanation: "Conservation de A : 235 = A + 4 → A = 231. Conservation de Z : 92 = Z + 2 → Z = 90."
  },
  {
    id: 5,
    title: "Fluor-18 (Scintigraphie)",
    type: "Bêta Plus (β⁺)",
    prompt: "Le Fluor-18 est utilisé en médecine (PET Scan). Il se transforme en Oxygène.",
    equation: {
      parent: { A: 18, Z: 9, Sym: 'F' },
      daughter: { A: '?', Z: '?', Sym: 'O' }, // Answers: 18, 8
      particle: { A: 0, Z: 1, Sym: 'e' }
    },
    solution: { A: 18, Z: 8 },
    explanation: "Conservation de A : 18 = A + 0 → A = 18. Conservation de Z : 9 = Z + 1 → Z = 8."
  }
];

const IsotopeInput = ({ A, Z, Sym, onChange, values, disabled }: any) => (
  <div className="flex flex-col items-center flex-shrink-0">
    <div className="flex items-center gap-0.5 md:gap-1">
      <div className="flex flex-col gap-1 items-end">
        {A === '?' ? (
          <input 
            type="number" 
            placeholder="A"
            className={`w-10 h-9 md:w-12 text-center text-sm font-bold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-500 transition-all ${disabled ? 'bg-slate-100 border-slate-200' : 'bg-white border-purple-300 shadow-sm'}`}
            value={values.A}
            onChange={(e) => onChange('A', e.target.value)}
            disabled={disabled}
          />
        ) : (
          <span className="text-sm font-bold text-slate-500 w-10 md:w-12 text-right pr-1">{A}</span>
        )}
        
        {Z === '?' ? (
          <input 
            type="number" 
            placeholder="Z"
            className={`w-10 h-9 md:w-12 text-center text-sm font-bold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-200 focus:border-yellow-500 transition-all ${disabled ? 'bg-slate-100 border-slate-200' : 'bg-white border-yellow-300 shadow-sm'}`}
            value={values.Z}
            onChange={(e) => onChange('Z', e.target.value)}
            disabled={disabled}
          />
        ) : (
          <span className="text-sm font-bold text-slate-500 w-10 md:w-12 text-right pr-1">{Z}</span>
        )}
      </div>
      <span className="text-3xl md:text-4xl font-serif font-bold text-slate-800">{Sym}</span>
    </div>
  </div>
);

const ReactionExercise = () => {
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [inputs, setInputs] = useState({ A: '', Z: '' });
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>('idle');

  const question = REACTION_QUESTIONS[currentQIndex];

  const checkAnswer = () => {
    const isACorrect = parseInt(inputs.A) === question.solution.A;
    const isZCorrect = parseInt(inputs.Z) === question.solution.Z;
    setFeedback(isACorrect && isZCorrect ? 'correct' : 'incorrect');
  };

  const nextQuestion = () => {
    if (currentQIndex < REACTION_QUESTIONS.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setInputs({ A: '', Z: '' });
      setFeedback('idle');
    }
  };

  const resetQuiz = () => {
    setCurrentQIndex(0);
    setInputs({ A: '', Z: '' });
    setFeedback('idle');
  };

  const isFinished = feedback === 'correct' && currentQIndex === REACTION_QUESTIONS.length - 1;

  return (
    <div className="bg-white p-4 md:p-8 rounded-xl border border-purple-100 shadow-sm min-h-[400px] flex flex-col">
       <div className="flex justify-between items-center mb-6">
          <div>
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Question {currentQIndex + 1}/{REACTION_QUESTIONS.length}</span>
            <h3 className="text-lg font-bold text-slate-800">{question.title}</h3>
          </div>
          <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">{question.type}</span>
       </div>

       <p className="text-slate-600 mb-8 bg-slate-50 p-4 rounded-lg border-l-4 border-purple-400 text-sm md:text-base">
         {question.prompt}
       </p>

       {/* Nuclear Equation Container - Horizontal Scroll on Mobile */}
       <div className="flex items-center justify-start md:justify-center gap-4 md:gap-8 mb-8 p-4 md:p-6 bg-slate-50 rounded-xl border border-slate-200 overflow-x-auto shadow-inner">
          {/* Use a min-w wrapper to ensure the equation stays on one line and triggers scroll if needed */}
          <div className="flex items-center gap-3 md:gap-8 min-w-max mx-auto md:mx-0">
              {/* Parent */}
              <IsotopeInput 
                 A={question.equation.parent.A} 
                 Z={question.equation.parent.Z} 
                 Sym={question.equation.parent.Sym} 
                 values={{}} 
                 disabled={true} 
              />
              
              <ArrowRight className="text-slate-400 flex-shrink-0" size={24} />
              
              {/* Daughter (Input) */}
              <IsotopeInput 
                 A={question.equation.daughter.A} 
                 Z={question.equation.daughter.Z} 
                 Sym={question.equation.daughter.Sym} 
                 values={inputs}
                 onChange={(field: string, val: string) => setInputs({...inputs, [field]: val})}
                 disabled={feedback === 'correct'}
              />

              <span className="text-2xl font-bold text-slate-300 flex-shrink-0">+</span>

              {/* Particle */}
              <IsotopeInput 
                 A={question.equation.particle.A} 
                 Z={question.equation.particle.Z} 
                 Sym={question.equation.particle.Sym} 
                 values={{}} 
                 disabled={true} 
              />
          </div>
       </div>

       <div className="mt-auto">
         <AnimatePresence mode="wait">
            {feedback === 'idle' && (
                <motion.button
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={checkAnswer}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 md:py-4 rounded-xl shadow-md transition-colors text-sm md:text-base"
                >
                    Vérifier ma réponse
                </motion.button>
            )}

            {feedback === 'incorrect' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-rose-50 text-rose-800 p-4 rounded-xl border border-rose-200 flex flex-col md:flex-row items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-3">
                        <X className="text-rose-600 flex-shrink-0" />
                        <div>
                            <p className="font-bold">Incorrect</p>
                            <p className="text-sm">Vérifiez les lois de conservation (A et Z).</p>
                        </div>
                    </div>
                    <button type="button" onClick={() => setFeedback('idle')} className="w-full md:w-auto px-4 py-2 bg-white text-rose-600 font-bold rounded-lg border border-rose-200 hover:bg-rose-50">Réessayer</button>
                </motion.div>
            )}

            {feedback === 'correct' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-50 text-emerald-900 p-4 rounded-xl border border-emerald-200 space-y-4"
                >
                    <div className="flex items-center gap-3 border-b border-emerald-100 pb-3">
                        <div className="bg-emerald-100 p-1 rounded-full flex-shrink-0"><Check className="text-emerald-600" size={20} /></div>
                        <div>
                            <p className="font-bold">Excellent !</p>
                            <p className="text-sm text-emerald-700">{question.explanation}</p>
                        </div>
                    </div>
                    
                    {isFinished ? (
                         <button type="button" onClick={resetQuiz} className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-3 md:py-4 rounded-lg hover:bg-emerald-700 shadow-sm transition-colors text-sm md:text-base">
                             <RefreshCw size={18} /> Recommencer l'exercice
                         </button>
                    ) : (
                        <button type="button" onClick={nextQuestion} className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-3 md:py-4 rounded-lg hover:bg-emerald-700 shadow-sm transition-colors text-sm md:text-base">
                            Question Suivante <ArrowRight size={18} />
                        </button>
                    )}
                </motion.div>
            )}
         </AnimatePresence>
       </div>
    </div>
  );
};


// --- Exercise 2: Dating Lab (Based on PDF Ex 6 & 9) ---

const DatingLab = () => {
  // Scenario: Activity drops from 800 Bq. User must find Half-Life, then calculate age.
  // Let's assume t1/2 = 4.0 (arbitrary units for graph reading ease).
  const A0 = 800;
  const HALF_LIFE = 4.0; 
  const TARGET_ACTIVITY = 200; // Let's say we measured 200 Bq. How old? Answer: 2 half-lives = 8.0.

  const [cursorX, setCursorX] = useState(2.0);
  const [step, setStep] = useState(1); // 1: Find Half-Life, 2: Calculate Age
  const [userHalfLife, setUserHalfLife] = useState('');
  const [userAge, setUserAge] = useState('');
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>('idle');

  // Chart Data
  const data = useMemo(() => {
    const pts = [];
    const lambda = Math.log(2) / HALF_LIFE;
    for (let t = 0; t <= 12; t += 0.2) {
      pts.push({ t, A: A0 * Math.exp(-lambda * t) });
    }
    return pts;
  }, []);

  const currentA = A0 * Math.exp(-(Math.log(2) / HALF_LIFE) * cursorX);

  const checkHalfLife = () => {
    const val = parseFloat(userHalfLife);
    if (val >= 3.8 && val <= 4.2) {
      setStep(2);
      setFeedback('idle');
    } else {
      setFeedback('incorrect');
    }
  };

  const checkAge = () => {
     const val = parseFloat(userAge);
     // Target is 8.0
     if (val >= 7.8 && val <= 8.2) {
         setFeedback('correct');
     } else {
         setFeedback('incorrect');
     }
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl border border-purple-100 shadow-sm">
        <div className="mb-6 bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400 text-sm text-yellow-900">
            <h4 className="font-bold flex items-center gap-2 mb-1"><Crosshair size={18} /> Mission Datation</h4>
            <p>
                Vous analysez un échantillon radioactif. 
                {step === 1 ? (
                    " Première étape : Utilisez le curseur sur le graphique pour déterminer la demi-vie (t1/2) de cet isotope."
                ) : (
                    ` Bravo ! Demi-vie validée (${HALF_LIFE} s). Maintenant, l'échantillon a une activité mesurée de ${TARGET_ACTIVITY} Bq. Quel est son âge ?`
                )}
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 h-[300px] md:h-[350px] bg-white border border-slate-100 rounded-xl p-2 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="t" 
                            type="number" 
                            domain={[0, 12]} 
                            tickCount={13}
                            label={{ value: 'Temps (s)', position: 'insideBottomRight', offset: -5 }}
                        />
                        <YAxis 
                            domain={[0, 800]} 
                            label={{ value: 'Activité (Bq)', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip 
                            formatter={(val: number) => [Math.round(val), 'Bq']}
                            labelFormatter={(label) => `${Number(label).toFixed(1)} s`}
                        />
                        <Line type="monotone" dataKey="A" stroke="#9333ea" strokeWidth={3} dot={false} animationDuration={1000} />
                        
                        {/* Interactive Cursor */}
                        <ReferenceLine x={cursorX} stroke="#eab308" strokeDasharray="3 3" />
                        <ReferenceLine y={currentA} stroke="#eab308" strokeDasharray="3 3" />
                        <ReferenceDot x={cursorX} y={currentA} r={6} fill="#eab308" stroke="white" strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
                
                {/* Visual Feedback for Cursor */}
                <div className="absolute top-4 right-4 bg-white/90 p-2 rounded shadow border border-slate-100 text-xs font-mono z-10">
                    <div>t = {cursorX.toFixed(1)} s</div>
                    <div>A = {Math.round(currentA)} Bq</div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Exploration Graphique</label>
                    <input 
                        type="range" 
                        min="0" max="12" step="0.1" 
                        value={cursorX} 
                        onChange={(e) => setCursorX(parseFloat(e.target.value))}
                        className="w-full accent-purple-600 h-4 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="text-xs text-slate-500 italic">Déplacez le curseur pour lire les valeurs.</div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                    {step === 1 ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Quelle est la demi-vie ?</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="number" 
                                        value={userHalfLife}
                                        onChange={(e) => setUserHalfLife(e.target.value)}
                                        placeholder="t1/2 en s"
                                        className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-3 text-sm focus:border-purple-500 outline-none"
                                    />
                                    <button type="button" 
                                        onClick={checkHalfLife}
                                        className="bg-purple-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-purple-700"
                                    >
                                        Valider
                                    </button>
                                </div>
                                {feedback === 'incorrect' && <p className="text-xs text-rose-500 mt-1">Incorrect. Rappel : A(t1/2) = A0 / 2.</p>}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm border border-emerald-100">
                                <Check size={16} className="inline mr-1" /> Demi-vie correcte : {HALF_LIFE} s.
                            </motion.div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Calculer l'âge pour A = {TARGET_ACTIVITY} Bq</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="number" 
                                        value={userAge}
                                        onChange={(e) => setUserAge(e.target.value)}
                                        placeholder="Âge en s"
                                        className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-3 text-sm focus:border-purple-500 outline-none"
                                    />
                                    <button type="button" 
                                        onClick={checkAge}
                                        className="bg-purple-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-purple-700"
                                    >
                                        Valider
                                    </button>
                                </div>
                                {feedback === 'incorrect' && <p className="text-xs text-rose-500 mt-1">Incorrect. Avez-vous utilisé la formule t = ... ?</p>}
                                {feedback === 'correct' && (
                                    <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-sm text-emerald-600 font-bold mt-2">
                                        Bravo ! {TARGET_ACTIVITY} Bq correspond à A0/4, donc 2 demi-vies (8s).
                                    </motion.p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};


// --- Exercise 3: QCM (Multiple Choice) ---

const InlineIsotope = ({ A, Z, Sym }: { A: string | number, Z: string | number, Sym: string }) => (
  <span className="inline-flex items-center align-middle mx-1 font-serif text-slate-800">
    <span className="flex flex-col text-[0.65em] leading-[0.9] text-right font-bold mr-0.5 mt-0.5">
      <span>{A}</span>
      <span>{Z}</span>
    </span>
    <span className="text-lg font-bold">{Sym}</span>
  </span>
);

const QCM_QUESTIONS = [
  {
    id: 1,
    question: "À composition donnée, l'activité d'un échantillon est :",
    options: [
      "Indépendante de sa masse",
      "Proportionnelle à sa masse",
      "Inversement proportionnelle à sa masse"
    ],
    correctIndex: 1,
    explanation: "L'activité A = λN. Or le nombre de noyaux N est proportionnel à la masse m (N = m/M * NA). Donc A est proportionnelle à la masse."
  },
  {
    id: 2,
    question: "Deux échantillons ont le même nombre de noyaux. Le premier a une demi-vie plus courte. Son activité initiale est :",
    options: [
      "Supérieure",
      "Inférieure",
      "Égale"
    ],
    correctIndex: 0,
    explanation: "A = λN. La constante λ est inversement proportionnelle à la demi-vie (λ = ln(2)/t1/2). Une demi-vie plus courte signifie une désintégration plus rapide, donc une activité plus forte."
  },
  {
    id: 3,
    question: (
      <span>
        Les noyaux <InlineIsotope A={14} Z={7} Sym="N" /> et <InlineIsotope A={14} Z={6} Sym="C" /> sont-ils isotopes ?
      </span>
    ),
    options: [
      "Oui, car ils ont la même masse A=14",
      "Non, car ils n'ont pas le même Z",
      "Non, car ils n'ont pas le même N"
    ],
    correctIndex: 1,
    explanation: "Pour être isotopes, deux noyaux doivent avoir le même numéro atomique Z (même nombre de protons). Ici Z=7 et Z=6, ce sont donc des éléments chimiques différents (isobares, mais pas isotopes)."
  },
  {
      id: 4,
      question: "Quelle est la relation correcte entre la constante de temps τ et la demi-vie t1/2 ?",
      options: [
          "t1/2 = τ / ln(2)",
          "t1/2 = τ · ln(2)",
          "t1/2 = ln(2) / τ"
      ],
      correctIndex: 1,
      explanation: "On sait que λ = 1/τ et t1/2 = ln(2)/λ. En remplaçant λ par 1/τ, on obtient t1/2 = ln(2) / (1/τ) = τ · ln(2)."
  },
  {
      id: 5,
      question: "Sans consulter le tableau périodique, quel est l'intrus parmi ces nucléides (lequel n'est pas un isotope des autres) ?",
      options: [
          <span><InlineIsotope A={14} Z={6} Sym="C" /> et <InlineIsotope A={12} Z={6} Sym="C" /> (Couple 1)</span>,
          <span><InlineIsotope A={226} Z={88} Sym="Ra" /> et <InlineIsotope A={222} Z={86} Sym="Rn" /> (Couple 2)</span>,
          <span><InlineIsotope A={235} Z={92} Sym="U" /> et <InlineIsotope A={238} Z={92} Sym="U" /> (Couple 3)</span>
      ],
      correctIndex: 1,
      explanation: "L'Uranium (Z=92) et le Carbone (Z=6) sont ici présentés sous forme d'isotopes (même Z). En revanche, le Radium (Z=88) et le Radon (Z=86) ont des Z différents, ce ne sont pas des isotopes mais des éléments différents (couple père-fils souvent)."
  },
  {
      id: 6,
      question: "Quelle est la définition exacte de l'unité Becquerel (Bq) ?",
      options: [
          "1 Bq = 1 atome radioactif par kg",
          "1 Bq = 1 désintégration par seconde",
          "1 Bq = 1 an de demi-vie"
      ],
      correctIndex: 1,
      explanation: "Le Becquerel mesure l'activité radioactive. 1 Bq correspond à une désintégration par seconde. Une source de 1000 Bq subit 1000 désintégrations chaque seconde."
  },
  {
      id: 7,
      question: "Lors d'une désintégration β⁻, quelle particule est émise ?",
      options: [
          <span>Un proton <InlineIsotope A={1} Z={1} Sym="p" /></span>,
          <span>Un positron <InlineIsotope A={0} Z={1} Sym="e" /></span>,
          <span>Un électron <InlineIsotope A={0} Z={-1} Sym="e" /></span>
      ],
      correctIndex: 2,
      explanation: "La radioactivité β⁻ se produit lorsqu'un noyau a trop de neutrons. Un neutron se transforme en proton en éjectant un électron (particule β⁻) et un antineutrino."
  }
];

const QCMExercise = () => {
    const [qIndex, setQIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);
    
    const currentQ = QCM_QUESTIONS[qIndex];
    const isCorrect = selectedOption === currentQ.correctIndex;

    const handleSelect = (idx: number) => {
        if (!isAnswered) {
            setSelectedOption(idx);
            setIsAnswered(true);
        }
    };

    const nextQ = () => {
        if (qIndex < QCM_QUESTIONS.length - 1) {
            setQIndex(prev => prev + 1);
            setSelectedOption(null);
            setIsAnswered(false);
        }
    };

    const reset = () => {
        setQIndex(0);
        setSelectedOption(null);
        setIsAnswered(false);
    };

    return (
        <div className="bg-white p-4 md:p-8 rounded-xl border border-purple-100 shadow-sm min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Question {qIndex + 1}/{QCM_QUESTIONS.length}</span>
                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold">Concepts</span>
            </div>
            
            <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-8 leading-snug">
                {currentQ.question}
            </h3>
            
            <div className="space-y-3 mb-8">
                {currentQ.options.map((opt, idx) => {
                    let btnClass = "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100";
                    if (isAnswered) {
                        if (idx === currentQ.correctIndex) btnClass = "bg-emerald-100 border-emerald-300 text-emerald-800"; // Correct answer always green
                        else if (idx === selectedOption) btnClass = "bg-rose-100 border-rose-300 text-rose-800"; // Wrong selection red
                        else btnClass = "bg-slate-50 border-slate-200 text-slate-400 opacity-50"; // Others dimmed
                    }

                    return (
                        <button type="button"
                            key={idx}
                            onClick={() => handleSelect(idx)}
                            disabled={isAnswered}
                            className={`w-full text-left p-4 rounded-xl border-2 font-medium transition-all duration-200 flex items-center justify-between active:scale-[0.98] ${btnClass} ${!isAnswered && "hover:border-purple-300 hover:shadow-sm"}`}
                        >
                            <span>{opt}</span>
                            {isAnswered && idx === currentQ.correctIndex && <Check size={20} className="text-emerald-600" />}
                            {isAnswered && idx === selectedOption && idx !== currentQ.correctIndex && <X size={20} className="text-rose-600" />}
                        </button>
                    )
                })}
            </div>
            
            <div className="mt-auto min-h-[100px]">
                <AnimatePresence mode="wait">
                    {isAnswered && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-4 rounded-xl border ${isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}
                        >
                            <div className="flex items-start gap-3">
                                <HelpCircle className={`mt-0.5 flex-shrink-0 ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}`} size={20} />
                                <div className="flex-1">
                                    <p className={`font-bold mb-1 ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
                                        {isCorrect ? 'C\'est exact !' : 'Pas tout à fait...'}
                                    </p>
                                    <p className={`text-sm mb-4 ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                        {currentQ.explanation}
                                    </p>
                                    
                                    {qIndex < QCM_QUESTIONS.length - 1 ? (
                                        <button type="button" onClick={nextQ} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors w-full md:w-auto">
                                            Question Suivante
                                        </button>
                                    ) : (
                                        <button type="button" onClick={reset} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 w-full md:w-auto">
                                            <RefreshCw size={16} /> Recommencer
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export const ComprehensiveExercises: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'reactions' | 'dating' | 'qcm'>('reactions');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 md:gap-4 bg-slate-100 p-1.5 rounded-xl">
         <TabButton 
            active={activeTab === 'reactions'} 
            onClick={() => setActiveTab('reactions')} 
            label="Exercice 1 : Réactions" 
            icon={RefreshCw}
         />
         <TabButton 
            active={activeTab === 'dating'} 
            onClick={() => setActiveTab('dating')} 
            label="Exercice 2 : Labo" 
            icon={Calculator}
         />
         <TabButton 
            active={activeTab === 'qcm'} 
            onClick={() => setActiveTab('qcm')} 
            label="Exercice 3 : QCM" 
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
            {activeTab === 'reactions' && <ReactionExercise />}
            {activeTab === 'dating' && <DatingLab />}
            {activeTab === 'qcm' && <QCMExercise />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
