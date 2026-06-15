/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, RefreshCw, HelpCircle, Target, BarChart, Calculator, Zap } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { DifficultyBadge, type ExerciseState } from '../../../../shared/DifficultyBadge';

// --- Exercise 1: Composition & Binding Energy ---
const UraniumExercise = () => {
    const [inputs, setInputs] = useState({ p: '', n: '', binding: '' });
    const [status, setStatus] = useState<ExerciseState>('idle');
    const { examMode } = useSettings();

    // Constants
    const mp = 1.00728;
    const mn = 1.00866;
    const mU = 234.9935;
    const c2 = 931.5;

    const checkAnswer = () => {
        const p = parseInt(inputs.p);
        const n = parseInt(inputs.n);
        const userEl = parseFloat(inputs.binding);

        // Theoretical
        const massDefect = (92 * mp + (235 - 92) * mn) - mU;
        const El = massDefect * c2; // ~1783 MeV

        if (p === 92 && n === 143 && Math.abs(userEl - El) < 50) {
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
                        <h4 className="font-bold text-slate-800 text-lg">Exercice 1 : Le Noyau d'Uranium 235</h4>
                        <DifficultyBadge level="Facile" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Target size={14} />
                        <span>Objectif : Calculer le défaut de masse et l'énergie de liaison.</span>
                    </div>
                </div>
            </div>

            <p className="text-sm text-slate-600 mb-6 bg-slate-50 p-4 rounded-lg">
                Considérons l'isotope <strong><sup>235</sup>U</strong>. Déterminez sa composition et son énergie de liaison approximative (en MeV).
                <br /><br />
                <span className="text-xs font-mono text-slate-500 block border-t border-slate-200 pt-2 mt-2">
                    Données : mp = 1.0073 u, mn = 1.0087 u, m(U) = 234.9935 u, 1u = 931.5 MeV/c²
                </span>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Protons (Z)</label>
                    <input
                        type="number"
                        className="w-full border-2 border-slate-200 rounded-lg p-3 font-mono focus:border-indigo-500 outline-none transition-colors"
                        placeholder="92"
                        value={inputs.p}
                        onChange={e => setInputs({ ...inputs, p: e.target.value })}
                    />
                </div>
                <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Neutrons (N)</label>
                    <input
                        type="number"
                        className="w-full border-2 border-slate-200 rounded-lg p-3 font-mono focus:border-indigo-500 outline-none transition-colors"
                        placeholder="143"
                        value={inputs.n}
                        onChange={e => setInputs({ ...inputs, n: e.target.value })}
                    />
                </div>
                <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Énergie Eℓ (MeV)</label>
                    <input
                        type="number"
                        className="w-full border-2 border-slate-200 rounded-lg p-3 font-mono focus:border-indigo-500 outline-none transition-colors"
                        placeholder="Ex: 1780"
                        value={inputs.binding}
                        onChange={e => setInputs({ ...inputs, binding: e.target.value })}
                    />
                </div>
            </div>

            <div className="flex justify-end">
                {status === 'idle' && (
                    <button type="button" onClick={checkAnswer} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors text-sm">
                        Vérifier mes réponses
                    </button>
                )}
            </div>

            {status === 'correct' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-lg text-sm">
                    <div className="flex items-start gap-3">
                        <Check className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                        <div>
                            <p className="font-bold mb-1">Excellent travail !</p>
                            {!examMode && (
                                <p>
                                    Composition : Z=92, N=235-92=143.<br />
                                    Défaut de masse Δm ≈ 1.914 u.<br />
                                    Eℓ = Δm × 931.5 ≈ 1783 MeV.
                                </p>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {status === 'incorrect' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-lg text-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <X className="mt-0.5 shrink-0 text-rose-600" size={18} />
                        <div>
                            <p className="font-bold mb-1">Attention aux calculs</p>
                            {!examMode && <p>Vérifiez N = A - Z. Pour l'énergie, n'oubliez pas de multiplier le défaut de masse par 931.5.</p>}
                        </div>
                    </div>
                    <button type="button" onClick={() => setStatus('idle')} className="text-rose-600 font-bold hover:underline text-xs bg-white px-3 py-2 rounded border border-rose-200">Réessayer</button>
                </motion.div>
            )}
        </div>
    );
};

// --- Exercise 2: Fission Equation ---
const FissionExercise = () => {
    const [xVal, setXVal] = useState('');
    const [status, setStatus] = useState<ExerciseState>('idle');
    const { examMode } = useSettings();

    const check = () => {
        if (xVal.trim() === '2') setStatus('correct');
        else setStatus('incorrect');
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6 border-b border-slate-100 pb-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-bold text-slate-800 text-lg">Exercice 2 : Équation de Fission</h4>
                        <DifficultyBadge level="Moyen" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Target size={14} />
                        <span>Objectif : Appliquer les lois de conservation de Soddy.</span>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6 text-center overflow-x-auto shadow-inner">
                <span className="font-serif text-xl md:text-3xl text-slate-800 whitespace-nowrap inline-block py-2">
                    <sup>235</sup><sub>92</sub>U + <sup>1</sup><sub>0</sub>n &rarr; <sup>94</sup><sub>38</sub>Sr + <sup>140</sup><sub>54</sub>Xe + <span className="text-orange-600 font-bold bg-orange-100 px-2 rounded border border-orange-300 mx-1">x</span> <sup>1</sup><sub>0</sub>n
                </span>
            </div>

            <p className="text-sm text-slate-600 mb-4">
                Lors de cette réaction de fission dans une centrale, des neutrons sont émis. En utilisant la conservation du nombre de masse (A), déterminez la valeur de <strong>x</strong>.
            </p>

            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 w-fit">
                <span className="text-sm font-bold text-slate-500">Nombre de neutrons (x) :</span>
                <input
                    type="number"
                    className="w-20 border-2 border-slate-200 rounded-lg p-2 text-center font-bold text-lg focus:border-orange-500 outline-none"
                    placeholder="?"
                    value={xVal}
                    onChange={e => setXVal(e.target.value)}
                />
                <button type="button" onClick={check} className="bg-orange-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-700 transition-colors shadow-sm">
                    Valider
                </button>
            </div>

            {status === 'correct' && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex items-center gap-3">
                    <div className="bg-emerald-100 p-1 rounded-full"><Check size={16} className="text-emerald-700" /></div>
                    <div className="text-emerald-800 text-sm">
                        <span className="font-bold block">C'est exact !</span>
                        {!examMode && "Conservation de A : 235 + 1 = 94 + 140 + x(1) \u21D2 236 = 234 + x \u21D2 x = 2."}
                    </div>
                </motion.div>
            )}
            {status === 'incorrect' && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-rose-50 border border-rose-100 p-4 rounded-lg flex items-center gap-3">
                    <div className="bg-rose-100 p-1 rounded-full"><X size={16} className="text-rose-700" /></div>
                    <div className="text-rose-800 text-sm">
                        <span className="font-bold block">Erreur de calcul</span>
                        {!examMode && "Faites la somme des nombres de masse (A) à gauche : 235+1 = 236. Puis à droite : 94+140 = 234. Combien manque-t-il ?"}
                    </div>
                </motion.div>
            )}
        </div>
    );
};

// --- Exercise 3: Decay Identification ---
const DecayExercise = () => {
    const [choice, setChoice] = useState<string | null>(null);
    const [isCorrect, setIsCorrect] = useState(false);
    const { examMode } = useSettings();

    const options = [
        { id: 'alpha', label: 'Radioactivité α (Alpha)', correct: false },
        { id: 'beta-minus', label: 'Radioactivité β⁻ (Bêta Moins)', correct: true },
        { id: 'beta-plus', label: 'Radioactivité β⁺ (Bêta Plus)', correct: false },
    ];

    const handleSelect = (id: string, correct: boolean) => {
        setChoice(id);
        setIsCorrect(correct);
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6 border-b border-slate-100 pb-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-bold text-slate-800 text-lg">Exercice 3 : Identification de Désintégration</h4>
                        <DifficultyBadge level="Facile" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Target size={14} />
                        <span>Objectif : Identifier le type de radioactivité à partir de l'équation.</span>
                    </div>
                </div>
            </div>

            <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 mb-6 text-center">
                <p className="text-sm text-purple-900 mb-2 font-medium">Transformation du Cobalt en Nickel :</p>
                <span className="font-serif text-2xl md:text-3xl text-slate-900 font-bold">
                    <sup>60</sup><sub>27</sub>Co &rarr; <sup>60</sup><sub>28</sub>Ni + ...
                </span>
            </div>

            <p className="text-sm text-slate-600 mb-4">
                Observez l'évolution des nombres Z et A. Quelle particule doit être émise pour conserver la charge ? De quel type de radioactivité s'agit-il ?
            </p>

            <div className="grid grid-cols-1 gap-3">
                {options.map(opt => (
                    <button type="button"
                        key={opt.id}
                        onClick={() => handleSelect(opt.id, opt.correct)}
                        className={`p - 4 rounded - lg text - left font - medium border - 2 transition - all flex justify - between items - center ${choice === opt.id
                                ? (opt.correct ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-rose-500 bg-rose-50 text-rose-800')
                                : 'border-slate-100 hover:border-purple-200 hover:bg-purple-50 text-slate-600'
                            } `}
                    >
                        <span>{opt.label}</span>
                        {choice === opt.id && (
                            opt.correct ? <Check size={20} className="text-emerald-600" /> : <X size={20} className="text-rose-600" />
                        )}
                    </button>
                ))}
            </div>

            {choice && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`mt - 4 text - sm p - 4 rounded - lg border ${isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'} `}>
                    {isCorrect ? (
                        <>
                            <p className="font-bold mb-1">Explication Correcte :</p>
                            {examMode ? "Bien joué." : (
                                <span>
                                    Le nombre de masse A est conservé (60). Le nombre de charge Z augmente de 1 (27 &rarr; 28).
                                    Pour compenser, il faut émettre une particule de charge -1 (un électron).
                                    C'est la signature de la <strong>radioactivité β⁻</strong>.
                                </span>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="font-bold mb-1">Incorrect.</p>
                            {examMode ? "Essayez encore." : (
                                <span>
                                    Regardez le numéro atomique Z : il passe de 27 à 28. Il a augmenté.
                                    Quelle particule (α, e⁻ ou e⁺) permet de conserver la charge totale ? (27 = 28 + ?)
                                </span>
                            )}
                        </>
                    )}
                </motion.div>
            )}
        </div>
    );
};

// --- Exercise 4: Energy Calculation (New) ---
const EnergyExercise = () => {
    const [energy, setEnergy] = useState('');
    const [status, setStatus] = useState<ExerciseState>('idle');
    const { examMode } = useSettings();

    // Constants
    // Reaction: 2H + 3H -> 4He + n
    // Mass H2: 2.01355 u
    // Mass H3: 3.01550 u
    // Mass He4: 4.00150 u
    // Mass n: 1.00866 u
    const mH2 = 2.01355;
    const mH3 = 3.01550;
    const mHe4 = 4.00150;
    const mn = 1.00866;
    const c2 = 931.5;

    const checkAnswer = () => {
        const val = parseFloat(energy.replace(',', '.'));

        const massReactants = mH2 + mH3;
        const massProducts = mHe4 + mn;
        const deltaM = massReactants - massProducts; // mass lost
        const theoreticalE = deltaM * c2; // MeV

        // approx 17.6 MeV. Allow margin.
        if (val >= 17.4 && val <= 17.8) {
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
                        <h4 className="font-bold text-slate-800 text-lg">Exercice 4 : Énergie Libérée (Fusion)</h4>
                        <DifficultyBadge level="Moyen" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Zap size={14} />
                        <span>Objectif : Calculer l'énergie libérée par une réaction de fusion.</span>
                    </div>
                </div>
            </div>

            <div className="bg-sky-50 p-4 rounded-xl border border-sky-100 mb-6 text-center">
                <span className="font-serif text-xl md:text-2xl text-slate-800 font-bold">
                    <sup>2</sup><sub>1</sub>H + <sup>3</sup><sub>1</sub>H &rarr; <sup>4</sup><sub>2</sub>He + <sup>1</sup><sub>0</sub>n
                </span>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="text-sm text-slate-600 space-y-2">
                    <p className="font-bold text-slate-700 mb-2">Données (masses en u) :</p>
                    <ul className="space-y-1 font-mono text-xs bg-slate-50 p-3 rounded border border-slate-100">
                        <li className="flex justify-between"><span>m(<sup>2</sup>H)</span> <span>2.01355 u</span></li>
                        <li className="flex justify-between"><span>m(<sup>3</sup>H)</span> <span>3.01550 u</span></li>
                        <li className="flex justify-between"><span>m(<sup>4</sup>He)</span> <span>4.00150 u</span></li>
                        <li className="flex justify-between"><span>m(n)</span> <span>1.00866 u</span></li>
                    </ul>
                    <p className="text-xs mt-2 italic">1 u = 931.5 MeV/c²</p>
                </div>

                <div className="flex flex-col justify-center gap-4">
                    <p className="text-sm text-slate-600">
                        Calculez la perte de masse Δm puis l'énergie libérée E<sub>lib</sub> en MeV.
                    </p>
                    <div className="flex gap-3">
                        <input
                            type="number"
                            step="0.1"
                            className="flex-1 border-2 border-slate-200 rounded-lg p-3 font-mono focus:border-sky-500 outline-none transition-colors"
                            placeholder="Résultat en MeV"
                            value={energy}
                            onChange={e => setEnergy(e.target.value)}
                        />
                        <button type="button" onClick={checkAnswer} className="bg-sky-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-sky-700 transition-colors shadow-sm">
                            Vérifier
                        </button>
                    </div>
                </div>
            </div>

            {status === 'correct' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-lg text-sm">
                    <div className="flex items-start gap-3">
                        <Check className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                        <div>
                            <p className="font-bold mb-1">Bravo !</p>
                            {!examMode && (
                                <p>
                                    Δm = (2.01355 + 3.01550) - (4.00150 + 1.00866) = 0.01889 u.<br />
                                    E<sub>lib</sub> = 0.01889 × 931.5 ≈ <strong>17.6 MeV</strong>.
                                </p>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {status === 'incorrect' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-lg text-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <X className="mt-0.5 shrink-0 text-rose-600" size={18} />
                        <div>
                            <p className="font-bold mb-1">Erreur de résultat</p>
                            {!examMode && <p>Avez-vous bien soustrait la masse des produits à celle des réactifs ? (m_avant - m_après)</p>}
                        </div>
                    </div>
                    <button type="button" onClick={() => setStatus('idle')} className="text-rose-600 font-bold hover:underline text-xs bg-white px-3 py-2 rounded border border-rose-200">Réessayer</button>
                </motion.div>
            )}
        </div>
    );
};

export const NuclearExercises: React.FC = () => {
    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <UraniumExercise />
            <FissionExercise />
            <EnergyExercise />
            <DecayExercise />
        </div>
    );
};
