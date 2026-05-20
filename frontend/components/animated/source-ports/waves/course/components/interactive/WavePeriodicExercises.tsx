/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, RefreshCw, HelpCircle } from 'lucide-react';

export const WavePeriodicExercises: React.FC = () => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const questions = [
    {
      question: "Une onde a une fréquence de 50 Hz. Quelle est sa période ?",
      options: [
        "0.02 s",
        "0.2 s",
        "50 s",
        "0.05 s"
      ],
      correct: 0,
      explanation: "T = 1/f = 1/50 = 0.02 s."
    },
    {
      question: "Une onde se propage à 10 m/s avec une fréquence de 2 Hz. Quelle est sa longueur d'onde ?",
      options: [
        "20 m",
        "0.2 m",
        "5 m",
        "12 m"
      ],
      correct: 2,
      explanation: "v = λ.f donc λ = v/f = 10/2 = 5 m."
    },
    {
      question: "Pour observer une diffraction nette à travers une ouverture de largeur 'a', il faut :",
      options: [
        "a >> λ",
        "a ≤ λ",
        "a > 10λ",
        "La diffraction ne dépend pas de a"
      ],
      correct: 1,
      explanation: "La diffraction est marquée lorsque l'ouverture est de l'ordre de grandeur ou inférieure à la longueur d'onde."
    },
    {
      question: "Un disque tourne à N = 20 Hz. Pour le voir immobile (k=1), quelle fréquence d'éclairs Ne faut-il ?",
      options: [
        "10 Hz",
        "40 Hz",
        "20 Hz",
        "19 Hz"
      ],
      correct: 2,
      explanation: "L'immobilité est observée pour Ne = N/k. Pour k=1, Ne = 20 Hz. (On l'observe aussi pour 10 Hz avec k=2)."
    },
    {
      question: "Si Ne = 21 Hz et N = 20 Hz, qu'observe-t-on ?",
      options: [
        "Immobilité",
        "Ralenti sens réel",
        "Ralenti sens inverse",
        "Mouvement rapide"
      ],
      correct: 2,
      explanation: "Ne > N (légèrement). Entre deux éclairs, le disque n'a pas fini son tour. On le voit reculer : Ralenti sens inverse."
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

  return (
    <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 max-w-3xl mx-auto my-8">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h3 className="text-2xl font-bold text-slate-800">Quiz : Ondes Périodiques</h3>
            <p className="text-slate-500 text-sm">Question {currentQuestion + 1} sur {questions.length}</p>
        </div>
        <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl font-bold">
            Score: {score}/{questions.length}
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
                    <button
                        key={idx}
                        onClick={() => !showFeedback && handleAnswer(idx)}
                        disabled={showFeedback}
                        className={`p-4 rounded-xl text-left transition-all flex justify-between items-center ${
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
                    <button 
                        onClick={nextQuestion}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-200"
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
                <button 
                    onClick={resetQuiz}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors"
                >
                    <RefreshCw size={18}/> Recommencer
                </button>
            </div>
        </div>
      )}
    </div>
  );
};
