/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Activity, ShieldAlert, Award, MousePointer2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Simulation Constants ---
const GRID_SIZE = 100; // 100x100 grid
const DAMPING = 0.99;
const C = 0.5; // Wave speed scale

export const WaveLab: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [frequency, setFrequency] = useState(0.2);
    const [gapSize, setGapSize] = useState(10); // Gap in pixels (grid units)
    const [amplitudeInside, setAmplitudeInside] = useState(0);
    const [missionStatus, setMissionStatus] = useState<'pending' | 'success' | 'failed'>('pending');

    // --- Physics State (Refs for performance) ---
    const uRef = useRef(new Float32Array(GRID_SIZE * GRID_SIZE)); // Current state
    const uPrevRef = useRef(new Float32Array(GRID_SIZE * GRID_SIZE)); // Previous state
    const wallsRef = useRef(new Uint8Array(GRID_SIZE * GRID_SIZE)); // 1 = water, 0 = wall
    const animationRef = useRef<number | null>(null);
    const timeRef = useRef(0);

    // --- Initialization ---
    const initGrid = useCallback(() => {
        const walls = wallsRef.current;
        const u = uRef.current;
        const uPrev = uPrevRef.current;

        // Reset fields
        u.fill(0);
        uPrev.fill(0);
        walls.fill(1); // Default is water

        // Build Harbor Wall (vertical line at x=50)
        const wallX = 50;
        const center = GRID_SIZE / 2;
        const halfGap = Math.floor(gapSize / 2);

        for (let y = 0; y < GRID_SIZE; y++) {
            if (y < center - halfGap || y > center + halfGap) {
                walls[y * GRID_SIZE + wallX] = 0; // Wall
            }
        }
    }, [gapSize]);

    useEffect(() => {
        initGrid();
    }, [initGrid]);

    // --- Solver Loop ---
    const step = useCallback(() => {
        const u = uRef.current;
        const uPrev = uPrevRef.current;
        const walls = wallsRef.current;
        const t = timeRef.current;

        // 1. Source (Left side, plane wave)
        const sourceFreq = frequency;
        const sourceVal = Math.sin(t * sourceFreq) * 10;
        for (let y = 0; y < GRID_SIZE; y++) {
            u[y * GRID_SIZE + 1] = sourceVal;
        }

        // 2. Wave Equation (Finite Difference)
        // u_next = 2u - u_prev + c^2(laplacian)
        // Store u_next in uPrev temporarily to avoid allocation, then swap
        // Actually, standard swap is: temp = uPrev, uPrev = u, u = temp.
        // We calculate 'next' into 'uPrev' (which holds t-1), then swap refs logic?
        // Easier: Just use a new buffer or careful in-place? 
        // Standard explicit method requires 3 buffers or careful swapping.
        // Let's use a simple buffer strategy: NextState calculated into uPrev, then swap.

        // However, we need 'u' (t) and 'uPrev' (t-1) to compute 'Next' (t+1).
        // Let's maintain uNext as a local var per cell or just update uPrev field to be Next, then swap pointers?
        // JS TypedArrays are refs.

        // We need a temp buffer for Next state to do it correctly in parallel (conceptually).
        // BUT, for simple visualization, we can use 2 buffers if we are careful.
        // Let's assume we have u (current) and uPrev (old). 
        // We want uNext.
        // uNext[i] = 2*u[i] - uPrev[i] + alpha * (neighbors - 4*u[i])

        // We can write uNext into a "temp" buffer.
        // But to save memory/GC, let's just create a 3rd buffer outside loop?
        // Or simpler: We just need to update uPrev to be u, and u to be uNext.
        // Implementation:
        // 1. Compute Next into a "buffer" (we can use a static 3rd buffer or just reuse uPrev if we finish reading it? No, we need uPrev for each cell).

        // Let's alloc 'next' once.
        const waveWindow = window as typeof window & { waveBufferNext?: Float32Array };
        if (!waveWindow.waveBufferNext) {
            waveWindow.waveBufferNext = new Float32Array(GRID_SIZE * GRID_SIZE);
        }
        const uNext = waveWindow.waveBufferNext;

        let maxAmpInside = 0;

        for (let i = GRID_SIZE; i < GRID_SIZE * (GRID_SIZE - 1); i++) { // Skip borders
            if (walls[i] === 0) {
                uNext[i] = 0;
                continue;
            }

            const laplacian =
                u[i - 1] + u[i + 1] +
                u[i - GRID_SIZE] + u[i + GRID_SIZE] -
                4 * u[i];

            let val = 2 * u[i] - uPrev[i] + C * C * laplacian;
            val *= DAMPING; // Damping

            uNext[i] = val;

            // Measure amplitude inside harbor (x > 60)
            const x = i % GRID_SIZE;
            if (x > 60) {
                maxAmpInside = Math.max(maxAmpInside, Math.abs(val));
            }
        }

        // Swap buffers
        uPrevRef.current.set(u);
        uRef.current.set(uNext);

        // Update Stats
        setAmplitudeInside(prev => prev * 0.9 + maxAmpInside * 0.1); // Smooth it
        timeRef.current += 1;

    }, [frequency]);

    // --- Rendering ---
    const draw = useCallback(() => {
        const u = uRef.current;
        const walls = wallsRef.current;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        const imgData = ctx.createImageData(GRID_SIZE, GRID_SIZE);
        const data = imgData.data;

        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const idx = i * 4;
            if (walls[i] === 0) {
                // Wall - Dark Gray
                data[idx] = 50;
                data[idx + 1] = 50;
                data[idx + 2] = 50;
                data[idx + 3] = 255;
            } else {
                // Water - Blue with opacity based on height
                const val = u[i];
                // Color map: Positive = Highlight (Cyan), Negative = Shadow (Deep Blue)
                // Base: 30, 64, 175 (Indigo-800 approx)

                // Visualize crests (white/cyan) and troughs (black/blue)
                const intensity = Math.min(120, Math.abs(val) * 10);

                if (val > 0) {
                    data[idx] = 60 + intensity;
                    data[idx + 1] = 130 + intensity;
                    data[idx + 2] = 246 + intensity; // Approach white/cyan
                } else {
                    data[idx] = 30 - intensity / 2;
                    data[idx + 1] = 58 - intensity / 2;
                    data[idx + 2] = 138 - intensity / 2; // Darker blue
                }
                data[idx + 3] = 255;
            }
        }

        // Scale up
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = GRID_SIZE;
        tempCanvas.height = GRID_SIZE;
        tempCanvas.getContext('2d')?.putImageData(imgData, 0, 0);

        ctx.clearRect(0, 0, 400, 400);
        ctx.imageSmoothingEnabled = false; // Pixel art style
        ctx.drawImage(tempCanvas, 0, 0, 400, 400);

    }, []);

    // --- Loop ---
    const loop = useCallback(() => {
        if (isRunning) {
            step();
            draw();
            animationRef.current = requestAnimationFrame(loop);
        }
    }, [isRunning, step, draw]);

    useEffect(() => {
        if (isRunning) {
            animationRef.current = requestAnimationFrame(loop);
        } else {
            cancelAnimationFrame(animationRef.current!);
            draw(); // Draw once paused
        }
        return () => cancelAnimationFrame(animationRef.current!);
    }, [isRunning, loop, draw]);


    // Validation Logic
    useEffect(() => {
        if (amplitudeInside > 0 && amplitudeInside < 2 && isRunning) {
            // Low amplitude inside = Success (Protected)
            // But wait for stabilization?
            // Let's keeping it simple: real-time feedback
        }
    }, [amplitudeInside, isRunning]);

    const checkMission = () => {
        if (amplitudeInside < 1.0) { // Threshold
            setMissionStatus('success');
        } else {
            setMissionStatus('failed');
        }
    };
    const harborAmplitudePercent = Math.min(100, amplitudeInside * 20);

    return (
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <Activity size={14} /> Laboratoire Virtuel
                        </span>
                        <h3 className="text-xl font-bold text-slate-800">Le Brise-Lames</h3>
                    </div>
                    <p className="text-slate-500 text-sm max-w-md">
                        <strong>Mission :</strong> Protégez le port (zone droite) de la houle. Ajustez l'ouverture pour minimiser la diffraction et l'amplitude des vagues à l'intérieur.
                    </p>
                </div>
                <div className={`px-4 py-2 rounded-xl font-bold border flex flex-col items-center min-w-[120px] ${missionStatus === 'success' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                        missionStatus === 'failed' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                            'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                    <span className="text-xs uppercase opacity-70">État du Port</span>
                    <span className="text-lg">
                        {amplitudeInside < 0.5 ? 'Calme' : amplitudeInside < 2 ? 'Agité' : 'Danger'}
                    </span>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Viewport */}
                <div className="relative group">
                    <canvas
                        ref={canvasRef}
                        width={400}
                        height={400}
                        className="w-full max-w-[400px] aspect-square bg-[#1e3a8a] rounded-xl shadow-inner border-4 border-slate-800 cursor-crosshair"
                    />

                    {/* Overlay Labels */}
                    <div className="absolute top-4 left-4 text-white/50 text-xs font-bold pointer-events-none">OCÉAN</div>
                    <div className="absolute top-4 right-4 text-white/50 text-xs font-bold pointer-events-none">PORT</div>

                    {/* Play Controls Overlay */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                        <button type="button"
                            onClick={() => setIsRunning(!isRunning)}
                            className="bg-white/90 hover:bg-white text-indigo-900 p-3 rounded-full shadow-lg backdrop-blur-sm transition-all"
                        >
                            {isRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>
                        <button type="button"
                            onClick={() => {
                                timeRef.current = 0;
                                uRef.current.fill(0);
                                uPrevRef.current.fill(0);
                                initGrid(); // rebuild wall
                            }}
                            className="bg-white/90 hover:bg-white text-slate-600 p-3 rounded-full shadow-lg backdrop-blur-sm transition-all"
                        >
                            <RotateCcw size={20} />
                        </button>
                    </div>
                </div>

                {/* Controls Panel */}
                <div className="flex-1 space-y-8">

                    {/* Frequency Control */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                        <label className="flex justify-between font-bold text-slate-700 mb-4">
                            <span>Fréquence de la Houle (N)</span>
                            <span className="bg-white px-2 py-1 rounded border text-indigo-600">{frequency.toFixed(2)} Hz</span>
                        </label>
                        <input
                            type="range"
                            min="0.05" max="0.5" step="0.01"
                            value={frequency}
                            onChange={e => setFrequency(parseFloat(e.target.value))}
                            className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            Une fréquence plus élevée réduit la longueur d'onde (λ).
                        </p>
                    </div>

                    {/* Gap Size Control */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                        <label className="flex justify-between font-bold text-slate-700 mb-4">
                            <span>Ouverture du Mur (a)</span>
                            <span className="bg-white px-2 py-1 rounded border text-indigo-600">{gapSize} m</span>
                        </label>
                        <input
                            type="range"
                            min="2" max="30" step="1"
                            value={gapSize}
                            onChange={e => {
                                setGapSize(parseInt(e.target.value));
                                initGrid(); // Rebuild geometry immediately
                            }}
                            className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            La diffraction est maximale lorsque l'ouverture 'a' est proche de la longueur d'onde 'λ'.
                        </p>
                    </div>

                    {/* Analysis & Validation */}
                    <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
                        <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                            <ShieldAlert size={18} /> Rapport de Sécurité
                        </h4>

                        <div className="flex justify-between items-end mb-2">
                            <span className="text-sm text-indigo-700">Amplitude Portuaire</span>
                            <span className="font-mono font-bold text-lg text-indigo-900">{amplitudeInside.toFixed(2)}</span>
                        </div>

                        {/* Meter */}
                        <div className="h-4 bg-white rounded-full overflow-hidden border border-indigo-200 mb-4 relative">
                            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
                                <rect
                                    width={harborAmplitudePercent}
                                    height="4"
                                    rx="2"
                                    className={`transition-all duration-300 ${amplitudeInside < 1 ? 'fill-emerald-500' : 'fill-rose-500'}`}
                                />
                            </svg>
                            {/* Safe zone indicator */}
                            <div className="absolute top-0 bottom-0 left-0 w-[20%] border-r-2 border-emerald-500/50 bg-emerald-500/10 pointer-events-none"></div>
                        </div>

                        <button type="button"
                            onClick={checkMission}
                            className={`w-full py-3 rounded-xl font-bold transition-all shadow-md ${missionStatus === 'success'
                                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                }`}
                        >
                            {missionStatus === 'success' ? 'Port Sécurisé !' : 'Lancer l\'Inspection'}
                        </button>
                    </div>


                </div>
            </div>

            {missionStatus === 'success' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex gap-4 items-center">
                    <div className="bg-emerald-100 p-2 rounded-full"><Award size={32} /></div>
                    <div>
                        <h4 className="font-bold text-lg">Mission Accomplie !</h4>
                        <p>Vous avez réduit la diffraction en ajustant le rapport λ/a. Le port est calme.</p>
                    </div>
                </motion.div>
            )}
        </div>
    );
};
