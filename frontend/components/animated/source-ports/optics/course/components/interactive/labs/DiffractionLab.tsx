/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Ruler, MoveHorizontal, Info, Eye, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type LaserTone = 'violet' | 'blue' | 'green' | 'yellow' | 'orange' | 'red';

const laserToneClasses: Record<LaserTone, {
    bg: string;
    text: string;
    gradient: string;
}> = {
    violet: {
        bg: 'bg-violet-500',
        text: 'text-violet-500',
        gradient: 'bg-gradient-to-r from-violet-500 to-transparent',
    },
    blue: {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        gradient: 'bg-gradient-to-r from-blue-500 to-transparent',
    },
    green: {
        bg: 'bg-green-500',
        text: 'text-green-500',
        gradient: 'bg-gradient-to-r from-green-500 to-transparent',
    },
    yellow: {
        bg: 'bg-yellow-500',
        text: 'text-yellow-500',
        gradient: 'bg-gradient-to-r from-yellow-500 to-transparent',
    },
    orange: {
        bg: 'bg-orange-500',
        text: 'text-orange-500',
        gradient: 'bg-gradient-to-r from-orange-500 to-transparent',
    },
    red: {
        bg: 'bg-red-500',
        text: 'text-red-500',
        gradient: 'bg-gradient-to-r from-red-500 to-transparent',
    },
};

export const DiffractionLab: React.FC = () => {
    // --- State ---
    const [wavelength, setWavelength] = useState(650); // nm (Red)
    const [slitWidth, setSlitWidth] = useState(100); // 100 micrometers (a)
    const [distance, setDistance] = useState(2.0); // meters (D)

    // Measurement Tool
    const [isRulerActive, setIsRulerActive] = useState(false);
    const [rulerPos, setRulerPos] = useState({ x1: 50, x2: 250 }); // in pixels on the screen view

    // --- Physics ---
    // Theta = Lambda / a
    // L = 2 * D * tan(Theta) ~ 2 * D * Theta = 2 * Lambda * D / a
    // L (in meters) = 2 * (wl * 1e-9) * D / (slit * 1e-6)

    const calculateL = () => {
        const wlM = wavelength * 1e-9;
        const slitM = slitWidth * 1e-6;
        const L_meters = (2 * wlM * distance) / slitM;
        return L_meters; // Width of central fringe
    };

    const L_real = calculateL(); // meters
    const L_cm = L_real * 100;

    // Visualization Scale
    // Let's say the screen view represents a physical width of 10 cm (0.1 m)
    const SCREEN_PHYSICAL_WIDTH_CM = 15;
    const PIXELS_PER_CM = 400 / SCREEN_PHYSICAL_WIDTH_CM; // 400px view

    const measuredPixels = Math.abs(rulerPos.x2 - rulerPos.x1);
    const measuredCm = measuredPixels / PIXELS_PER_CM;

    // Error margin for student measurement
    const errorMargin = Math.abs(measuredCm - L_cm) / L_cm;
    const isMeasurementCorrect = errorMargin < 0.1; // 10% tolerance

    // --- Color Helper ---
    const getLaserTone = (nm: number): LaserTone => {
        if (nm < 450) return 'violet';
        if (nm < 495) return 'blue';
        if (nm < 570) return 'green';
        if (nm < 590) return 'yellow';
        if (nm < 620) return 'orange';
        return 'red';
    };

    const laserTone = getLaserTone(wavelength);
    const laserClasses = laserToneClasses[laserTone];

    return (
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <Eye size={14} /> Laboratoire Optique
                        </span>
                        <h3 className="text-xl font-bold text-slate-800">Banc de Diffraction CSI</h3>
                    </div>
                    <p className="text-slate-500 text-sm max-w-lg">
                        <strong>Mission :</strong> Utilisez le laser pour mesurer le diamètre de la fente (ou d'un cheveu).
                        La formule clé est <span className="font-serif font-bold italic">L = 2λD/a</span>.
                    </p>
                </div>
            </div>

            {/* 3D Visualization / Setup Diagram */}
            <div className="relative bg-slate-900 rounded-xl h-48 mb-8 overflow-hidden flex items-center justify-center p-8 border-4 border-slate-800 shadow-inner">
                {/* Laser Gun */}
                <div className="absolute left-8 flex flex-col items-center z-10">
                    <div className="w-16 h-8 bg-slate-700 rounded-l border-r-2 border-slate-600"></div>
                    <div className="w-20 h-4 bg-slate-600 rounded shadow-lg"></div>
                    <div className="text-xs text-slate-400 mt-2 font-bold">LASER</div>
                </div>

                {/* Slit Holder */}
                <div className="absolute left-1/3 flex flex-col items-center z-10">
                    <div className="w-2 h-20 bg-slate-500 border border-slate-400 shadow-lg"></div>
                    <div className="text-xs text-slate-400 mt-2 font-bold">FENTE (a)</div>
                </div>

                {/* Laser Beam Part 1 */}
                <div
                    className={`absolute left-[3rem] w-[calc(33%-3rem)] h-1 shadow-[0_0_10px_currentColor] z-0 opacity-80 ${laserClasses.bg} ${laserClasses.text}`}
                />

                {/* Laser Beam Part 2 (Diffracted Cone) */}
                <div
                    className={`absolute left-[33%] top-1/2 h-1 w-[calc(66%-2rem)] z-0 opacity-40 mix-blend-screen [clip-path:polygon(0_45%,_100%_0,_100%_100%,_0_55%)] [transform:perspective(500px)_rotateY(0deg)] ${laserClasses.gradient}`}
                />

                {/* Screen */}
                <div className="absolute right-8 h-32 w-2 bg-slate-200 shadow-[0_0_20px_rgba(255,255,255,0.1)] z-10 flex flex-col justify-center items-center">
                    <motion.div
                        className={`w-1 rounded-full shadow-[0_0_15px_4px_currentColor] ${laserClasses.bg} ${laserClasses.text}`}
                        animate={{ height: `${Math.min(100, L_cm * 5)}%` }}
                        transition={{ duration: 0.18 }}
                    />
                </div>
                <div className="absolute right-4 bottom-8 text-xs text-slate-400 font-bold">ÉCRAN</div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">

                {/* Controls */}
                <div className="flex-1 space-y-6">
                    {/* Wavelength */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="flex justify-between font-bold text-slate-700 mb-2">
                            <span>Longueur d'onde (λ)</span>
                            <span className={laserClasses.text}>{wavelength} nm</span>
                        </label>
                        <input
                            type="range" min="400" max="700" step="10"
                            value={wavelength}
                            onChange={e => setWavelength(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        />
                        <div className="w-full h-2 mt-2 rounded-full bg-gradient-to-r from-violet-500 via-green-500 to-red-500 opacity-50"></div>
                    </div>

                    {/* Slit Width (a) */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="flex justify-between font-bold text-slate-700 mb-2">
                            <span>Largeur Fente (a)</span>
                            <span className="text-indigo-600">{slitWidth} μm</span>
                        </label>
                        <input
                            type="range" min="20" max="300" step="5"
                            value={slitWidth}
                            onChange={e => setSlitWidth(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                    </div>

                    {/* Distance (D) */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="flex justify-between font-bold text-slate-700 mb-2">
                            <span>Distance Écran (D)</span>
                            <span className="text-indigo-600">{distance.toFixed(2)} m</span>
                        </label>
                        <input
                            type="range" min="0.5" max="5.0" step="0.1"
                            value={distance}
                            onChange={e => setDistance(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                    </div>
                </div>

                {/* Result View (Screen) */}
                <div className="flex-1">
                    <div className="relative bg-black w-full aspect-square max-w-[400px] rounded-xl border-4 border-slate-300 shadow-2xl mx-auto overflow-hidden">

                        {/* Render Pattern */}
                        {/* Sinc^2 pattern simulation */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            {/* Central Spot */}
                            <motion.div
                                className={`h-full blur-xl opacity-80 shadow-[0_0_40px_10px_currentColor] ${laserClasses.bg} ${laserClasses.text}`}
                                animate={{ width: `${L_cm * PIXELS_PER_CM}px` }}
                                transition={{ duration: 0.18 }}
                            />
                            {/* Secondary spots? Simplified visual for now or multiple divs */}
                            {/* Let's draw a few secondary maxima */}
                            {[-1.5, 1.5].map((offset, i) => (
                                <motion.div key={i}
                                    className={`absolute h-3/4 opacity-30 blur-md rounded-full ${laserClasses.bg}`}
                                    animate={{
                                        width: `${(L_cm / 2) * PIXELS_PER_CM}px`,
                                        x: offset * L_cm * PIXELS_PER_CM,
                                    }}
                                    transition={{ duration: 0.18 }}
                                />
                            ))}
                        </div>

                        {/* Ruler Tool */}
                        <div className="absolute inset-0 pointer-events-none">
                            {/* Ruler Tick Marks Background */}
                            <div className="absolute bottom-0 w-full h-8 bg-white/10 border-t border-white/20 flex justify-between px-2">
                                {Array.from({ length: 16 }).map((_, i) => (
                                    <div key={i} className="h-full w-[1px] bg-white/20 relative">
                                        <span className="absolute bottom-1 -left-1 text-[8px] text-white/50">{i}cm</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Interactive Calipers */}
                        <div className="absolute inset-0 pointer-events-auto">
                            <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur">
                                {measuredCm.toFixed(2)} cm
                            </div>

                            {/* Left Cursor */}
                            <motion.div
                                className="absolute left-0 top-0 bottom-0 w-8 cursor-ew-resize flex flex-col items-center group touch-none"
                                animate={{ x: rulerPos.x1 - 16 }}
                                transition={{ duration: 0 }}
                                onPointerDown={(e) => {
                                    const startX = e.clientX;
                                    const startPos = rulerPos.x1;
                                    const onMove = (moveE: PointerEvent) => {
                                        const diff = moveE.clientX - startX;
                                        setRulerPos(p => ({ ...p, x1: Math.min(p.x2 - 10, Math.max(0, startPos + diff)) }));
                                    };
                                    const onUp = () => {
                                        window.removeEventListener('pointermove', onMove);
                                        window.removeEventListener('pointerup', onUp);
                                    };
                                    window.addEventListener('pointermove', onMove);
                                    window.addEventListener('pointerup', onUp);
                                }}
                            >
                                <div className="h-full w-[1px] bg-white group-hover:bg-yellow-400 shadow-[0_0_5px_rgba(0,0,0,1)]"></div>
                                <div className="absolute bottom-10 bg-white text-black p-1 rounded font-bold text-xs"><MoveHorizontal size={14} /></div>
                            </motion.div>

                            {/* Right Cursor */}
                            <motion.div
                                className="absolute left-0 top-0 bottom-0 w-8 cursor-ew-resize flex flex-col items-center group touch-none"
                                animate={{ x: rulerPos.x2 - 16 }}
                                transition={{ duration: 0 }}
                                onPointerDown={(e) => {
                                    const startX = e.clientX;
                                    const startPos = rulerPos.x2;
                                    const onMove = (moveE: PointerEvent) => {
                                        const diff = moveE.clientX - startX;
                                        setRulerPos(p => ({ ...p, x2: Math.max(p.x1 + 10, Math.min(400, startPos + diff)) }));
                                    };
                                    const onUp = () => {
                                        window.removeEventListener('pointermove', onMove);
                                        window.removeEventListener('pointerup', onUp);
                                    };
                                    window.addEventListener('pointermove', onMove);
                                    window.addEventListener('pointerup', onUp);
                                }}
                            >
                                <div className="h-full w-[1px] bg-white group-hover:bg-yellow-400 shadow-[0_0_5px_rgba(0,0,0,1)]"></div>
                                <div className="absolute bottom-10 bg-white text-black p-1 rounded font-bold text-xs"><MoveHorizontal size={14} /></div>
                            </motion.div>
                        </div>

                    </div>

                    {/* Validation Panel */}
                    <div className={`mt-4 p-4 rounded-xl border transition-colors ${isMeasurementCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex justify-between items-center">
                            <div>
                                <h5 className="font-bold text-slate-800 text-sm">Vérification de la Mesure</h5>
                                <p className="text-xs text-slate-500">Alignez les curseurs sur la tache centrale.</p>
                            </div>
                            {isMeasurementCorrect ? (
                                <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">Excellent</span>
                            ) : (
                                <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">Ajustez...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
