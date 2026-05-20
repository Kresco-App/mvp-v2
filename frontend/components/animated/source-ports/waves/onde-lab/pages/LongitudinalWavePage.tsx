/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useState, useRef, useCallback } from 'react'
import LongitudinalCanvas, { LongitudinalCanvasRef } from '../components/LongitudinalCanvas'
import DisplacementGraph from '../components/DisplacementGraph'
import { EndCondition, WaveMode, WaveMetrics, TracerData } from '../physics/LongitudinalWaveEngine'
import { useTracerHistory } from '../hooks/useTracerHistory'
import { useTheme } from '../context/ThemeContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

interface LongitudinalWavePageProps {
    onNavigate: (page: 'single' | 'interference' | 'longitudinal' | 'multimedium' | 'circular') => void;
}

export default function LongitudinalWavePage({ onNavigate }: LongitudinalWavePageProps) {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';
    
    const [isPlaying, setIsPlaying] = useState(true)
    const [amplitude, setAmplitude] = useState(40)
    const [frequency, setFrequency] = useState(1.0)
    const [damping, setDamping] = useState(0.0)
    const [tension, setTension] = useState(2.5)
    const [endCondition, setEndCondition] = useState<EndCondition>('none')
    const [waveMode, setWaveMode] = useState<WaveMode>('manual')
    const [speedMode, setSpeedMode] = useState<'normal' | 'slow'>('normal')
    const [showRuler, setShowRuler] = useState(true)
    const [showReferenceLine, setShowReferenceLine] = useState(true)
    const [showTracerPoints, setShowTracerPoints] = useState(true)
    const [showWaveInfo, setShowWaveInfo] = useState(true)
    const [showGraph, setShowGraph] = useState(true)
    const [colorMode, setColorMode] = useState<'off' | 'strain' | 'displacement'>('strain')
    const [metrics, setMetrics] = useState<WaveMetrics | null>(null)
    const [theoreticalDt, setTheoreticalDt] = useState<string>('--')
    
    const canvasRef = useRef<LongitudinalCanvasRef>(null)
    
    const tracerHistory = useTracerHistory({ maxDuration: 8, maxPoints: 480 })

    const handlePulse = () => canvasRef.current?.triggerPulse(amplitude)
    const handleRestart = () => {
        canvasRef.current?.reset()
        tracerHistory.clear()
        setTheoreticalDt('--')
    }
    const handleMetricsUpdate = useCallback((m: WaveMetrics) => setMetrics(m), [])

    // Keyboard shortcuts
    useKeyboardShortcuts({
        onPlayPause: () => setIsPlaying(p => !p),
        onReset: handleRestart,
        onStop: () => { setIsPlaying(false); handleRestart(); }
    });
    
    const handleTracerUpdate = useCallback((tracer1: TracerData | null, tracer2: TracerData | null) => {
        if (tracer1) {
            tracerHistory.addPoint1({
                time: tracer1.time,
                displacement: tracer1.displacement,
                velocity: tracer1.velocity,
            })
        }
        if (tracer2) {
            tracerHistory.addPoint2({
                time: tracer2.time,
                displacement: tracer2.displacement,
                velocity: tracer2.velocity,
            })
        }
        
        if (tracer1 && tracer2 && metrics && metrics.waveSpeed > 0) {
            const x1Base = tracer1.x - tracer1.displacement;
            const x2Base = tracer2.x - tracer2.displacement;
            const distPx = Math.abs(x2Base - x1Base);
            const distCm = distPx / 10;
            const dt = distCm / metrics.waveSpeed;
            setTheoreticalDt(dt.toFixed(3) + ' s');
        } else {
            setTheoreticalDt('--');
        }
    }, [tracerHistory, metrics])

    const boundaryInfo: Record<EndCondition, { title: string; desc: string }> = {
        fixed: { title: 'Fixe', desc: 'La compression se réfléchit en détente (inversée)' },
        loose: { title: 'Libre', desc: 'La compression se réfléchit en compression (même phase)' },
        none: { title: 'Infinie', desc: 'L\'onde passe à travers - pas de réflexion' }
    }

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
                    
                    {/* Tab Navigation - Pill Style */}
                    <div className={`flex ${isDark ? 'bg-[#334155]' : 'bg-[#F1F5F9]'} rounded-full p-1 gap-1`}>
                        <button onClick={() => onNavigate('single')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${textSecondary} hover:${textPrimary}`}>
                            Onde Simple
                        </button>
                        <button onClick={() => onNavigate('interference')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${textSecondary} hover:${textPrimary}`}>
                            Collision
                        </button>
                        <button className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${accentBg} text-white shadow-sm`}>
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
                        className={`px-4 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${
                            isPlaying 
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
                {/* Canvas Area + Graph */}
                <div className={`flex-1 flex flex-col ${canvasBg}`}>
                    {/* Simulation Canvas */}
                    <div className="flex-1 relative" style={{ minHeight: showGraph ? '55%' : '100%' }}>
                        <LongitudinalCanvas 
                            ref={canvasRef}
                            isPlaying={isPlaying}
                            amplitude={amplitude}
                            frequency={frequency}
                            damping={damping}
                            tension={tension}
                            endCondition={endCondition}
                            waveMode={waveMode}
                            speedMode={speedMode}
                            colorMode={colorMode}
                            noiseFilter={true}
                            showRuler={showRuler}
                            showReferenceLine={showReferenceLine}
                            showTracerPoints={showTracerPoints}
                            showWaveInfo={showWaveInfo}
                            onMetricsUpdate={handleMetricsUpdate}
                            onTracerUpdate={handleTracerUpdate}
                            theme={theme}
                        />
                    </div>
                    
                    {/* Displacement-Time Graph */}
                    {showGraph && showTracerPoints && (
                        <DisplacementGraph
                            history1Ref={tracerHistory.history1Ref}
                            history2Ref={tracerHistory.history2Ref}
                            maxAmplitude={Math.max(80, amplitude * 1.5)}
                            timeWindow={6}
                            isPlaying={isPlaying}
                            height={200}
                            theme={theme}
                        />
                    )}
                    
                    {/* Graph hint when tracers off */}
                    {showGraph && !showTracerPoints && (
                        <div 
                            className={`flex items-center justify-center ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'} border-t text-sm ${textSecondary}`}
                            style={{ height: '60px' }}
                        >
                            Activez "Traceurs" pour voir le graphique
                        </div>
                    )}
                </div>
                
                {/* Controls Panel */}
                <aside className={`w-80 ${cardBg} border-l ${borderColor} overflow-y-auto p-4 space-y-4`}>
                    
                    {/* Wave Source */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-[#FFF9EB]'} rounded-2xl p-4 space-y-3 border ${isDark ? 'border-[#475569]' : 'border-[#FBAE17]/20'}`}>
                        <h3 className={`text-xs font-semibold uppercase tracking-wider ${accentLight}`}>Source d'Onde</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setWaveMode('manual')}
                                className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                                    waveMode === 'manual' 
                                        ? `${accentBg} text-white shadow-sm` 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Manuel
                            </button>
                            <button
                                onClick={() => setWaveMode('oscillate')}
                                className={`flex-1 py-2 px-3 rounded-full text-sm font-medium transition-all ${
                                    waveMode === 'oscillate' 
                                        ? `${accentBg} text-white shadow-sm` 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Oscillateur
                            </button>
                        </div>
                        {waveMode === 'manual' && (
                            <button
                                onClick={handlePulse}
                                className="w-full py-3 rounded-full bg-[#FBAE17] text-white font-semibold hover:bg-[#E09A00] transition-all"
                            >
                                Envoyer Compression
                            </button>
                        )}
                        <p className={`text-xs ${textTertiary}`}>
                            {waveMode === 'manual' 
                                ? 'Cliquez sur le bouton ou glissez la plaque source' 
                                : 'Génération continue d\'onde longitudinale'}
                        </p>
                    </section>

                    {/* Physics Parameters */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Physique</h3>
                        
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Amplitude</span>
                                <span className={`${accentLight} font-mono font-medium`}>{(amplitude / 10).toFixed(1)} cm</span>
                            </div>
                            <input
                                type="range" min="10" max="80" step="5"
                                value={amplitude}
                                onChange={(e) => setAmplitude(Number(e.target.value))}
                                className="w-full accent-[#FBAE17]"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Fréquence</span>
                                <span className={`${accentLight} font-mono font-medium`}>{frequency.toFixed(1)} Hz</span>
                            </div>
                            <input
                                type="range" min="0.2" max="3.0" step="0.1"
                                value={frequency}
                                onChange={(e) => setFrequency(Number(e.target.value))}
                                className="w-full accent-[#FBAE17]"
                            />
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
                                className="w-full accent-[#FBAE17]"
                            />
                            <p className={`text-xs ${textTertiary}`}>Haute tension = ondes plus rapides</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className={textPrimary}>Amortissement</span>
                                <span className={`${accentLight} font-mono font-medium`}>{(damping * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="0.1" step="0.005"
                                value={damping}
                                onChange={(e) => setDamping(Number(e.target.value))}
                                className="w-full accent-[#FBAE17]"
                            />
                        </div>
                    </section>

                    {/* Boundary Condition */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Extrémité</h3>
                        <div className="grid grid-cols-3 gap-2">
                            {(['fixed', 'loose', 'none'] as EndCondition[]).map((bc) => (
                                <button
                                    key={bc}
                                    onClick={() => setEndCondition(bc)}
                                    className={`py-2 px-2 rounded-full text-xs font-medium transition-all ${
                                        endCondition === bc 
                                            ? `${accentBg} text-white shadow-sm` 
                                            : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                    }`}
                                >
                                    {boundaryInfo[bc].title}
                                </button>
                            ))}
                        </div>
                        <div className={`${isDark ? 'bg-[#1E293B]' : 'bg-[#FFF9EB]'} rounded-xl p-3 border-l-4 border-[#FBAE17]`}>
                            <p className={`text-xs ${textSecondary}`}>{boundaryInfo[endCondition].desc}</p>
                        </div>
                    </section>

                    {/* Visualization */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Affichage</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { key: 'ruler', label: 'Règle', state: showRuler, set: setShowRuler },
                                { key: 'ref', label: 'Grille', state: showReferenceLine, set: setShowReferenceLine },
                                { key: 'tracer', label: 'Traceurs', state: showTracerPoints, set: setShowTracerPoints },
                                { key: 'info', label: 'Infos', state: showWaveInfo, set: setShowWaveInfo },
                                { key: 'graph', label: 'Graphe', state: showGraph, set: setShowGraph },
                            ].map(({ key, label, state, set }) => (
                                <button
                                    key={key}
                                    onClick={() => set(!state)}
                                    className={`py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                                        state 
                                            ? 'bg-green-50 text-green-600 border border-green-200' 
                                            : isDark ? 'bg-[#475569] text-[#94A3B8] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0]'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {showTracerPoints && (
                            <p className={`text-xs ${textTertiary} mt-2`}>
                                Glissez les marqueurs sur le ressort
                            </p>
                        )}
                    </section>

                    {/* Color Mode */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Mode Couleur</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setColorMode('off')}
                                className={`flex-1 py-2 px-2 rounded-full text-xs font-medium transition-all ${
                                    colorMode === 'off' 
                                        ? `${isDark ? 'bg-[#64748B]' : 'bg-[#94A3B8]'} text-white` 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Off
                            </button>
                            <button
                                onClick={() => setColorMode('strain')}
                                className={`flex-1 py-2 px-2 rounded-full text-xs font-medium transition-all ${
                                    colorMode === 'strain' 
                                        ? `${accentBg} text-white` 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Déformation
                            </button>
                            <button
                                onClick={() => setColorMode('displacement')}
                                className={`flex-1 py-2 px-2 rounded-full text-xs font-medium transition-all ${
                                    colorMode === 'displacement' 
                                        ? 'bg-purple-500 text-white' 
                                        : isDark ? 'bg-[#475569] text-[#E2E8F0] hover:bg-[#64748B]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                                }`}
                            >
                                Déplacement
                            </button>
                        </div>
                        <div className={`${isDark ? 'bg-[#1E293B]' : 'bg-[#F8FAFC]'} rounded-xl p-3 border-l-4 ${isDark ? 'border-[#64748B]' : 'border-[#94A3B8]'}`}>
                            <p className={`text-xs ${textSecondary}`}>
                                {colorMode === 'off' && 'Gris uniforme - aucune coloration'}
                                {colorMode === 'strain' && (
                                    <>
                                        <span className="text-[#FBAE17]">Ambre = Compression</span>
                                        <br />
                                        <span className="text-cyan-500">Cyan = Détente</span>
                                    </>
                                )}
                                {colorMode === 'displacement' && 'Intensité violette = distance à l\'équilibre'}
                            </p>
                        </div>
                    </section>

                    {/* Speed Control */}
                    <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>Vitesse</h3>
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

                    {/* Theoretical Delta T */}
                    <section className={`${isDark ? 'bg-gradient-to-br from-[#334155] to-[#1E293B]' : 'bg-gradient-to-br from-[#ECFDF5] to-[#D1FAE5]'} rounded-2xl p-4 space-y-3 border ${isDark ? 'border-[#475569]' : 'border-green-200'}`}>
                        <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wider">Delta Temps Théorique</h3>
                        <div className="text-center">
                            <div className={`font-mono text-3xl ${textPrimary} tracking-wider mb-1`}>
                                {theoreticalDt}
                            </div>
                            <div className={`text-xs ${textTertiary}`}>
                                Δt = Δx / v (distance à l'équilibre)
                            </div>
                        </div>
                    </section>

                    {/* Metrics */}
                    {metrics && (
                        <section className={`${isDark ? 'bg-gradient-to-br from-[#FFF9EB]/10 to-[#FBAE17]/5' : 'bg-gradient-to-br from-[#FFF9EB] to-[#FEF3C7]'} rounded-2xl p-4 space-y-3 border ${isDark ? 'border-[#FBAE17]/30' : 'border-[#FBAE17]/20'}`}>
                            <h3 className={`text-xs font-semibold ${accentLight} uppercase tracking-wider`}>Mesures</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Vitesse', value: `${metrics.waveSpeed.toFixed(1)} cm/s` },
                                    { label: 'Long. Onde', value: `${metrics.wavelength.toFixed(1)} cm` },
                                    { label: 'Période', value: `${metrics.period.toFixed(2)} s` },
                                    { label: 'Dépl Max', value: `${metrics.maxAmplitude.toFixed(1)} cm` },
                                ].map(({ label, value }) => (
                                    <div key={label} className={`${isDark ? 'bg-[#1E293B]/80' : 'bg-white/80'} rounded-xl p-2`}>
                                        <div className={`text-xs ${textTertiary}`}>{label}</div>
                                        <div className={`text-sm font-mono ${accentLight} font-medium`}>{value}</div>
                                    </div>
                                ))}
                            </div>
                            <div className={`text-center text-xs text-green-500 font-mono ${isDark ? 'bg-green-500/10' : 'bg-green-50'} rounded-full py-1`}>
                                v = f × λ
                            </div>
                        </section>
                    )}
                    
                    {/* Educational Note */}
                    <section className={`${isDark ? 'bg-[#334155]/30' : 'bg-[#F8FAFC]'} rounded-2xl p-4 border ${borderColor}`}>
                        <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider mb-2`}>Ondes Longitudinales</h3>
                        <p className={`text-xs ${textTertiary} leading-relaxed`}>
                            Les particules se déplacent <span className={accentLight}>parallèlement</span> à l'onde (va-et-vient).
                            <br/><br/>
                            Le graphique montre le <span className={accentLight}>déplacement horizontal</span> au cours du temps.
                            <br/><br/>
                            Les ondes sonores sont des ondes longitudinales !
                        </p>
                    </section>
                </aside>
            </main>
        </div>
    )
}
