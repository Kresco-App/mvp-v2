'use client';

/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Atom, Divide, Calculator, CheckCircle2, XCircle, TrendingDown, Scale, Activity } from 'lucide-react';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { NuclearExercises as StandardNuclearExercises } from './NuclearExercises';

// --- Shared Components ---
const ExerciseCard = ({ title, difficulty, children }: { title: string, difficulty: string, children: React.ReactNode }) => (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mb-8">
        <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Atom size={20} /></span>
                {title}
            </h3>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${difficulty === 'Difficile' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                Niveau {difficulty}
            </span>
        </div>
        <div className="p-6 md:p-8">
            {children}
        </div>
    </div>
);

// --- Challenge 1: Carbon-14 Dating (Visual Analysis) ---
const DatingChallenge = () => {
    // Data Generation
    // t1/2 = 5730 years.
    // lambda = ln(2)/5730 = 1.21e-4
    // Target: Activity = 0.35 * A0.
    // 0.35 = exp(-lambda * t) => ln(0.35) = -lambda * t
    // t = -ln(0.35) / 1.21e-4 = 1.049 / 0.000121 = 8669 years.

    const [userAge, setUserAge] = useState('');
    const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>('idle');
    const [zoomLevel, setZoomLevel] = useState(1);

    const data = Array.from({ length: 41 }, (_, i) => {
        const t = i * 500; // Step 500 years
        const activity = Math.exp(-0.000121 * t);
        return { t, activity };
    });

    // Custom Cursor for Graph Reading
    // Not explicitly implementing draggable cursor on Recharts for simplicity, 
    // relying on user reading the tooltip or axis.

    const check = () => {
        const val = parseFloat(userAge);
        // Accepting range around 8670
        if (val >= 8500 && val <= 8900) setFeedback('correct');
        else setFeedback('incorrect');
    }

    return (
        <ExerciseCard title="Datation au Carbone-14" difficulty="Moyen">
            <div className="grid lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div>
                        <p className="text-slate-600 mb-2">
                            Un ossement est retrouvé dans une grotte ornée.
                            Son activité radioactive résiduelle <span className="font-mono font-bold">A(t)</span> est mesurée à <span className="text-indigo-600 font-bold">35%</span> de l'activité initiale <span className="font-mono">A₀</span> (soit 0.35).
                        </p>
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-sm text-indigo-800">
                            <strong>Donnée :</strong> Demi-vie du C-14, <span className="font-mono">t<sub>1/2</sub> = 5730 ans</span>.
                            <br />
                            Utilisez le graphique ci-contre pour estimer l'âge de l'échantillon.
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <label className="font-bold text-slate-700 block">Âge estimé (années) :</label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                value={userAge}
                                onChange={e => setUserAge(e.target.value)}
                                className="flex-1 border-2 border-slate-200 rounded-lg p-3 font-bold text-lg outline-none focus:border-indigo-500"
                                placeholder="Ex: 5000"
                            />
                            <button onClick={check} className="bg-indigo-600 text-white px-6 rounded-lg font-bold hover:bg-indigo-700">
                                Valider
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {feedback !== 'idle' && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className={`p-4 rounded-xl font-bold ${feedback === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {feedback === 'correct'
                                    ? "Bravo ! L'âge est d'environ 8700 ans."
                                    : "Incorrect. Vérifiez votre lecture graphique pour A/A0 = 0.35. Ou utilisez la formule t = -ln(0.35)/(ln(2)/5730)."}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="h-[300px] w-full bg-slate-50 rounded-xl border border-slate-200 p-4 relative">
                    <p className="absolute top-2 left-4 text-xs font-bold text-slate-400 z-10">Courbe de Décroissance Radio active</p>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={true} horizontal={true} />
                            <XAxis
                                dataKey="t"
                                label={{ value: 'Temps (années)', position: 'insideBottomRight', offset: -5 }}
                                type="number"
                                domain={[0, 20000]}
                                tickCount={11}
                            />
                            <YAxis
                                label={{ value: 'A / A0', angle: -90, position: 'insideLeft' }}
                                domain={[0, 1]}
                                tickCount={11}
                            />
                            <Tooltip
                                formatter={(value: number) => [value.toFixed(2), "Activité"]}
                                labelFormatter={(label) => `${label} ans`}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Area type="monotone" dataKey="activity" stroke="#4f46e5" fill="#c7d2fe" strokeWidth={3} />

                            {/* Target Line Hint - maybe visible on hover? No, let user search. */}
                            <Line type="monotone" dataKey={() => 0.35} stroke="#ef4444" strokeDasharray="5 5" dot={false} strokeWidth={1} />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <div className="absolute top-1/2 left-16 right-4 border-t border-red-500/30 pointer-events-none flex justify-end">
                        <span className="text-xs text-red-500 bg-white px-1 -mt-2">0.35</span>
                    </div>
                </div>
            </div>
        </ExerciseCard>
    );
};

// --- Challenge 2: Aston's Curve Analysis ---
const StabilityChallenge = () => {
    // Conceptual Question on Fission/Fusion energy
    // U-235 (A=235, El/A ~ 7.6 MeV) -> Sr-94 (8.6 MeV) + Xe-140 (8.4 MeV) + n
    // Energy released = Delta(El)
    // E_final = 94*8.6 + 140*8.4 = 808.4 + 1176 = 1984.4 MeV
    // E_initial = 235*7.6 = 1786 MeV
    // Released = 198.4 MeV.

    // We will ask user to calculate this approx energy given the curve values.

    const [userEnergy, setUserEnergy] = useState('');
    const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>('idle');

    const check = () => {
        const val = parseFloat(userEnergy);
        if (val >= 180 && val <= 220) setFeedback('correct');
        else setFeedback('incorrect');
    }

    return (
        <ExerciseCard title="Analyse Énergétique : Fission" difficulty="Difficile">
            <div className="flex flex-col gap-6">
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <TrendingDown size={20} /> Courbe d'Aston (Simplifiée)
                    </h4>

                    {/* Simplified Aston Diagram (Canvas or SVG) */}
                    <div className="relative h-48 w-full bg-white border border-slate-300 rounded-lg overflow-hidden">
                        <svg viewBox="0 0 400 150" className="w-full h-full">
                            {/* Axes */}
                            <line x1="40" y1="130" x2="380" y2="130" stroke="#64748b" />
                            <line x1="40" y1="130" x2="40" y2="20" stroke="#64748b" />

                            {/* Curve */}
                            <path
                                d="M40,130 Q60,20 100,30 T380,60"
                                fill="none" stroke="#3b82f6" strokeWidth="3"
                            />

                            {/* Points of interest */}
                            {/* Fe-56 (Peak) */}
                            <circle cx="100" cy="30" r="4" fill="#ef4444" />
                            <text x="100" y="20" fontSize="10" textAnchor="middle" fill="#ef4444">Fe-56 (~8.8 MeV)</text>

                            {/* U-235 (Heavy) */}
                            <circle cx="340" cy="55" r="4" fill="#ef4444" />
                            <text x="340" y="45" fontSize="10" textAnchor="middle" fill="#ef4444">U-235 (7.6 MeV)</text>

                            {/* Products (Middle) */}
                            <circle cx="180" cy="35" r="4" fill="#10b981" />
                            <text x="180" y="25" fontSize="10" textAnchor="middle" fill="#10b981">Sr-94 (8.6 MeV)</text>

                            <circle cx="230" cy="38" r="4" fill="#10b981" />
                            <text x="230" y="28" fontSize="10" textAnchor="middle" fill="#10b981">Xe-140 (8.4 MeV)</text>

                            {/* Labels */}
                            <text x="380" y="145" fontSize="10" textAnchor="end" fill="#64748b">Nombre de masse A</text>
                            <text x="20" y="80" fontSize="10" textAnchor="middle" fill="#64748b" transform="rotate(-90 20,80)">El / A (MeV)</text>
                        </svg>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                    <div className="flex-1 space-y-4">
                        <p className="text-slate-600 text-sm">
                            On considère la réaction de fission de l'Uranium 235 :
                            <br />
                            <span className="font-mono font-bold bg-slate-100 p-1 rounded">U(235) + n &rarr; Sr(94) + Xe(140) + 2n</span>
                        </p>
                        <ul className="text-sm space-y-1 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                            <li><span className="font-bold text-slate-700">El/A (U-235)</span> ≈ 7.6 MeV/nucléon</li>
                            <li><span className="font-bold text-slate-700">El/A (Sr-94)</span> ≈ 8.6 MeV/nucléon</li>
                            <li><span className="font-bold text-slate-700">El/A (Xe-140)</span> ≈ 8.4 MeV/nucléon</li>
                        </ul>
                    </div>

                    <div className="flex-1 flex flex-col justify-end space-y-3">
                        <p className="font-bold text-slate-800 text-sm">
                            Calculez l'énergie libérée (en MeV) par cette réaction.
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                value={userEnergy}
                                onChange={e => setUserEnergy(e.target.value)}
                                className="border-2 border-slate-200 rounded-lg p-3 w-full font-bold focus:border-indigo-500 outline-none"
                                placeholder="E libérée = ?"
                            />
                            <button onClick={check} className="bg-indigo-600 text-white px-6 rounded-lg font-bold hover:bg-indigo-700 whitespace-nowrap">
                                Vérifier
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">
                            Rappel : E_libérée = E_liaison(final) - E_liaison(initial).
                            <br />E_liaison(X) = A * (El/A).
                        </p>
                    </div>
                </div>

                <AnimatePresence>
                    {feedback !== 'idle' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-4 rounded-xl font-bold text-sm ${feedback === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {feedback === 'correct'
                                ? "Correct ! E ≈ 200 MeV. C'est l'énergie typique d'une fission nucléaire."
                                : "Erreur. Calculez (94*8.6 + 140*8.4) - (235*7.6)."}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ExerciseCard>
    );
};

export const NuclearAdvancedExercises: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-gradient-to-r from-emerald-900 to-teal-800 p-8 rounded-3xl text-white shadow-2xl mb-12">
                <h2 className="text-3xl font-extrabold mb-4 flex items-center gap-3">
                    <Atom className="animate-spin-slow" size={32} /> Défis Nucléaires
                </h2>
                <p className="text-emerald-100 text-lg max-w-2xl">
                    Appliquez vos connaissances sur la radioactivité et l'énergie nucléaire dans des contextes réalistes.
                </p>
            </div>

            <DatingChallenge />
            <StabilityChallenge />

            <div className="pt-12 border-t border-slate-200">
                <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Activity className="text-emerald-600" /> Entraînement Fondamental (QCM)
                </h2>
                <StandardNuclearExercises />
            </div>
        </div>
    );
};
