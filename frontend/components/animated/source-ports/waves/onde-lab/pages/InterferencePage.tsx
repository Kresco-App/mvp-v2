/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useState, useRef, useCallback } from 'react'
import InterferenceCanvas, { InterferenceCanvasRef } from '../components/InterferenceCanvas'
import { InterferenceMetrics, InterferenceMode } from '../physics/InterferenceEngine'
import { useTheme } from '../context/ThemeContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

interface InterferencePageProps {
    onNavigate: (page: 'single' | 'interference' | 'longitudinal' | 'multimedium' | 'circular') => void;
}

export default function InterferencePage({ onNavigate }: InterferencePageProps) {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';
    
    const [isPlaying, setIsPlaying] = useState(false)
    const [amplitude, setAmplitude] = useState(150)
    const [pulseWidth, setPulseWidth] = useState(150)
    const [tension, setTension] = useState(2.5)
    const [mode, setMode] = useState<InterferenceMode>('constructive')
    const [speedMode, setSpeedMode] = useState<'normal' | 'slow'>('normal')
    
    // Time slider state
    const [timeSliderValue, setTimeSliderValue] = useState(0)
    const [pulsesLaunched, setPulsesLaunched] = useState(false)
    
    // Display toggles
    const [showGhostWaves, setShowGhostWaves] = useState(true)
    const [showResultant, setShowResultant] = useState(true)
    const [showRuler, setShowRuler] = useState(true)
    const [showReferenceLine, setShowReferenceLine] = useState(true)
    const [showWaveInfo, setShowWaveInfo] = useState(true)
    
    const [metrics, setMetrics] = useState<InterferenceMetrics | null>(null)
    
    const canvasRef = useRef<InterferenceCanvasRef>(null)

    const handleRestart = () => {
        canvasRef.current?.reset()
        setTimeSliderValue(0)
        setPulsesLaunched(false)
        setIsPlaying(false)
    }

    // Keyboard shortcuts
    useKeyboardShortcuts({
        onPlayPause: () => setIsPlaying(p => !p),
        onReset: handleRestart,
        onStop: () => { setIsPlaying(false); handleRestart(); }
    });
    
    const handleSendPulse1 = () => {
        canvasRef.current?.sendPulse1()
        setPulsesLaunched(true)
    }
    
    const handleSendPulse2 = () => {
        canvasRef.current?.sendPulse2()
        setPulsesLaunched(true)
    }
    
    const handleSendBothPulses = () => {
        canvasRef.current?.reset()
        setTimeout(() => {
            canvasRef.current?.sendBothPulses()
            setPulsesLaunched(true)
            setTimeSliderValue(0)
            setIsPlaying(true)
        }, 10)
    }
    
    const handleTimeSliderChange = (value: number) => {
        setTimeSliderValue(value)
        setIsPlaying(false)
        canvasRef.current?.seekToTime(value / 100)
    }
    
    const handleMetricsUpdate = useCallback((m: InterferenceMetrics) => {
        setMetrics(m)
        if (m.currentTime !== undefined) {
            setTimeSliderValue(m.currentTime * 100)
        }
    }, [])

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
                    
                    {/* Tab Navigation - Pill Style */}
                    <div className={`flex ${isDark ? 'bg-[#334155]' : 'bg-[#F1F5F9]'} rounded-full p-1 gap-1`}>
                        <button onClick={() => onNavigate('single')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${textSecondary} hover:${textPrimary}`}>
                            Onde Simple
                        </button>
                        <button className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${accentBg} text-white shadow-sm`}>
                            Collision
                        </button>
                        <button onClick={() => onNavigate('longitudinal')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${textSecondary} hover:${textPrimary}`}>
                            Longitudinale
                        </button>
                        <button onClick={() => onNavigate('multimedium')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${textSecondary} hover:${textPrimary}`}>
                            Milieux
                        </button>
                        <button onClick={() => onNavigate('circular')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${textSecondary} hover:${textPrimary}`}>
                            Circulaire
                        </button>
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
                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        disabled={!pulsesLaunched}
                        className={`px-4 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${
                            !pulsesLaunched 
                                ? isDark ? 'bg-[#334155] text-[#64748B] cursor-not-allowed' : 'bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed'
                                : isPlaying 
                                    ? 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100' 
                                    : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                        }`}
                    >
                        {isPlaying ? 'Pause' : 'Lecture'}
                    </button>
                    <button onClick={handleRestart} className={`px-4 py-2 rounded-full transition-all ${isDark ? 'bg-[#334155] text-[#E2E8F0] hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
                        Reset
                    </button>
                </div>
            </header>
            
            {/* Main Content */}
            <main className="flex flex-1 overflow-hidden">
                {/* Canvas Area */}
                <div className={`flex-1 flex flex-col ${canvasBg}`}>
                    <div className="flex-1 relative">
                        <InterferenceCanvas 
                            ref={canvasRef}
                            isPlaying={isPlaying}
                            amplitude={amplitude}
                            pulseWidth={pulseWidth}
                            tension={tension}
                            mode={mode}
                            speedMode={speedMode}
                            showGhostWaves={showGhostWaves}
                            showResultant={showResultant}
                            showRuler={showRuler}
                            showReferenceLine={showReferenceLine}
                            showWaveInfo={showWaveInfo}
                            onMetricsUpdate={handleMetricsUpdate}
                            theme={theme}
                        />
                    </div>
                    
                    {/* Time Slider Bar */}
                    {pulsesLaunched && (
                        <div className={`${isDark ? 'bg-[#1E293B]' : 'bg-white'} border-t ${borderColor} px-6 py-4`}>
                            <div className="flex items-center gap-4">
                                <span className={`text-xs ${textSecondary} font-medium w-16`}>Temps</span>
                                <div className="flex-1 relative">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        value={timeSliderValue}
                                        onChange={(e) => handleTimeSliderChange(Number(e.target.value))}
                                        className="w-full h-3 appearance-none rounded-full cursor-pointer accent-[#707FFF]"
                                        style={{
                                            background: `linear-gradient(to right, #707FFF 0%, #707FFF ${timeSliderValue}%, ${isDark ? '#334155' : '#E2E8F0'} ${timeSliderValue}%, ${isDark ? '#334155' : '#E2E8F0'} 100%)`
                                        }}
                                    />
                                    {/* Collision marker at 50% */}
                                    <div 
                                        className="absolute top-1/2 -translate-y-1/2 w-1 h-5 bg-[#FBAE17] rounded pointer-events-none"
                                        style={{ left: '50%', transform: 'translateX(-50%) translateY(-50%)' }}
                                        title="Point de collision"
                                    />
                                </div>
                                <span className={`text-xs ${accentLight} font-mono w-12 text-right`}>
                                    {timeSliderValue.toFixed(0)}%
                                </span>
                            </div>
                            <div className={`flex justify-between text-xs ${textTertiary} mt-1 px-16`}>
                                <span>Début</span>
                                <span className="text-[#FBAE17]">Collision</span>
                                <span>Fin</span>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Controls Panel */}
                <aside className={`w-80 ${cardBg} border-l ${borderColor} overflow-y-auto p-4 space-y-4`}>
                    
                    {/* Send Pulse Controls */}
                    <section className={`${isDark ? 'bg-gradient-to-br from-[#707FFF]/20 to-[#334155]' : 'bg-gradient-to-br from-[#EEF0FF] to-[#F8F9FF]'} rounded-2xl p-4 space-y-3 border ${isDark ? 'border-[#707FFF]/30' : 'border-[#707FFF]/20'}`}>
                        <h3 className={`text-xs font-semibold ${accentLight} uppercase tracking-wider`}>Envoyer Impulsions</h3>
                        
                        <button
                            onClick={handleSendBothPulses}
                            className="w-full py-4 rounded-full bg-[#707FFF] text-white font-bold text-lg hover:bg-[#5563E8] transition-all"
                        >
                            Envoyer les Deux
                        </button>
                        
                        <div className="flex gap-2">
                            <button
                                onClick={handleSendPulse1}
                                className={`flex-1 py-3 rounded-full font-medium transition-all ${isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'}`}
                            >
                                Pulse 1 →
                            </button>
                            <button
                                onClick={handleSendPulse2}
                                className={`flex-1 py-3 rounded-full font-medium transition-all ${isDark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500/30' : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'}`}
                            >
                                ← Pulse 2
                            </button>
                        </div>
                        
                        <p className={`text-xs ${textTertiary}`}>
                            Envoyez des impulsions puis utilisez la barre de temps
                        </p>
                    </section>

                    {/* Interference Mode */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${accentLight} uppercase tracking-wider`}>Type de Collision</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setMode('constructive')}
                                className={`flex-1 py-3 px-3 rounded-full text-sm font-medium transition-all ${
                                    mode === 'constructive' 
                                        ? 'bg-green-500 text-white' 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Constructive
                            </button>
                            <button
                                onClick={() => setMode('destructive')}
                                className={`flex-1 py-3 px-3 rounded-full text-sm font-medium transition-all ${
                                    mode === 'destructive' 
                                        ? 'bg-red-500 text-white' 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Destructive
                            </button>
                        </div>
                        <div className={`${isDark ? 'bg-[#1E293B]' : 'bg-[#EEF0FF]'} rounded-xl p-3 border-l-4 border-[#707FFF]`}>
                            <p className={`text-xs ${textSecondary}`}>
                                {mode === 'constructive' 
                                    ? 'Deux impulsions HAUT : Amplitude DOUBLE (A + A = 2A)'
                                    : 'Une HAUT, une BAS : Elles s\'ANNULENT (A + (-A) = 0)'}
                            </p>
                        </div>
                    </section>

                    {/* Pulse Parameters */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Paramètres</h3>
                        
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Amplitude</span>
                                <span className={`${accentLight} font-mono font-medium`}>{(amplitude / 10).toFixed(1)} cm</span>
                            </div>
                            <input
                                type="range" min="100" max="300" step="10"
                                value={amplitude}
                                onChange={(e) => setAmplitude(Number(e.target.value))}
                                className="w-full accent-[#707FFF]"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Largeur Impulsion</span>
                                <span className={`${accentLight} font-mono font-medium`}>{(pulseWidth / 10).toFixed(1)} cm</span>
                            </div>
                            <input
                                type="range" min="100" max="200" step="10"
                                value={pulseWidth}
                                onChange={(e) => setPulseWidth(Number(e.target.value))}
                                className="w-full accent-[#707FFF]"
                            />
                            <p className={`text-xs ${textTertiary}`}>Largeur de chaque impulsion</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Tension</span>
                                <span className={`${accentLight} font-mono font-medium`}>{tension.toFixed(1)}</span>
                            </div>
                            <input
                                type="range" min="0.5" max="5.0" step="0.1"
                                value={tension}
                                onChange={(e) => setTension(Number(e.target.value))}
                                className="w-full accent-[#707FFF]"
                            />
                            <p className={`text-xs ${textTertiary}`}>Haute tension = plus rapide</p>
                        </div>
                    </section>

                    {/* Display Options */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Affichage</h3>
                        <div className="space-y-2">
                            <button
                                onClick={() => setShowResultant(!showResultant)}
                                className={`w-full py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center gap-3 ${
                                    showResultant 
                                        ? `${isDark ? 'bg-[#707FFF]/20' : 'bg-[#EEF0FF]'} ${accentLight} border ${isDark ? 'border-[#707FFF]/50' : 'border-[#707FFF]/30'}` 
                                        : isDark ? 'bg-[#475569] text-[#94A3B8] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                <span className={`w-4 h-2 rounded ${showResultant ? 'bg-[#707FFF]' : isDark ? 'bg-[#64748B]' : 'bg-[#94A3B8]'}`} />
                                Corde (Position Réelle)
                            </button>
                            <button
                                onClick={() => setShowGhostWaves(!showGhostWaves)}
                                className={`w-full py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center gap-3 ${
                                    showGhostWaves 
                                        ? `${isDark ? 'bg-[#475569]/50' : 'bg-[#F1F5F9]'} ${textSecondary} border ${isDark ? 'border-[#64748B]' : 'border-[#E2E8F0]'}` 
                                        : isDark ? 'bg-[#475569] text-[#94A3B8] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                <span className={`w-4 h-1 rounded ${showGhostWaves ? isDark ? 'bg-[#94A3B8]' : 'bg-[#64748B]' : isDark ? 'bg-[#64748B]' : 'bg-[#94A3B8]'}`} style={{borderBottom: showGhostWaves ? '2px dashed currentColor' : 'none'}} />
                                Ondes Fantômes
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {[
                                { key: 'ruler', label: 'Règle', state: showRuler, set: setShowRuler },
                                { key: 'ref', label: 'Réf.', state: showReferenceLine, set: setShowReferenceLine },
                                { key: 'info', label: 'Info', state: showWaveInfo, set: setShowWaveInfo },
                            ].map(({ key, label, state, set }) => (
                                <button
                                    key={key}
                                    onClick={() => set(!state)}
                                    className={`py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                                        state 
                                            ? 'bg-green-50 text-green-600 border border-green-200' 
                                            : isDark ? 'bg-[#475569] text-[#94A3B8] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0]'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
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
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Normale
                            </button>
                            <button
                                onClick={() => setSpeedMode('slow')}
                                className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                                    speedMode === 'slow' 
                                        ? 'bg-amber-500 text-white shadow-sm' 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Ralenti
                            </button>
                        </div>
                    </section>

                    {/* Metrics */}
                    {metrics && pulsesLaunched && (
                        <section className={`${isDark ? 'bg-gradient-to-br from-[#707FFF]/10 to-[#334155]' : 'bg-gradient-to-br from-[#EEF0FF] to-[#F8F9FF]'} rounded-2xl p-4 space-y-3 border ${isDark ? 'border-[#707FFF]/20' : 'border-[#707FFF]/20'}`}>
                            <h3 className={`text-xs font-semibold ${accentLight} uppercase tracking-wider`}>Mesures</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Vitesse', value: `${metrics.waveSpeed.toFixed(1)} cm/s` },
                                    { label: 'Amp Max', value: `${metrics.maxAmplitude.toFixed(2)} cm` },
                                    { label: 'Pos Pulse 1', value: `${metrics.pulse1Position.toFixed(1)} cm` },
                                    { label: 'Pos Pulse 2', value: `${metrics.pulse2Position.toFixed(1)} cm` },
                                ].map(({ label, value }) => (
                                    <div key={label} className={`${isDark ? 'bg-[#1E293B]/80' : 'bg-white/80'} rounded-xl p-2`}>
                                        <div className={`text-xs ${textTertiary}`}>{label}</div>
                                        <div className={`text-sm font-mono ${accentLight} font-medium`}>{value}</div>
                                    </div>
                                ))}
                            </div>
                            {metrics.collisionProgress > 0 && (
                                <div className={`text-center text-sm font-bold py-2 rounded-full ${
                                    mode === 'constructive' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-500 border border-red-200'
                                }`}>
                                    COLLISION: {(metrics.collisionProgress * 100).toFixed(0)}%
                                </div>
                            )}
                            <div className={`text-center text-xs text-[#707FFF] font-mono ${isDark ? 'bg-[#707FFF]/10' : 'bg-[#EEF0FF]'} rounded-full py-1`}>
                                y = y1 + y2 (superposition)
                            </div>
                        </section>
                    )}
                    
                    {/* Educational Note */}
                    <section className={`${isDark ? 'bg-[#334155]/30' : 'bg-[#F8FAFC]'} rounded-2xl p-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider mb-2`}>Comment Utiliser</h3>
                        <p className={`text-xs ${textTertiary} leading-relaxed`}>
                            1. Cliquez sur <span className={accentLight}>"Envoyer les Deux"</span>
                            <br/><br/>
                            2. Utilisez la <span className={accentLight}>barre de temps</span> pour naviguer
                            <br/><br/>
                            3. Le marqueur jaune indique la collision
                            <br/><br/>
                            <span className="text-green-500">Constructive:</span> 2x amplitude
                            <br/>
                            <span className="text-red-500">Destructive:</span> Amplitude nulle
                        </p>
                    </section>
                </aside>
            </main>
        </div>
    )
}
