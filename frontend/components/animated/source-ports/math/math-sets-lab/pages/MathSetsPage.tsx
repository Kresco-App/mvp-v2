/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useState } from 'react';
import LabLayout from '../components/LabLayout';
import { useTheme } from '../context/ThemeContext';
import { Play, RotateCcw, StepForward, Pause } from 'lucide-react';
import PascalTriangleLab from '../math/PascalTriangleLab';

// Since the old original MathSetsPage didn't actually import SetsInclusionAnimation / VariationsAnimation, 
// wait, the original DID have dummy spans for them "Zone d'animation interactive à venir", I'll put those back.
// Actually, looking at the previous file content, it only imported React, LabLayout, useTheme.
// The broken output says SetsInclusionAnimation was imported, but looking at my first `view_file` of MathSetsPage.tsx:
// It didn't have SetsInclusionAnimation. I'll stick to the original structure I saw at step 29.

interface PageProps {
    onNavigate: (page: string) => void;
    initialMode: 'inclusion' | 'variations' | 'pascal';
}

export default function MathSetsPage({ onNavigate, initialMode }: PageProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Settings state
    const [animationSpeed, setAnimationSpeed] = useState(1);

    // Variations specific state
    const [selectedVariation, setSelectedVariation] = useState<string>('R');

    // Pascal specific state
    const [pascalRows, setPascalRows] = useState(5);
    const [pascalPlaying, setPascalPlaying] = useState(false);
    const [pascalStep, setPascalStep] = useState(0);

    const textPrimary = isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]';
    const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#64748B]';
    const cardBg = isDark ? 'bg-[#334155]/50' : 'bg-[#EFFAFF]';
    const borderColor = isDark ? 'border-[#475569]' : 'border-[#3B82F6]/20';

    const renderInclusionControls = () => (
        <section className={`${cardBg} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
            <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Paramètres</h3>
            <div className="space-y-1">
                <div className="flex justify-between text-sm">
                    <span className={textPrimary}>Vitesse d'animation</span>
                    <span className="text-blue-500 font-mono font-medium">{animationSpeed}x</span>
                </div>
                <input
                    type="range" min="0.5" max="2" step="0.5"
                    value={animationSpeed}
                    onChange={(e) => setAnimationSpeed(Number(e.target.value))}
                    className="w-full accent-blue-500"
                />
            </div>
            <div className="pt-2 border-t border-blue-500/10">
                <p className={`text-xs ${textSecondary} leading-relaxed`}>
                    Observez comment chaque ensemble de nombres est contenu dans le suivant : <br />
                    <span className="font-mono font-bold">ℕ ⊂ ℤ ⊂ ⅅ ⊂ ℚ ⊂ ℝ</span>
                </p>
            </div>
        </section>
    );

    const renderVariationsControls = () => (
        <section className={`${cardBg} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
            <h3 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Sélection de l'Ensemble</h3>

            <div className="flex flex-col gap-2">
                {[
                    { id: 'R', label: 'ℝ (Réels)', desc: 'Tous les nombres' },
                    { id: 'R+', label: 'ℝ⁺ (Réels positifs)', desc: 'Nombres ≥ 0' },
                    { id: 'R-', label: 'ℝ⁻ (Réels négatifs)', desc: 'Nombres ≤ 0' },
                    { id: 'R*', label: 'ℝ* (Réels non nuls)', desc: 'Tous sauf 0' },
                    { id: 'R*+', label: 'ℝ*⁺ (Réels strictement positifs)', desc: 'Nombres > 0' },
                    { id: 'R*-', label: 'ℝ*⁻ (Réels strictement négatifs)', desc: 'Nombres < 0' },
                ].map(variation => (
                    <button type="button"
                        key={variation.id}
                        onClick={() => setSelectedVariation(variation.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out border ${selectedVariation === variation.id
                            ? (isDark ? 'bg-[#0F172A] border-emerald-500/50 text-emerald-400' : 'bg-white border-emerald-400 text-emerald-600 shadow-sm')
                            : (isDark ? 'bg-transparent border-transparent hover:bg-[#475569]' : 'bg-transparent border-transparent hover:bg-black/5')
                            } ${selectedVariation !== variation.id ? textPrimary : ''}`}
                    >
                        <div className="font-bold text-base">{variation.label}</div>
                        <div className={`text-xs ${selectedVariation === variation.id ? (isDark ? 'text-emerald-500/80' : 'text-emerald-600/80') : textSecondary}`}>
                            {variation.desc}
                        </div>
                    </button>
                ))}
            </div>
        </section>
    );

    const renderPascalControls = () => (
        <section className={`${cardBg} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
            <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Contrôles</h3>

            <div className="space-y-1">
                <div className="flex justify-between text-sm">
                    <span className={textPrimary}>Nombre de lignes</span>
                    <span className="text-amber-500 font-mono font-medium">{pascalRows}</span>
                </div>
                <input
                    type="range" min="2" max="10" step="1"
                    value={pascalRows}
                    onChange={(e) => {
                        setPascalRows(Number(e.target.value));
                        setPascalPlaying(false);
                    }}
                    className="w-full accent-amber-500"
                />
            </div>

            <div className="flex justify-center gap-3 pt-4 border-t border-amber-500/10">
                <button type="button"
                    onClick={() => setPascalPlaying(!pascalPlaying)}
                    className={`p-3 rounded-full transition-[background-color,border-color,box-shadow,color] duration-150 ease-out ${isDark ? 'bg-[#0F172A] text-amber-400 border border-amber-500/30 hover:bg-amber-500/10' : 'bg-white text-amber-600 border border-amber-200 hover:bg-amber-50 shadow-sm'}`}
                    title={pascalPlaying ? "Pause" : "Lecture automatique"}
                >
                    {pascalPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button type="button"
                    onClick={() => {
                        setPascalPlaying(false);
                        setPascalStep(s => s + 1);
                    }}
                    className={`p-3 rounded-full transition-[background-color,border-color,box-shadow,color] duration-150 ease-out ${isDark ? 'bg-[#0F172A] text-amber-400 border border-amber-500/30 hover:bg-amber-500/10' : 'bg-white text-amber-600 border border-amber-200 hover:bg-amber-50 shadow-sm'}`}
                    title="Pas à pas"
                >
                    <StepForward size={20} />
                </button>
                <button type="button"
                    onClick={() => {
                        setPascalPlaying(false);
                        setPascalRows(r => {
                            setTimeout(() => setPascalRows(r), 0);
                            return r - 1;
                        });
                    }}
                    className={`p-3 rounded-full transition-[background-color,border-color,box-shadow,color] duration-150 ease-out ${isDark ? 'bg-[#0F172A] text-amber-400 border border-amber-500/30 hover:bg-amber-500/10' : 'bg-white text-amber-600 border border-amber-200 hover:bg-amber-50 shadow-sm'}`}
                    title="Réinitialiser"
                >
                    <RotateCcw size={20} />
                </button>
            </div>

            <div className="pt-2 border-t border-amber-500/10">
                <p className={`text-xs ${textSecondary} leading-relaxed`}>
                    Le triangle de Pascal se construit en additionnant les deux nombres situés au-dessus pour obtenir le nombre en dessous.
                </p>
            </div>
        </section>
    );

    const canvasContent = (
        <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <h2 className={`text-2xl font-bold mb-4 ${textPrimary}`}>
                {initialMode === 'inclusion' ? 'Inclusion : ℕ ⊂ ℤ ⊂ ⅅ ⊂ ℚ ⊂ ℝ' :
                    initialMode === 'variations' ? `Définition de ${selectedVariation}` :
                        'Triangle de Pascal'}
            </h2>
            <div className={`flex-1 w-full max-w-4xl rounded-2xl border ${borderColor} ${isDark ? 'bg-[#0F172A]/50' : 'bg-white/50'} backdrop-blur-sm flex items-center justify-center relative overflow-hidden`}>
                {initialMode === 'pascal' ? (
                    <PascalTriangleLab
                        key={pascalRows}
                        rows={pascalRows}
                        stepSpeed={animationSpeed}
                        isPlaying={pascalPlaying}
                        currentStepCounter={pascalStep}
                        onComplete={() => setPascalPlaying(false)}
                    />
                ) : (
                    <span className={textSecondary}>[Zone d'animation interactive à venir]</span>
                )}
            </div>
        </div>
    );

    return (
        <LabLayout
            title={initialMode === 'inclusion' ? 'Inclusion des Ensembles' : initialMode === 'pascal' ? 'Triangle de Pascal' : 'Les Variations de ℝ'}
            onNavigate={onNavigate}
            currentPage={initialMode}
            canvasContent={canvasContent}
            controlsContent={initialMode === 'inclusion' ? renderInclusionControls() : initialMode === 'pascal' ? renderPascalControls() : renderVariationsControls()}
            accentColor={initialMode === 'inclusion' ? 'blue' : initialMode === 'pascal' ? 'amber' : 'emerald'}
            headerActions={
                <button type="button"
                    onClick={() => {
                        setAnimationSpeed(1);
                        setSelectedVariation('R');
                        setPascalRows(5);
                        setPascalPlaying(false);
                    }}
                    className={`px-4 py-2 rounded-full font-medium transition-[background-color,color] duration-150 ease-out ${isDark ? 'bg-[#334155] text-[#E2E8F0] hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'} text-sm`}
                >
                    Réinitialiser
                </button>
            }
        />
    );
}
