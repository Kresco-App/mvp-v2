import React from 'react';

export default function HomePage({ onNavigate }: { onNavigate: (page: string) => void }) {
    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <header className="text-center space-y-4">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600">
                    Laboratoire Optique
                </h1>
                <p className="text-slate-400 max-w-2xl mx-auto">
                    Exploration interactive des phénomènes lumineux : Réflexion, Réfraction, Diffraction et Dispersion.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Module 1: Réflexion & Réfraction */}
                <button 
                    onClick={() => onNavigate('optics')}
                    className="group relative p-6 bg-slate-800 rounded-2xl border border-slate-700 hover:border-amber-500/50 transition-all hover:shadow-2xl hover:shadow-amber-500/10 text-left overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 19h20L12 2zm0 3.8l6.3 11.2H5.7L12 5.8z"/></svg>
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-xl font-bold text-amber-100 mb-2 group-hover:text-amber-400 transition-colors">Réflexion & Réfraction</h3>
                        <p className="text-sm text-slate-400">Lois de Snell-Descartes, Angle Critique et Réflexion Totale.</p>
                    </div>
                </button>

                {/* Module 2: Diffraction */}
                <button 
                    onClick={() => onNavigate('diffraction')}
                    className="group relative p-6 bg-slate-800 rounded-2xl border border-slate-700 hover:border-cyan-500/50 transition-all hover:shadow-2xl hover:shadow-cyan-500/10 text-left overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M2 12h20v2H2zM2 10h20v-2H2z"/></svg>
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-xl font-bold text-cyan-100 mb-2 group-hover:text-cyan-400 transition-colors">Diffraction</h3>
                        <p className="text-sm text-slate-400">Nature ondulatoire, Fente simple et figure d'interférence.</p>
                    </div>
                </button>

                {/* Module 3: Prisme */}
                <button 
                    onClick={() => onNavigate('prism')}
                    className="group relative p-6 bg-slate-800 rounded-2xl border border-slate-700 hover:border-purple-500/50 transition-all hover:shadow-2xl hover:shadow-purple-500/10 text-left overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3L2 21h20L12 3z"/></svg>
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-xl font-bold text-purple-100 mb-2 group-hover:text-purple-400 transition-colors">Dispersion (Prisme)</h3>
                        <p className="text-sm text-slate-400">Décomposition de la lumière blanche et spectre visible.</p>
                    </div>
                </button>
            </div>
        </div>
    );
}
