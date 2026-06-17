/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LightExercises as StandardLightExercises } from '../LightExercises';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanEye, Ruler, CheckCircle2, XCircle, ChevronRight, Calculator, Maximize, Triangle, Brain, Activity } from 'lucide-react';


// --- Shared Components ---
const ExerciseCard = ({ title, difficulty, children }: { title: string, difficulty: string, children: React.ReactNode }) => (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mb-8">
        <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><ScanEye size={20} /></span>
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

const interferenceFringeClasses = [
    '-translate-x-[300px] opacity-[0.1054]',
    '-translate-x-[270px] opacity-[0.1616]',
    '-translate-x-[240px] opacity-[0.2369]',
    '-translate-x-[210px] opacity-[0.3320]',
    '-translate-x-[180px] opacity-[0.4449]',
    '-translate-x-[150px] opacity-[0.5698]',
    '-translate-x-[120px] opacity-[0.6977]',
    '-translate-x-[90px] opacity-[0.8167]',
    '-translate-x-[60px] opacity-[0.9139]',
    '-translate-x-[30px] opacity-[0.9778]',
    'translate-x-0 opacity-[1.0000]',
    'translate-x-[30px] opacity-[0.9778]',
    'translate-x-[60px] opacity-[0.9139]',
    'translate-x-[90px] opacity-[0.8167]',
    'translate-x-[120px] opacity-[0.6977]',
    'translate-x-[150px] opacity-[0.5698]',
    'translate-x-[180px] opacity-[0.4449]',
    'translate-x-[210px] opacity-[0.3320]',
    'translate-x-[240px] opacity-[0.2369]',
    'translate-x-[270px] opacity-[0.1616]',
    'translate-x-[300px] opacity-[0.1054]',
];

// --- Challenge 1: The Unknown Prism ---
const PrismChallenge = () => {
    const [userIdx, setUserIdx] = useState('');
    const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>('idle');

    // Data
    // A = 60°
    // i = 45°
    // D_measured = 37.2° (approx for n=1.5)
    // Formula: D = i + i' - A
    // sin(i) = n sin(r)
    // sin(i') = n sin(r')
    // r + r' = A
    // 
    // Let's reverse:
    // n = 1.6 (Flint glass)
    // A = 60
    // i = 50
    // sin(r) = sin(50)/1.6 = 0.766/1.6 = 0.478 => r = 28.6
    // r' = A - r = 60 - 28.6 = 31.4
    // sin(i') = 1.6 * sin(31.4) = 1.6 * 0.521 = 0.833 => i' = 56.4
    // D = i + i' - A = 50 + 56.4 - 60 = 46.4 degrees.

    // Let's randomize slightly or fix it for complexity? Fixed is better for visual consistency.
    const A = 60;
    const i = 50;
    const D_val = 46.4;
    const n_target = 1.6;

    const check = () => {
        const val = parseFloat(userIdx.replace(',', '.'));
        if (Math.abs(val - n_target) < 0.05) setFeedback('correct');
        else setFeedback('incorrect');
    };

    return (
        <ExerciseCard title="Enquête : Le Prisme Mystère" difficulty="Difficile">
            <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1 space-y-6">
                    <p className="text-slate-600">
                        Un faisceau lumineux monochromatique frappe un prisme d'angle au sommet <span className="font-bold">A = {A}°</span> avec un angle d'incidence <span className="font-bold">i = {i}°</span>.
                        <br />
                        Le schéma ci-contre montre la marche du rayon.
                    </p>

                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-900 text-sm">
                        <h4 className="font-bold mb-2 flex items-center gap-2"><Calculator size={16} /> Données Relevées :</h4>
                        <ul className="space-y-1 font-mono">
                            <li>Angle incidence i : {i}.0°</li>
                            <li>Angle déviation D : {D_val}°</li>
                            <li>Angle sommet A : {A}.0°</li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <p className="text-sm font-bold text-slate-700">
                            Question : Déterminez l'indice de réfraction <span className="italic">n</span> de ce verre.
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                step="0.01"
                                value={userIdx}
                                onChange={e => setUserIdx(e.target.value)}
                                className="border-2 border-slate-200 rounded-lg p-3 w-32 font-bold focus:border-amber-500 outline-none"
                                placeholder="n = ?"
                            />
                            <button type="button" onClick={check} className="bg-amber-600 text-white px-6 rounded-lg font-bold hover:bg-amber-700 transition-colors">
                                Vérifier
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">Conseil : Retrouvez d'abord i' à partir de D, i et A. Puis remontez à n.</p>
                    </div>

                    <AnimatePresence>
                        {feedback !== 'idle' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-xl text-sm ${feedback === 'correct' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                                <h5 className="font-bold mb-1">{feedback === 'correct' ? 'Correct ! (Verre Flint n=1.6)' : 'Incorrect.'}</h5>
                                {feedback === 'incorrect' && (
                                    <p>
                                        1. D = i + i' - A &rArr; i' = D + A - i = {D_val} + 60 - 50 = 56.4°<br />
                                        2. La loi de Snell en sortie : n.sin(r') = sin(i'). On ne connait pas r'...<br />
                                        3. Mais r + r' = A. Et sin(i) = n.sin(r).<br />
                                        C'est un système ! Ou plus simple : testez les valeurs.
                                        <br />
                                        Astuce : r' = A - r. sin(i') = n.sin(A-r).
                                    </p>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="bg-slate-900 rounded-xl p-8 flex items-center justify-center relative min-h-[300px] flex-1">
                    {/* SVG Diagram of Prism */}
                    <svg viewBox="0 0 300 200" className="w-full drop-shadow-2xl">
                        <defs>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        {/* Prism Triangle */}
                        <path d="M150,20 L250,180 L50,180 Z" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />

                        {/* Normal lines */}
                        <line x1="100" y1="100" x2="60" y2="60" stroke="#94a3b8" strokeDasharray="4 4" />

                        {/* Incoming Ray (i=50) */}
                        <line x1="20" y1="120" x2="90" y2="115" stroke="#ef4444" strokeWidth="2" filter="url(#glow)" />

                        {/* Inside Ray */}
                        <line x1="90" y1="115" x2="190" y2="115" stroke="#ef4444" strokeWidth="2" strokeOpacity="0.8" />

                        {/* Outgoing Ray */}
                        <line x1="190" y1="115" x2="280" y2="160" stroke="#ef4444" strokeWidth="2" filter="url(#glow)" />

                        {/* Deviation Extension */}
                        <line x1="90" y1="115" x2="250" y2="100" stroke="#ef4444" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />

                        {/* Labels */}
                        <text x="145" y="50" fill="white" fontSize="12">A</text>
                        <text x="50" y="100" fill="white" fontSize="12">i</text>
                        <text x="250" y="140" fill="white" fontSize="12">D</text>
                    </svg>
                </div>
            </div>
        </ExerciseCard>
    );
}

// --- Challenge 2: Interference Analysis ---
const InterferenceChallenge = () => {
    // Scenario:
    // Screen shows interference pattern.
    // Ruler provided.
    // D = 2m
    // a = 0.5mm
    // Measure 10*i (width of 10 fringes).
    // Calculate lambda.

    // Setup:
    // Wavelength = 650nm (Red)
    // i = wavelength * D / a = 650e-9 * 2 / 0.5e-3 = 1300e-6 * 2 = 2.6e-3 m = 2.6 mm.
    // 10*i = 26 mm.

    // On screen representation:
    // Let's say 1 px = 0.1 mm.
    // 26 mm = 260 px width.
    const [measurePx, setMeasurePx] = useState(0); // User drags ruler
    const [userLambda, setUserLambda] = useState('');
    const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>('idle');

    // Ruler State
    const [rulerX, setRulerX] = useState(50);

    const check = () => {
        const val = parseFloat(userLambda);
        // Target 650 +/- 20
        if (val >= 630 && val <= 670) setFeedback('correct');
        else setFeedback('incorrect');
    }

    return (
        <ExerciseCard title="Analyse : Fentes de Young" difficulty="Moyen">
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-4">
                        <p className="text-slate-600">
                            Fentes de Young. Largeur fentes <span className="font-bold">a = 0.5 mm</span>. Distance écran <span className="font-bold">D = 2.0 m</span>.
                            <br />
                            L'image ci-dessous est à l'<span className="font-bold text-indigo-600">échelle 1:1</span> (simulée).
                        </p>
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                            <h4 className="font-bold text-indigo-900 mb-2">Instructions :</h4>
                            <ol className="list-decimal list-inside text-sm text-indigo-800 space-y-1">
                                <li>Utilisez la règle (déplaçable) pour mesurer la largeur <span className="font-mono">L</span> de <span className="font-bold">10 interfranges</span>.</li>
                                <li>Déduisez la valeur de l'interfrange <span className="font-mono">i</span>.</li>
                                <li>Calculez la longueur d'onde <span className="font-mono">λ</span> en nm.</li>
                            </ol>
                        </div>
                    </div>
                    <div className="flex-1 flex items-end gap-2">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Longueur d'onde λ (nm)</label>
                            <input
                                type="number"
                                className="w-full border-2 border-slate-200 rounded-lg p-3 font-bold text-lg outline-none focus:border-indigo-500"
                                placeholder="Ex: 500"
                                value={userLambda}
                                onChange={e => setUserLambda(e.target.value)}
                            />
                        </div>
                        <button type="button" onClick={check} className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 h-[52px]">
                            Valider
                        </button>
                    </div>
                </div>

                {/* Visualization Area */}
                <div className="relative bg-black h-48 rounded-xl shadow-inner border-4 border-slate-700 overflow-hidden cursor-crosshair select-none">
                    {/* Fringes Pattern */}
                    {/* i = 2.6 mm. Let's make 1cm = 40px scale? 
                         If 1cm = 40px, then 2.6mm = 0.26cm = 10.4px.
                         10 fringes = 104px. That's a bit small.
                         Let's Zoom. 5x Zoom.
                         10 fringes = 520px. Too big for container.
                         Let's set i_visual = 30px. 
                         10 fringes = 300px.
                         Real scale factor: 30px = 2.6mm. 
                         1px = 0.0866 mm.
                         Ruler needs to match this.
                     */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        {interferenceFringeClasses.map((fringeClass, idx) => (
                            <div
                                key={idx}
                                className={`absolute left-1/2 w-4 h-32 bg-red-600 blur-sm rounded-full ${fringeClass}`}
                            />
                        ))}
                    </div>
                    <div className="absolute top-2 left-2 text-xs text-red-500 font-mono">LASER λ = ?</div>

                    {/* Draggable Ruler */}
                    <motion.div
                        drag="x"
                        dragMomentum={false}
                        dragConstraints={{ left: -100, right: 400 }}
                        className="absolute top-1/2 -translate-y-1/2 h-16 w-[310px] bg-yellow-300/90 border border-yellow-600 rounded shadow-xl flex flex-col cursor-grab active:cursor-grabbing"
                    >
                        <div className="flex-1 flex items-end px-2 border-b border-black/20 pb-1">
                            {/* Ticks. We need to match scale. 
                                 Visual i = 30px. Real i = 2.6mm.
                                 So 30px = 2.6mm.
                                 1mm = 30/2.6 = 11.538 px.
                                 Let's draw mm ticks.
                             */}
                            {Array.from({ length: 27 }).map((_, i) => (
                                <div key={i} className="flex-1 h-3 border-r border-black/50 relative">
                                    {i % 5 === 0 && <span className="absolute -top-4 -right-1 text-[9px] font-bold text-black">{i}</span>}
                                </div>
                            ))}
                        </div>
                        <div className="h-4 bg-yellow-400 text-[10px] flex items-center justify-center font-bold text-yellow-800 uppercase tracking-widest">
                            Règle (mm)
                        </div>
                    </motion.div>
                </div>

                <AnimatePresence>
                    {feedback !== 'idle' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-4 rounded-xl font-bold ${feedback === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {feedback === 'correct'
                                ? "Bravo ! λ = (a × i) / D ≈ 650 nm."
                                : "Erreur. Mesurez bien la distance de 10 franges (pics lumineux rouges) pour avoir '10i' en mm. Puis appliquez λ = a.i/D."}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ExerciseCard>
    );
}

export const LightAdvancedExercises: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-gradient-to-r from-violet-900 to-fuchsia-800 p-8 rounded-3xl text-white shadow-2xl mb-12">
                <h2 className="text-3xl font-extrabold mb-4 flex items-center gap-3">
                    <Brain className="skew-y-3" size={32} /> Investigation Optique
                </h2>
                <p className="text-indigo-100 text-lg max-w-2xl">
                    Analysez des phénomènes lumineux complexes. Mesurez, calculez et déduisez les propriétés de la matière.
                </p>
            </div>

            <PrismChallenge />
            <InterferenceChallenge />

            <div className="pt-12 border-t border-slate-200">
                <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Activity className="text-indigo-600" /> Entraînement Fondamental (QCM)
                </h2>
                <StandardLightExercises />
            </div>
        </div>
    );
};
