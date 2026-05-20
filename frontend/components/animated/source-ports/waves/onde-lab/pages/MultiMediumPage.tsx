/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useState, useRef, useCallback } from 'react'
import MultiMediumCanvas, { MultiMediumCanvasRef } from '../components/MultiMediumCanvas'
import { WaveMode, DualWaveMetrics } from '../physics/MultiMediumWaveEngine'
import { useTheme } from '../context/ThemeContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

interface MultiMediumPageProps {
    onNavigate: (page: 'single' | 'interference' | 'longitudinal' | 'multimedium' | 'circular') => void;
}

export default function MultiMediumPage({ onNavigate }: MultiMediumPageProps) {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';
    
    const [isPlaying, setIsPlaying] = useState(true)
    const [amplitude, setAmplitude] = useState(20)
    const [frequency, setFrequency] = useState(1.0)
    const [damping, setDamping] = useState(0.0)
    
    const [tension1, setTension1] = useState(2.5)
    const [tension2, setTension2] = useState(1.0)
    
    const [waveMode, setWaveMode] = useState<WaveMode>('oscillate')
    const [speedMode, setSpeedMode] = useState<'normal' | 'slow'>('normal')
    const [colorMode, setColorMode] = useState<'off' | 'strain' | 'displacement'>('strain')
    const [showWaveInfo, setShowWaveInfo] = useState(true)
    const [metrics, setMetrics] = useState<DualWaveMetrics | null>(null)
    
    const canvasRef = useRef<MultiMediumCanvasRef>(null)

    const handlePulse = () => canvasRef.current?.triggerPulse(amplitude)
    const handleRestart = () => {
        canvasRef.current?.reset()
    }
    const handleMetricsUpdate = useCallback((m: DualWaveMetrics) => setMetrics(m), [])

    // Keyboard shortcuts
    useKeyboardShortcuts({
        onPlayPause: () => setIsPlaying(p => !p),
        onReset: handleRestart,
        onStop: () => { setIsPlaying(false); handleRestart(); }
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

    // Accent colors (Blue for this page)
    const accent = '#707FFF';
    const accentLight = isDark ? 'text-[#A3ADFF]' : 'text-[#707FFF]';
    const accentBg = 'bg-[#707FFF]';
    
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
                        <button className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${accentBg} text-white shadow-sm`}>Milieux</button>
                        <button onClick={() => onNavigate('circular')} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${textSecondary} hover:${textPrimary}`}>Circulaire</button>
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
                    <button onClick={handleRestart} className={`px-4 py-2 rounded-full transition-all ${isDark ? 'bg-[#334155] text-[#E2E8F0] hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>Reset</button>
                </div>
            </header>
            
            {/* Main Content */}
            <main className="flex flex-1 overflow-hidden">
                <div className={`flex-1 flex flex-col ${canvasBg}`}>
                    <div className="flex-1 relative h-full">
                        <MultiMediumCanvas 
                            ref={canvasRef}
                            isPlaying={isPlaying}
                            amplitude={amplitude}
                            frequency={frequency}
                            damping={damping}
                            tension1={tension1}
                            tension2={tension2}
                            waveMode={waveMode}
                            speedMode={speedMode}
                            colorMode={colorMode}
                            showWaveInfo={showWaveInfo}
                            onMetricsUpdate={handleMetricsUpdate}
                            theme={theme}
                        />
                    </div>
                </div>
                
                {/* Controls */}
                <aside className={`w-80 ${cardBg} border-l ${borderColor} overflow-y-auto p-4 space-y-4`}>
                    {/* Source */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-[#EEF0FF]'} rounded-2xl p-4 space-y-3 border ${isDark ? 'border-[#475569]' : 'border-[#707FFF]/20'}`}>
                        <h3 className={`text-xs font-semibold ${accentLight} uppercase tracking-wider`}>Source</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setWaveMode('manual')} className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${waveMode === 'manual' ? `${accentBg} text-white shadow-sm` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Manuel</button>
                            <button onClick={() => setWaveMode('oscillate')} className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${waveMode === 'oscillate' ? `${accentBg} text-white shadow-sm` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Oscillateur</button>
                        </div>
                        {waveMode === 'manual' && (
                            <button onClick={handlePulse} className="w-full py-3 rounded-full bg-[#707FFF] text-white font-semibold hover:bg-[#5563E8] transition-all">Envoyer Impulsion</button>
                        )}
                    </section>

                    {/* Media Properties */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Propriétés des Milieux</h3>
                        
                        <div className={`space-y-2 ${isDark ? 'bg-[#1E293B]' : 'bg-[#EEF0FF]'} p-3 rounded-xl border-l-4 border-[#707FFF]`}>
                            <div className="flex justify-between text-sm mb-1">
                                <span className={`${textPrimary} font-medium`}>Milieu 1 (Haut)</span>
                                <span className={`${accentLight} font-mono`}>{tension1.toFixed(1)}</span>
                            </div>
                            <input type="range" min="0.5" max="5.0" step="0.1" value={tension1} onChange={(e) => setTension1(Number(e.target.value))} className="w-full accent-[#707FFF]" />
                            <div className={`text-xs ${textTertiary} flex justify-between`}>
                                <span>Lent (Dense)</span>
                                <span>Rapide (Léger)</span>
                            </div>
                        </div>

                        <div className={`space-y-2 ${isDark ? 'bg-[#1E293B]' : 'bg-purple-50'} p-3 rounded-xl border-l-4 border-purple-500`}>
                            <div className="flex justify-between text-sm mb-1">
                                <span className={`${textPrimary} font-medium`}>Milieu 2 (Bas)</span>
                                <span className="text-purple-500 font-mono">{tension2.toFixed(1)}</span>
                            </div>
                            <input type="range" min="0.5" max="5.0" step="0.1" value={tension2} onChange={(e) => setTension2(Number(e.target.value))} className="w-full accent-purple-500" />
                            <div className={`text-xs ${textTertiary} flex justify-between`}>
                                <span>Lent (Dense)</span>
                                <span>Rapide (Léger)</span>
                            </div>
                        </div>
                    </section>

                    {/* Basic Params */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Paramètres</h3>
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Amplitude</span>
                                <span className={`${accentLight} font-mono font-medium`}>{amplitude}</span>
                            </div>
                            <input type="range" min="5" max="60" step="1" value={amplitude} onChange={(e) => setAmplitude(Number(e.target.value))} className="w-full accent-[#707FFF]" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Fréquence</span>
                                <span className={`${accentLight} font-mono font-medium`}>{frequency.toFixed(1)} Hz</span>
                            </div>
                            <input type="range" min="0.1" max="1.5" step="0.05" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} className="w-full accent-[#707FFF]" />
                        </div>
                    </section>
                    
                    {/* Display Options */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Affichage</h3>
                        <div className="flex gap-2 mb-2">
                             <button onClick={() => setColorMode('off')} className={`flex-1 py-1.5 px-2 rounded-full text-xs font-medium transition-all ${colorMode === 'off' ? `${accentBg} text-white` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Simple</button>
                             <button onClick={() => setColorMode('strain')} className={`flex-1 py-1.5 px-2 rounded-full text-xs font-medium transition-all ${colorMode === 'strain' ? `${accentBg} text-white` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Pression</button>
                             <button onClick={() => setColorMode('displacement')} className={`flex-1 py-1.5 px-2 rounded-full text-xs font-medium transition-all ${colorMode === 'displacement' ? `${accentBg} text-white` : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>Déplace.</button>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={() => setShowWaveInfo(!showWaveInfo)} className={`py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${showWaveInfo ? 'bg-green-50 text-green-600 border border-green-200' : isDark ? 'bg-[#475569] text-[#94A3B8]' : 'bg-[#F1F5F9] text-[#94A3B8]'}`}>
                                Infos
                            </button>
                        </div>
                    </section>

                    {/* Speed Control */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Vitesse</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSpeedMode('normal')}
                                className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                                    speedMode === 'normal' 
                                        ? `${accentBg} text-white shadow-sm` 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'
                                }`}
                            >
                                Normale
                            </button>
                            <button
                                onClick={() => setSpeedMode('slow')}
                                className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                                    speedMode === 'slow' 
                                        ? 'bg-amber-500 text-white shadow-sm' 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#64748B]'
                                }`}
                            >
                                Ralenti
                            </button>
                        </div>
                    </section>

                    {/* Educational Note */}
                    <section className={`${isDark ? 'bg-[#334155]/30' : 'bg-[#F8FAFC]'} rounded-2xl p-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider mb-2`}>Comparaison des Milieux</h3>
                        <p className={`text-xs ${textTertiary} leading-relaxed`}>
                            Comparez comment les ondes se propagent dans deux milieux différents.
                            <br/><br/>
                            <span className={accentLight}>Haute tension</span> = propagation rapide (milieu léger)
                            <br/>
                            <span className={accentLight}>Basse tension</span> = propagation lente (milieu dense)
                            <br/><br/>
                            Observez les différences de longueur d'onde à fréquence constante
                        </p>
                    </section>
                </aside>
            </main>
        </div>
    )
}
