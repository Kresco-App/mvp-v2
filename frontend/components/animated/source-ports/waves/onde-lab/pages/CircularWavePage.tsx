/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useState, useRef } from 'react';
import CircularCanvas, { CircularCanvasRef } from '../components/CircularCanvas';
import { WaveMode2D } from '../physics/CircularWaveEngine';
import { useTheme } from '../context/ThemeContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface CircularWavePageProps {
    onNavigate: (page: 'single' | 'interference' | 'longitudinal' | 'multimedium' | 'circular') => void;
}

export default function CircularWavePage({ onNavigate }: CircularWavePageProps) {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';
    
    const [isPlaying, setIsPlaying] = useState(true);
    const [amplitude, setAmplitude] = useState(30);
    const [frequency, setFrequency] = useState(0.5);
    const [damping, setDamping] = useState(0.02);
    const [speed, setSpeed] = useState(2.0);
    const [waveMode, setWaveMode] = useState<WaveMode2D>('manual');
    const [resolution, setResolution] = useState(250);
    const [zoom, setZoom] = useState(1.5);
    const [simSpeed, setSimSpeed] = useState(1.0); // Simulation speed multiplier

    const canvasRef = useRef<CircularCanvasRef>(null);

    const handleReset = () => {
        canvasRef.current?.reset();
    };

    // Keyboard shortcuts
    useKeyboardShortcuts({
        onPlayPause: () => setIsPlaying(p => !p),
        onReset: handleReset,
        onStop: () => { setIsPlaying(false); handleReset(); }
    });

    // Theme-aware colors
    const bg = isDark ? 'bg-[#0F172A]' : 'bg-[#FAFAFA]';
    const headerBg = isDark ? 'bg-[#1E293B]' : 'bg-white';
    const borderColor = isDark ? 'border-[#334155]' : 'border-[#E2E8F0]';
    const cardBg = isDark ? 'bg-[#1E293B]' : 'bg-white';
    const textPrimary = isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]';
    const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#64748B]';
    const textTertiary = isDark ? 'text-[#64748B]' : 'text-[#94A3B8]';
    const canvasBg = isDark ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]';

    // Accent colors (Orange for this page)
    const accent = '#FBAE17';
    const accentLight = isDark ? 'text-[#FDD675]' : 'text-[#FBAE17]';
    const accentBg = 'bg-[#FBAE17]';

    return (
        <div className={`flex flex-col h-screen ${bg}`}>
            {/* Header */}
            <header className={`flex items-center justify-between px-6 py-3 ${headerBg} border-b ${borderColor} shadow-sm`}>
                <div className="flex items-center gap-4">
                    <h1 className={`text-xl font-bold ${accentLight}`}>
                        Labo Ondes
                    </h1>
                    <div className={`flex ${isDark ? 'bg-[#334155]' : 'bg-[#F1F5F9]'} rounded-full p-1 gap-1 overflow-x-auto`}>
                        <button onClick={() => onNavigate('single')} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${textSecondary} hover:${textPrimary}`}>Onde Simple</button>
                        <button onClick={() => onNavigate('interference')} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${textSecondary} hover:${textPrimary}`}>Collision</button>
                        <button onClick={() => onNavigate('longitudinal')} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${textSecondary} hover:${textPrimary}`}>Longitudinale</button>
                        <button onClick={() => onNavigate('multimedium')} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${textSecondary} hover:${textPrimary}`}>Milieux</button>
                        <button className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${accentBg} text-white shadow-sm`}>Circulaire</button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleTheme}
                        className={`px-3 py-2 rounded-full font-medium transition-all ${isDark ? 'bg-[#334155] text-yellow-400 hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}
                        title={isDark ? 'Mode clair' : 'Mode sombre'}
                    >
                        {isDark ? 'Clair' : 'Sombre'}
                    </button>
                    <button onClick={() => setIsPlaying(!isPlaying)} className={`px-4 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${isPlaying ? 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100' : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'}`}>
                        {isPlaying ? 'Pause' : 'Lecture'}
                    </button>
                    <button onClick={handleReset} className={`px-4 py-2 rounded-full transition-all ${isDark ? 'bg-[#334155] text-[#E2E8F0] hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>Reset</button>
                </div>
            </header>
            
            {/* Main Content */}
            <main className="flex flex-1 overflow-hidden">
                <div className={`flex-1 ${canvasBg} relative`}>
                    <CircularCanvas 
                        ref={canvasRef}
                        isPlaying={isPlaying}
                        amplitude={amplitude}
                        frequency={frequency}
                        damping={damping}
                        speed={speed}
                        waveMode={waveMode}
                        resolution={resolution}
                        zoom={zoom}
                        theme={theme}
                        simSpeed={simSpeed}
                    />
                </div>
                
                {/* Controls */}
                <aside className={`w-80 ${cardBg} border-l ${borderColor} overflow-y-auto p-4 space-y-4`}>
                    {/* Mode */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-[#FFF9EB]'} rounded-2xl p-4 space-y-3 border ${isDark ? 'border-[#475569]' : 'border-[#FBAE17]/20'}`}>
                        <h3 className={`text-xs font-semibold ${accentLight} uppercase tracking-wider`}>Mode</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setWaveMode('manual')} className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${waveMode === 'manual' ? `${accentBg} text-white shadow-sm` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Pluie (Clic)</button>
                            <button onClick={() => setWaveMode('oscillate')} className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${waveMode === 'oscillate' ? `${accentBg} text-white shadow-sm` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Oscillateur</button>
                        </div>
                        <p className={`text-xs ${textTertiary}`}>
                            {waveMode === 'manual' ? "Cliquez sur la zone pour créer des perturbations." : "Une source continue oscille au centre."}
                        </p>
                    </section>

                    {/* Params */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Physique</h3>
                        
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Amplitude</span>
                                <span className={`${accentLight} font-mono font-medium`}>{amplitude}</span>
                            </div>
                            <input type="range" min="10" max="100" step="5" value={amplitude} onChange={(e) => setAmplitude(Number(e.target.value))} className="w-full accent-[#FBAE17]" />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Fréquence</span>
                                <span className={`${accentLight} font-mono font-medium`}>{frequency.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0.1" max="2.0" step="0.1" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} className="w-full accent-[#FBAE17]" />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Vitesse Onde</span>
                                <span className={`${accentLight} font-mono font-medium`}>{speed.toFixed(1)}</span>
                            </div>
                            <input type="range" min="0.5" max="4.0" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-[#FBAE17]" />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Amortissement</span>
                                <span className={`${accentLight} font-mono font-medium`}>{damping.toFixed(3)}</span>
                            </div>
                            <input type="range" min="0.0" max="0.1" step="0.001" value={damping} onChange={(e) => setDamping(Number(e.target.value))} className="w-full accent-[#FBAE17]" />
                        </div>
                    </section>

                    {/* Performance */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Affichage</h3>
                        
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Vitesse Simulation</span>
                                <span className={`${accentLight} font-mono font-medium`}>{simSpeed}x</span>
                            </div>
                            <div className="flex gap-1">
                                {[0.25, 0.5, 1, 2, 4].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSimSpeed(s)}
                                        className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${simSpeed === s ? `${accentBg} text-white` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}
                                    >
                                        {s}x
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Zoom</span>
                                <span className={`${accentLight} font-mono font-medium`}>{zoom.toFixed(1)}x</span>
                            </div>
                            <input type="range" min="0.5" max="3.0" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[#FBAE17]" />
                        </div>

                         <div className="flex justify-between text-sm mb-1">
                            <span className={textPrimary}>Résolution</span>
                            <span className={`${textSecondary} font-mono`}>{resolution}x{resolution}</span>
                        </div>
                        <input type="range" min="100" max="500" step="10" value={resolution} onChange={(e) => setResolution(Number(e.target.value))} className="w-full accent-[#94A3B8]" />
                        <p className={`text-xs ${textTertiary}`}>Plus haut = plus de détails, mais plus lent</p>
                    </section>

                    {/* Educational Note */}
                    <section className={`${isDark ? 'bg-[#334155]/30' : 'bg-[#F8FAFC]'} rounded-2xl p-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider mb-2`}>Ondes Circulaires</h3>
                        <p className={`text-xs ${textTertiary} leading-relaxed`}>
                            Les ondes circulaires se propagent depuis un point source, comme des <span className={accentLight}>gouttes d'eau</span> créant des cercles concentriques.
                            <br/><br/>
                            L'amplitude diminue avec la distance (r) car l'énergie se répartit sur un périmètre croissant.
                            <br/><br/>
                            Cliquez pour créer des perturbations et observez les interférences
                        </p>
                    </section>
                </aside>
            </main>
        </div>
    );
}
