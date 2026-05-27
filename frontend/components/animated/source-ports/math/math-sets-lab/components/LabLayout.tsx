/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import type { ReactNode } from 'react';
import { useTheme } from '../context/ThemeContext';

interface LabLayoutProps {
    title: string;
    onNavigate: (page: string) => void;
    currentPage: string;
    canvasContent: ReactNode;
    controlsContent: ReactNode;
    headerActions?: ReactNode;
    accentColor?: string; // e.g. 'amber', 'cyan', 'purple', 'blue'
}

export default function LabLayout({
    title,
    onNavigate,
    currentPage,
    canvasContent,
    controlsContent,
    headerActions,
    accentColor = 'blue'
}: LabLayoutProps) {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    // Theme-aware colors matching onde-lab / light-lab style
    const bg = isDark ? 'bg-[#0F172A]' : 'bg-[#FAFAFA]';
    const headerBg = isDark ? 'bg-[#1E293B]' : 'bg-white';
    const borderColor = isDark ? 'border-[#334155]' : 'border-[#E2E8F0]';
    const cardBg = isDark ? 'bg-[#1E293B]' : 'bg-white';
    const textPrimary = isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]';
    const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#64748B]';
    const canvasBg = isDark ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]';

    // Accent mappings matching the premium aesthetic
    const accents: Record<string, { light: string, bg: string, title: string }> = {
        amber: { light: 'text-amber-400', bg: 'bg-amber-500', title: 'text-amber-400' },
        cyan: { light: 'text-cyan-400', bg: 'bg-cyan-500', title: 'text-cyan-400' },
        purple: { light: 'text-purple-400', bg: 'bg-purple-500', title: 'text-purple-400' },
        blue: { light: 'text-blue-400', bg: 'bg-blue-500', title: 'text-blue-400' },
        emerald: { light: 'text-emerald-400', bg: 'bg-emerald-500', title: 'text-emerald-400' }
    };

    const currentAccent = accents[accentColor] || accents.blue;

    return (
        <div className={`flex flex-col h-screen ${bg} text-slate-100 font-sans transition-colors duration-200`}>
            {/* Header */}
            <header className={`flex items-center justify-between px-6 py-3 ${headerBg} border-b ${borderColor} shadow-sm shrink-0 transition-colors duration-200`}>
                <div className="flex items-center gap-4">
                    <h1 className={`text-xl font-bold ${currentAccent.title}`}>Math Sets Lab</h1>

                    {/* Tab Navigation - Pill Style */}
                    <div className={`flex ${isDark ? 'bg-[#334155]' : 'bg-[#F1F5F9]'} rounded-full p-1 gap-1`}>
                        <button type="button"
                            onClick={() => onNavigate('inclusion')}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${currentPage === 'inclusion' ? 'bg-blue-500 text-white shadow-sm' : `${textSecondary} hover:${textPrimary}`
                                }`}
                        >
                            Inclusion des Ensembles
                        </button>
                        <button type="button"
                            onClick={() => onNavigate('variations')}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${currentPage === 'variations' ? 'bg-emerald-500 text-white shadow-sm' : `${textSecondary} hover:${textPrimary}`
                                }`}
                        >
                            Variations de ℝ
                        </button>
                        <button type="button"
                            onClick={() => onNavigate('pascal')}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${currentPage === 'pascal' ? 'bg-amber-500 text-white shadow-sm' : `${textSecondary} hover:${textPrimary}`
                                }`}
                        >
                            Triangle de Pascal
                        </button>
                    </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-2">
                    <button type="button"
                        onClick={toggleTheme}
                        className={`px-3 py-2 rounded-full font-medium transition-all ${isDark ? 'bg-[#334155] text-yellow-400 hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}
                        title={isDark ? 'Mode clair' : 'Mode sombre'}
                    >
                        {isDark ? 'Clair' : 'Sombre'}
                    </button>
                    {headerActions}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex flex-1 overflow-hidden">
                {/* Canvas Area */}
                <div className={`flex-1 flex flex-col ${canvasBg} relative overflow-hidden transition-colors duration-200 items-center justify-center`}>
                    {canvasContent}
                </div>

                {/* Controls Panel - Modern Sidebar Style */}
                {controlsContent && (
                    <aside className={`w-80 ${cardBg} border-l ${borderColor} overflow-y-auto p-4 space-y-4 shrink-0 transition-colors duration-200`}>
                        <h2 className={`text-lg font-bold ${textPrimary} mb-4 px-1`}>{title}</h2>
                        {controlsContent}
                    </aside>
                )}
            </main>
        </div>
    );
}
