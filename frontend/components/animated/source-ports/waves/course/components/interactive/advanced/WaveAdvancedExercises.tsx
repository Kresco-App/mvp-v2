/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Ruler, CheckCircle2, XCircle, Calculator, Waves, ArrowRight, HelpCircle, ScanEye } from 'lucide-react';

// --- Shared Types & Components ---
type FeedbackState = 'idle' | 'correct' | 'incorrect';

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

// --- Challenge 1: The Sonar (Oscilloscope) ---
const SonarChallenge = () => {
    const [cursor1, setCursor1] = useState(50); // px
    const [cursor2, setCursor2] = useState(200); // px
    const [userDepth, setUserDepth] = useState('');
    const [feedback, setFeedback] = useState<FeedbackState>('idle');

    // Physics Constants
    const vWater = 1500; // m/s
    const scaleMsPerPx = 0.5; // 0.5 ms per pixel
    const emissionT = 20; // ms (start of emission)
    const receptionT = 85; // ms (start of reception) -> Delta = 65ms
    // Depth = v * t / 2 = 1500 * 0.065 / 2 = 48.75m

    // Canvas Draw
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const drawScope = useCallback(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;

        // Bg
        ctx.fillStyle = '#1e293b'; // Slate-800
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < width; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = 0; y < height; y += 50) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();

        // Trace
        ctx.strokeStyle = '#34d399'; // Emerald-400
        ctx.lineWidth = 2;
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#34d399';
        ctx.beginPath();

        ctx.moveTo(0, height / 2);
        for (let x = 0; x < width; x++) {
            const t = x * scaleMsPerPx; // ms
            let y = 0;

            // Emission Pulse
            if (t > emissionT && t < emissionT + 5) {
                y += Math.sin((t - emissionT) * 2) * 60 * Math.exp(-(t - emissionT) / 2);
            }
            // Reception Pulse (Attenuated)
            if (t > receptionT && t < receptionT + 5) {
                y += Math.sin((t - receptionT) * 2) * 30 * Math.exp(-(t - receptionT) / 2);
            }

            // Noise
            y += (Math.random() - 0.5) * 2;

            ctx.lineTo(x, height / 2 - y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Cursors
        [cursor1, cursor2].forEach((c, i) => {
            const color = i === 0 ? '#f472b6' : '#60a5fa'; // Pink / Blue
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, height); ctx.stroke();
            ctx.setLineDash([]);

            // Handle
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(c, 20, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '10px bold sans-serif';
            ctx.fillText(i === 0 ? "T1" : "T2", c - 6, 10);
        });

    }, [cursor1, cursor2]);

    useEffect(() => drawScope(), [drawScope]);

    // Check Logic
    const validate = () => {
        const val = parseFloat(userDepth);
        if (val >= 48 && val <= 49.5) setFeedback('correct');
        else setFeedback('incorrect');
    }

    // Interaction Handlers
    const handleDrag = (e: React.MouseEvent, id: 1 | 2) => {
        // Simple click-jump for now, simpler than drag impl
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (id === 1) setCursor1(x);
        else setCursor2(x);
    }

    const measuredDeltaT = Math.abs(cursor2 - cursor1) * scaleMsPerPx;

    return (
        <ExerciseCard title="Le Sonar Océanique" difficulty="Moyen">
            <div className="grid lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <p className="text-slate-600 leading-relaxed">
                        Un navire envoie une impulsion ultrasonore verticale vers le fond marin.
                        Le signal retour est capté par le même transducteur.
                        <br /><br />
                        Utilisez l'oscilloscope ci-contre pour mesurer le retard temporel $\Delta t$ entre l'émission (E) et la réception (R).
                        <br />
                        <span className="text-sm italic opacity-80">(Déplacez les curseurs T1 et T2 en cliquant sur l'écran pour mesurer).</span>
                    </p>

                    <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 font-mono text-sm space-y-2">
                        <div className="flex justify-between">
                            <span>Vitesse du son (eau) :</span>
                            <span className="font-bold">v = 1500 m/s</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Base de temps :</span>
                            <span className="font-bold">0.5 ms / div (pixel)</span>
                        </div>
                        <div className="h-px bg-slate-200 my-2"></div>
                        <div className="flex justify-between items-center text-indigo-600 font-bold">
                            <span>Δt Mesuré :</span>
                            <span className="text-lg">{measuredDeltaT.toFixed(1)} ms</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Profondeur estimée (m) :</label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                value={userDepth}
                                onChange={e => setUserDepth(e.target.value)}
                                className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none font-bold"
                                placeholder="Ex: 45.2"
                            />
                            <button type="button" onClick={validate} className="bg-indigo-600 text-white px-6 rounded-lg font-bold hover:bg-indigo-700">
                                Vérifier
                            </button>
                        </div>
                    </div>

                    {feedback !== 'idle' && (
                        <div className={`p-4 rounded-xl text-sm font-bold ${feedback === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {feedback === 'correct'
                                ? "Correct ! d = v * Δt / 2 = 1500 * 0.065 / 2 ≈ 48.75m"
                                : "Incorrect. N'oubliez pas que l'onde fait un aller-retour (divisez par 2)."}
                        </div>
                    )}
                </div>

                <div className="relative group">
                    <canvas
                        ref={canvasRef}
                        width={500}
                        height={300}
                        className="w-full bg-slate-800 rounded-xl shadow-inner cursor-crosshair"
                        onClick={(e) => {
                            // Smart cursor selection: move the closest one
                            const rect = canvasRef.current!.getBoundingClientRect();
                            const x = (e.clientX - rect.left) * (500 / rect.width); // Scale coords
                            if (Math.abs(x - cursor1) < Math.abs(x - cursor2)) setCursor1(x);
                            else setCursor2(x);
                        }}
                    />
                    <div className="absolute top-2 right-2 text-[10px] text-emerald-400 font-mono">OSCILLOSCOPE NUMÉRIQUE</div>
                    <div className="absolute bottom-2 left-2 text-[10px] text-slate-500">Cliquez pour déplacer le curseur le plus proche</div>
                </div>
            </div>
        </ExerciseCard>
    );
};

// --- Challenge 2: Tsunami Diffraction ---
const DiffractionChallenge = () => {
    const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
    const [isCorrect, setIsCorrect] = useState(false);

    // Scenario
    // a = 60m (Gap)
    // T = 8s
    // v = 10 m/s (Shallow water)
    // Calculate lambda = v * T = 80m
    // lambda (80) > a (60) ? YES -> Significant diffraction.

    const check = (val: boolean) => {
        setSelectedAnswer(val);
        setIsCorrect(val === true); // Answer is YES
    }

    return (
        <ExerciseCard title="Protection Côtière (Diffraction)" difficulty="Difficile">
            <div className="flex flex-col md:flex-row gap-8 items-center">

                {/* Visual Context */}
                <div className="w-full md:w-1/2 bg-blue-50 p-6 rounded-2xl border border-blue-100 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_2px,transparent_2px)] [background-size:20px_20px]"></div>

                    {/* Schematic */}
                    <svg viewBox="0 0 300 200" className="w-full drop-shadow-lg">
                        {/* Water Background */}
                        <rect width="300" height="200" fill="#bae6fd" opacity="0.2" />

                        {/* Walls */}
                        <path d="M150,0 V70" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
                        <path d="M150,130 V200" stroke="#334155" strokeWidth="8" strokeLinecap="round" />

                        {/* Incoming Waves */}
                        <path d="M20,20 V180" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
                        <path d="M60,20 V180" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
                        <path d="M100,20 V180" stroke="white" strokeWidth="2" strokeDasharray="4 4" />

                        {/* Arrow v */}
                        <defs>
                            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L0,6 L9,3 z" fill="#0369a1" />
                            </marker>
                        </defs>
                        <line x1="40" y1="100" x2="80" y2="100" stroke="#0369a1" strokeWidth="2" markerEnd="url(#arrow)" />
                        <text x="50" y="90" fontSize="12" fill="#0369a1" fontWeight="bold">v</text>

                        {/* Labels */}
                        <text x="160" y="105" fontSize="12" fill="#334155" fontWeight="bold">a = 60m</text>
                    </svg>
                </div>

                {/* Question Panel */}
                <div className="flex-1 space-y-6">
                    <div>
                        <h4 className="font-bold text-slate-800 mb-2">Analyse de la situation</h4>
                        <p className="text-slate-600 text-sm mb-4">
                            Une houle de période <span className="font-bold bg-white px-1 border rounded">T = 8 s</span> et de célérité <span className="font-bold bg-white px-1 border rounded">v = 10 m/s</span> s'approche d'une ouverture de largeur <span className="font-bold bg-white px-1 border rounded">a = 60 m</span>.
                        </p>
                        <p className="text-slate-800 font-bold text-sm">
                            Le phénomène de diffraction sera-t-il marqué (significatif) ?
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button type="button"
                            onClick={() => check(true)}
                            className={`p-4 rounded-xl border-2 font-bold transition-[background-color,border-color,color] duration-150 ease-out ${selectedAnswer === true
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-slate-200 hover:border-indigo-300'}`}
                        >
                            OUI
                        </button>
                        <button type="button"
                            onClick={() => check(false)}
                            className={`p-4 rounded-xl border-2 font-bold transition-[background-color,border-color,color] duration-150 ease-out ${selectedAnswer === false
                                ? 'border-rose-600 bg-rose-50 text-rose-700'
                                : 'border-slate-200 hover:border-rose-300'}`}
                        >
                            NON
                        </button>
                    </div>

                    <AnimatePresence>
                        {selectedAnswer !== null && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                                <div className={`p-4 rounded-xl text-sm ${isCorrect ? 'bg-emerald-100 text-emerald-900 icon-emerald-500' : 'bg-rose-100 text-rose-900'}`}>
                                    <h5 className="font-bold flex items-center gap-2 mb-1">
                                        {isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                        {isCorrect ? 'Excellente analyse.' : 'Erreur.'}
                                    </h5>
                                    <p className="leading-relaxed opacity-90">
                                        Calculons la longueur d'onde : λ = v × T = 10 × 8 = 80 m.<br />
                                        On a λ (80m) &gt; a (60m).<br />
                                        <strong>Condition de diffraction :</strong> Elle est très marquée lorsque λ ≥ a.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </ExerciseCard>
    );
}

// --- Challenge 3: Seismic Analysis (P vs S Waves) ---
const SeismicChallenge = () => {
    const [userDist, setUserDist] = useState('');
    const [feedback, setFeedback] = useState<FeedbackState>('idle');

    // Constants
    const vP = 6.0; // km/s
    const vS = 3.5; // km/s

    // Randomized Scenario
    // Let's fix a scenario for simplicity or making it random on mount could be done, but static is "simpler" UI.
    // Let's make it fixed for stability or simple random.
    // Let's use a fixed clean example.
    const deltaT = 25; // seconds
    // d = deltaT / (1/vS - 1/vP) 
    // 1/3.5 - 1/6 = (6 - 3.5) / 21 = 2.5 / 21
    // d = 25 / (2.5/21) = 25 * 21 / 2.5 = 10 * 21 = 210 km

    const correctD = 210;

    const validate = () => {
        const val = parseFloat(userDist);
        if (Math.abs(val - correctD) < 5) setFeedback('correct');
        else setFeedback('incorrect');
    };

    return (
        <ExerciseCard title="Épicentre Sismique (Ondes P & S)" difficulty="Difficile">
            <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                    <p className="text-slate-600">
                        Une station sismique enregistre deux types d'ondes provenant d'un même séisme :
                        <ul className="list-disc list-inside mt-2 space-y-1 ml-2 text-sm">
                            <li><strong>Ondes P</strong> (Primaires) : Rapides (<span className="font-mono bg-slate-100 px-1 rounded">vP = {vP} km/s</span>)</li>
                            <li><strong>Ondes S</strong> (Secondaires) : Plus lentes (<span className="font-mono bg-slate-100 px-1 rounded">vS = {vS} km/s</span>)</li>
                        </ul>
                    </p>
                    <p className="text-slate-600">
                        Le sismogramme montre un décalage temporel <span className="font-bold text-indigo-700">Δt = {deltaT} s</span> entre l'arrivée des deux ondes.
                    </p>

                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                        <h4 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-2">
                            <Calculator size={16} /> Mission
                        </h4>
                        <p className="text-amber-900 text-sm mb-3">
                            Déterminez la distance <strong>d</strong> séparant la station de l'épicentre.
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                value={userDist}
                                onChange={e => setUserDist(e.target.value)}
                                className="flex-1 p-2 border border-amber-300 rounded font-bold outline-none focus:border-amber-500"
                                placeholder="Distance en km"
                            />
                            <button type="button" onClick={validate} className="rounded bg-amber-600 px-4 py-2 font-bold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-amber-700 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100">
                                Valider
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {feedback !== 'idle' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-xl text-sm ${feedback === 'correct' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'bg-rose-100 text-rose-900 border border-rose-200'}`}>
                                {feedback === 'correct' ? (
                                    <>
                                        <strong>Correct !</strong> <br />
                                        La formule est : Δt = d/vS - d/vP = d(1/vS - 1/vP). <br />
                                        Donc d = Δt / (1/vS - 1/vP) = {deltaT} / ({1 / vS} - {(1 / vP).toFixed(2)}) ≈ {correctD} km.
                                    </>
                                ) : (
                                    <>
                                        <strong>Incorrect.</strong> <br />
                                        Indice : Exprimez le temps de parcours tP et tS en fonction de d. <br />
                                        On sait que tS - tP = Δt.
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 relative">
                    <div className="absolute top-2 right-2 text-xs font-mono text-slate-400">SISMOGRAMME ENREGISTRÉ</div>
                    {/* SVG Seismogram */}
                    <svg viewBox="0 0 400 150" className="w-full h-full overflow-visible">
                        {/* Grid */}
                        <defs>
                            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />

                        {/* Axis */}
                        <line x1="0" y1="130" x2="400" y2="130" stroke="#64748b" strokeWidth="2" />
                        <text x="390" y="145" fontSize="12" fill="#64748b">t(s)</text>

                        {/* Signal Noise */}
                        <path d="M0,130 L10,128 L20,132 L30,129 L40,131 L50,130" fill="none" stroke="#94a3b8" strokeWidth="1" />

                        {/* P-Wave Arrival at t=10 (arbitrary start on graph) */}
                        <g transform="translate(50, 0)">
                            <path d="M0,130 L5,80 L10,140 L15,100 L20,135 L25,120 L40,130" fill="none" stroke="#ef4444" strokeWidth="2" />
                            <text x="5" y="70" fontSize="14" fontWeight="bold" fill="#ef4444">Onde P</text>
                            <line x1="0" y1="130" x2="0" y2="150" stroke="#ef4444" strokeDasharray="4" />
                            <text x="-5" y="165" fontSize="12" fill="#ef4444">tP</text>
                        </g>

                        {/* Flat line chaos */}
                        <path d="M90,130 L100,129 L110,131 L120,128 L130,130" fill="none" stroke="#94a3b8" strokeWidth="1" />

                        {/* S-Wave Arrival at tP + deltaT. Let's map 25s delta to 100px roughly */}
                        <g transform="translate(150, 0)">
                            <path d="M0,130 L10,50 L20,150 L30,60 L40,140 L60,130" fill="none" stroke="#8b5cf6" strokeWidth="2" />
                            <text x="10" y="40" fontSize="14" fontWeight="bold" fill="#8b5cf6">Onde S</text>
                            <line x1="0" y1="130" x2="0" y2="150" stroke="#8b5cf6" strokeDasharray="4" />
                            <text x="-5" y="165" fontSize="12" fill="#8b5cf6">tS</text>
                        </g>

                        {/* Measurement annotation */}
                        <line x1="50" y1="20" x2="150" y2="20" stroke="#334155" strokeWidth="2" markerEnd="url(#arrow)" markerStart="url(#arrow-rev)" />
                        <text x="85" y="15" fontSize="12" fontWeight="bold" fill="#334155">Δt = {deltaT}s</text>

                        {/* Markers defs */}
                        <defs>
                            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#334155" /></marker>
                            <marker id="arrow-rev" markerWidth="10" markerHeight="10" refX="1" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M9,0 L9,6 L0,3 z" fill="#334155" /></marker>
                        </defs>
                    </svg>
                </div>
            </div>
        </ExerciseCard>
    );
};

export const WaveAdvancedExercises: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 p-8 rounded-3xl text-white shadow-2xl mb-12">
                <h2 className="text-3xl font-extrabold mb-4 flex items-center gap-3">
                    <Waves className="skew-y-3" size={32} /> Examen Blanc : Ondes Mécaniques
                </h2>
                <p className="text-indigo-100 text-lg max-w-2xl">
                    Mettez-vous en conditions réelles. Ces exercices nécessitent d'extraire des données visuelles et d'appliquer des raisonnements complexes.
                </p>
            </div>

            <SonarChallenge />
            <SeismicChallenge />
            <DiffractionChallenge />
        </div>
    );
};
