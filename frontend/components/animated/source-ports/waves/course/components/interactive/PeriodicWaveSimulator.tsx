/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Ruler, Clock, Waves } from 'lucide-react';
import { Slider } from '../ui/Slider';

// This custom hook remains the same
const useResponsiveCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        const resizeObserver = new ResizeObserver(entries => {
            if (!entries || entries.length === 0) return;
            const { width, height } = entries[0].contentRect;
            setSize({ width, height });
        });
        resizeObserver.observe(parent);
        return () => resizeObserver.unobserve(parent);
    }, []);
    return { canvasRef, ...size };
};

interface MeasurementGuideProps {
    width: number;
    label: string;
    tone: 'blue' | 'pink';
}

const MeasurementGuide = ({ width, label, tone }: MeasurementGuideProps) => {
    const guideWidth = Math.max(width, 1);
    const labelClass = tone === 'blue' ? 'fill-blue-600' : 'fill-pink-600';

    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width={guideWidth}
            height="40"
            viewBox={`0 0 ${guideWidth} 40`}
            className="absolute h-10 overflow-visible"
        >
            <line x1="0" y1="5" x2={guideWidth} y2="5" className="stroke-slate-400" strokeWidth="1" />
            <line x1="0" y1="5" x2="0" y2="13" className="stroke-slate-400" strokeWidth="1" />
            <line x1={guideWidth} y1="5" x2={guideWidth} y2="13" className="stroke-slate-400" strokeWidth="1" />
            <text x={guideWidth / 2} y="33" textAnchor="middle" className={`text-sm font-bold ${labelClass}`}>
                {label}
            </text>
        </svg>
    );
};

// The new architecture for smooth, real-time animation
export const PeriodicWaveSimulator: React.FC = () => {
    const { canvasRef, width, height } = useResponsiveCanvas();

    // React state is ONLY for UI that needs to re-render
    const [isPlaying, setIsPlaying] = useState(true);
    const [viewMode, setViewMode] = useState<'spatial' | 'temporal'>('spatial');
    const [displayFrequency, setDisplayFrequency] = useState(0.5);
    const [displayWavelength, setDisplayWavelength] = useState(250);

    // The simulation "engine" is held in a ref to prevent re-renders
    const simulationRef = useRef({
        time: 0,
        frequency: 0.5,
        wavelength: 250,
        amplitude: 60,
        // The entire drawing logic is now part of this object
        draw: function (ctx: CanvasRenderingContext2D, w: number, h: number, currentView: 'spatial' | 'temporal') {
            const centerY = h / 2;
            const FOCAL_POINT_X = w / 4;

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, w, h);

            ctx.strokeStyle = '#f1f5f9';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 1; i <= 3; i++) { ctx.moveTo(0, i * h / 4); ctx.lineTo(w, i * h / 4); }
            for (let i = 1; i <= 7; i++) { ctx.moveTo(i * w / 8, 0); ctx.lineTo(i * w / 8, h); }
            ctx.stroke();

            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, centerY); ctx.lineTo(w, centerY);
            ctx.moveTo(FOCAL_POINT_X, 0); ctx.lineTo(FOCAL_POINT_X, h);
            ctx.stroke();

            const angFreq = 2 * Math.PI * this.frequency;
            const waveNum = 2 * Math.PI / this.wavelength;

            ctx.beginPath();
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            if (currentView === 'spatial') {
                ctx.strokeStyle = '#3b82f6';
                for (let x = 0; x < w; x++) {
                    const y = centerY - this.amplitude * Math.cos(waveNum * x - angFreq * this.time);
                    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();
                const focalY = centerY - this.amplitude * Math.cos(waveNum * FOCAL_POINT_X - angFreq * this.time);
                ctx.fillStyle = '#db2777';
                ctx.beginPath();
                ctx.arc(FOCAL_POINT_X, focalY, 8, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                ctx.strokeStyle = '#ec4899';
                const timeWindow = 4 / this.frequency;
                const pixelsPerSecond = w / timeWindow;
                for (let px = 0; px < w; px++) {
                    const timeAtPx = this.time - (w - px) / pixelsPerSecond;
                    const y = centerY - this.amplitude * Math.cos(waveNum * FOCAL_POINT_X - angFreq * timeAtPx);
                    px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
                }
                ctx.stroke();
                const currentY = centerY - this.amplitude * Math.cos(waveNum * FOCAL_POINT_X - angFreq * this.time);
                ctx.fillStyle = '#0891b2';
                ctx.beginPath();
                ctx.arc(w - 2, currentY, 8, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    });

    // The animation loop effect now has almost no dependencies
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        let animationFrameId: number;
        let lastTime = performance.now();

        const loop = (now: number) => {
            if (isPlaying) {
                const dt = (now - lastTime) / 1000;
                simulationRef.current.time += dt;
            }
            lastTime = now;

            // Directly call the draw method from the ref
            simulationRef.current.draw(ctx, width, height, viewMode);

            animationFrameId = requestAnimationFrame(loop);
        };
        loop(performance.now());

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, viewMode, width, height]); // Re-start loop only if these major properties change

    const period = 1 / displayFrequency;
    const pixelsPerPeriod = (width / (4 / displayFrequency)) * period;

    return (
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-100 my-8">
            <div className="lg:grid lg:grid-cols-3 lg:gap-8">
                <div className="lg:col-span-2 relative w-full aspect-video rounded-xl overflow-hidden bg-slate-50 border border-slate-200 shadow-inner">
                    <canvas ref={canvasRef} className="absolute top-0 left-0" width={width} height={height} />
                    <div className="absolute top-2 left-2 text-xs text-slate-500 font-semibold">Elongation (y)</div>
                    <div className="absolute bottom-2 right-2 text-xs text-slate-500 font-semibold">
                        {viewMode === 'spatial' ? 'Position (x)' : 'Temps (t)'}
                    </div>
                </div>

                <div className="lg:col-span-1 mt-6 lg:mt-0 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Waves size={20} /> Simulateur d'Onde</h3>
                        <button type="button" onClick={() => setIsPlaying(!isPlaying)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-700" title={isPlaying ? "Pause" : "Lecture"}>
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button type="button" onClick={() => setViewMode('spatial')} className={`w-1/2 px-3 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${viewMode === 'spatial' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                            <Ruler size={16} /> Spatiale
                        </button>
                        <button type="button" onClick={() => setViewMode('temporal')} className={`w-1/2 px-3 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${viewMode === 'temporal' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500'}`}>
                            <Clock size={16} /> Temporelle
                        </button>
                    </div>

                    <div className="text-sm text-center p-3 rounded-lg border bg-slate-50">
                        {viewMode === 'spatial'
                            ? <p>📷 "Photo" de la corde à un <strong className="text-blue-600">instant t</strong>.</p>
                            : <p>🎥 "Film" d'un <strong className="text-pink-600">point x₀</strong> dans le temps.</p>
                        }
                    </div>

                    <div className="space-y-5 pt-2">
                        <div>
                            <label className="flex justify-between text-sm font-bold text-slate-600 mb-3">
                                <span>Fréquence (f)</span>
                                <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">{displayFrequency.toFixed(1)} Hz</span>
                            </label>
                            <Slider
                                value={[displayFrequency]}
                                onValueChange={([value]) => {
                                    setDisplayFrequency(value);
                                    simulationRef.current.frequency = value;
                                }}
                                min={0.2} max={2} step={0.1}
                            />
                        </div>
                        <div>
                            <label className="flex justify-between text-sm font-bold text-slate-600 mb-3">
                                <span>Longueur d'onde (λ)</span>
                                <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">{displayWavelength} px</span>
                            </label>
                            <Slider
                                value={[displayWavelength]}
                                onValueChange={([value]) => {
                                    setDisplayWavelength(value);
                                    simulationRef.current.wavelength = value;
                                }}
                                min={100} max={width > 200 ? width / 2 : 200} step={10}
                                disabled={viewMode === 'temporal'}
                                className="[&>[data-radix-collection-item]]:bg-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {!isPlaying && width > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                    {viewMode === 'spatial' ? (
                        <div className="relative h-10 w-full flex items-center justify-center">
                            <MeasurementGuide width={displayWavelength} label={'\u03bb'} tone="blue" />
                        </div>
                    ) : (
                        <div className="relative h-10 w-full flex items-center justify-center">
                            <MeasurementGuide width={pixelsPerPeriod} label={`T = ${period.toFixed(2)}s`} tone="pink" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
