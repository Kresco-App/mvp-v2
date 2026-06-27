/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, RefreshCw, HelpCircle } from 'lucide-react';

const QUIZ_PROGRESS_WIDTH_CLASSES = [
  'w-[12.5%]',
  'w-[25%]',
  'w-[37.5%]',
  'w-[50%]',
  'w-[62.5%]',
  'w-[75%]',
  'w-[87.5%]',
  'w-full',
] as const;

export const LightExercises: React.FC = () => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const questions = [
    {
      question: "Quelle est la relation entre la longueur d'onde λ, la célérité c et la fréquence ν ?",
      options: [
        "λ = c · ν",
        "λ = c / ν",
        "λ = ν / c",
        "λ = 1 / (c · ν)"
      ],
      correct: 1,
      explanation: "La longueur d'onde est la distance parcourue pendant une période T = 1/ν. Donc λ = c · T = c / ν."
    },
    {
      question: "Lors d'une diffraction par une fente de largeur 'a', l'écart angulaire θ varie comment ?",
      options: [
        "Proportionnel à a",
        "Inversement proportionnel à a",
        "Indépendant de a",
        "Proportionnel au carré de a"
      ],
      correct: 1,
      explanation: "θ = λ / a. Plus l'ouverture est petite, plus la diffraction est marquée (θ grand)."
    },
    {
      question: "Une lumière monochromatique passe de l'air (n=1) dans le verre (n=1.5). Que fait sa fréquence ?",
      options: [
        "Elle augmente",
        "Elle diminue",
        "Elle reste inchangée",
        "Elle devient nulle"
      ],
      correct: 2,
      explanation: "La fréquence caractérise la couleur et la source. Elle ne change jamais lors d'un changement de milieu. (C'est la vitesse et la longueur d'onde qui changent)."
    },
    {
      question: "Si l'indice de réfraction du verre est n = 1.5, quelle est la vitesse de la lumière dans ce verre ?",
      options: [
        "3.0 × 10⁸ m/s",
        "2.0 × 10⁸ m/s",
        "4.5 × 10⁸ m/s",
        "1.5 × 10⁸ m/s"
      ],
      correct: 1,
      explanation: "n = c / v => v = c / n = (3×10⁸) / 1.5 = 2×10⁸ m/s."
    },
    {
      question: "Dans un prisme, quelle couleur est la plus déviée ?",
      options: [
        "Le Rouge (λ ≈ 800 nm)",
        "Le Vert (λ ≈ 550 nm)",
        "Le Violet (λ ≈ 400 nm)",
        "Elles sont déviées pareillement"
      ],
      correct: 2,
      explanation: "L'indice n dépend de λ (loi de Cauchy : n = A + B/λ²). λ petit (Violet) => n grand => réfraction plus forte => plus dévié."
    },
    {
      question: "Un rayon passe de l'air (n1=1) à l'eau (n2=1.33) avec un angle d'incidence i = 30°. Quel est l'angle de réfraction r ?",
      options: [
        "r = 41.7°",
        "r = 22.1°",
        "r = 30°",
        "r = 0°"
      ],
      correct: 1,
      explanation: "n1 sin(i) = n2 sin(r) => sin(r) = (1 * sin(30))/1.33 = 0.5/1.33 ≈ 0.376. Donc r = arcsin(0.376) ≈ 22.1°."
    },
    {
      question: "Une lumière laser rouge (λ = 633 nm dans le vide) pénètre dans du verre (n = 1.5). Quelle est sa longueur d'onde dans le verre ?",
      options: [
        "633 nm (inchangée)",
        "950 nm",
        "422 nm",
        "316 nm"
      ],
      correct: 2,
      explanation: "Dans le milieu, v = c/n. La fréquence f est constante. Donc λ' = v/f = (c/n)/f = (c/f)/n = λ/n. λ' = 633 / 1.5 = 422 nm."
    },
    {
      question: "On éclaire une fente de largeur a = 0.1 mm avec un laser λ = 600 nm. L'écran est à D = 2 m. Quelle est la largeur L de la tache centrale ?",
      options: [
        "1.2 cm",
        "2.4 cm",
        "6 mm",
        "12 mm"
      ],
      correct: 1,
      explanation: "L = 2λD / a = (2 * 600e-9 * 2) / (0.1e-3) = 2400e-9 / 1e-4 = 2400e-5 = 2.4e-2 m = 2.4 cm."
    }
  ];

  const handleAnswer = (idx: number) => {
    setSelectedOption(idx);
    setShowFeedback(true);
    if (idx === questions[currentQuestion].correct) {
      setScore(score + 1);
    }
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedOption(null);
      setShowFeedback(false);
    }
  };

  const resetQuiz = () => {
    setCurrentQuestion(0);
    setScore(0);
    setSelectedOption(null);
    setShowFeedback(false);
  };

  const progressWidthClass = QUIZ_PROGRESS_WIDTH_CLASSES[currentQuestion] ?? 'w-full';

  return (
    <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 max-w-3xl mx-auto my-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="w-full">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Quiz : Ondes Lumineuses</h3>
            <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>Question {currentQuestion + 1} / {questions.length}</span>
                <div className="h-2 w-32 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-indigo-500 transition-[width] duration-500 ${progressWidthClass}`} />
                </div>
            </div>
        </div>
        <div className="bg-indigo-50 text-indigo-700 px-6 py-3 rounded-2xl font-bold shadow-sm border border-indigo-100 whitespace-nowrap">
            Score: {score} / {questions.length}
        </div>
      </div>

      {currentQuestion < questions.length ? (
        <div>
            <div className="mb-6">
                <h4 className="text-lg font-semibold text-slate-800 leading-relaxed">
                    {questions[currentQuestion].question}
                </h4>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-6">
                {questions[currentQuestion].options.map((opt, idx) => (
                    <button type="button"
                        key={idx}
                        onClick={() => !showFeedback && handleAnswer(idx)}
                        disabled={showFeedback}
                        className={`p-4 rounded-xl text-left transition-[background-color,border-color,color] duration-150 ease-out flex justify-between items-center ${
                            showFeedback
                                ? idx === questions[currentQuestion].correct
                                    ? 'bg-green-100 border-2 border-green-400 text-green-800'
                                    : idx === selectedOption
                                        ? 'bg-red-50 border-2 border-red-200 text-red-800'
                                        : 'bg-slate-50 border border-slate-100 text-slate-400'
                                : 'bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700'
                        }`}
                    >
                        <span>{opt}</span>
                        {showFeedback && idx === questions[currentQuestion].correct && <CheckCircle2 size={20} className="text-green-600"/>}
                        {showFeedback && idx === selectedOption && idx !== questions[currentQuestion].correct && <XCircle size={20} className="text-red-500"/>}
                    </button>
                ))}
            </div>

            {showFeedback && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-900 mb-6 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-start gap-2">
                        <HelpCircle className="shrink-0 mt-0.5" size={18}/>
                        <div>
                            <span className="font-bold block mb-1">Explication :</span>
                            {questions[currentQuestion].explanation}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-end">
                {showFeedback ? (
                    <button type="button" 
                        onClick={nextQuestion}
                        className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-200 transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-indigo-700 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 motion-reduce:transition-none motion-reduce:active:scale-100"
                    >
                        {currentQuestion === questions.length - 1 ? "Voir le Résultat" : "Question Suivante"} <ArrowRight size={18}/>
                    </button>
                ) : (
                    <div className="h-12"></div> // Spacer
                )}
            </div>
        </div>
      ) : (
        <div className="text-center py-12">
            <div className="inline-block p-6 bg-green-50 rounded-full mb-6">
                <CheckCircle2 size={64} className="text-green-500"/>
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-4">Quiz Terminé !</h3>
            <p className="text-xl text-slate-600 mb-8">
                Votre score : <span className="font-bold text-indigo-600">{score} / {questions.length}</span>
            </p>
            
            <div className="flex justify-center gap-4">
                <button type="button" 
                    onClick={resetQuiz}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-6 py-3 font-bold text-slate-700 transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-slate-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                    <RefreshCw size={18}/> Recommencer
                </button>
            </div>
        </div>
      )}
    </div>
  );
};
