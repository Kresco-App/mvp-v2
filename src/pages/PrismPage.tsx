import React, { useState, useRef, useEffect, useMemo } from 'react';
import LabLayout from '../components/LabLayout';
import EmbeddedLabCard from '../components/EmbeddedLabCard';
import { calculatePrism, SimulationResult } from '../components/simulators/PrismLogic';
import { Droplet, Sun, RefreshCw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface PageProps {
    onNavigate?: (page: string) => void;
    embedded?: boolean;
    className?: string;
}

type SourceMode = 'white' | 'single' | 'double';

export default function PrismPage({
    onNavigate: onNavigateInternal,
    embedded = false,
    className,
}: PageProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const handleNavigate = onNavigateInternal ?? (() => undefined);

    // State
    const [incidentAngle, setIncidentAngle] = useState(45);
    const [prismAngle, setPrismAngle] = useState(60);
    const [sourceMode, setSourceMode] = useState<SourceMode>('white');
    const [laser1Wavelength, setLaser1Wavelength] = useState(650); // Red
    const [laser2Wavelength, setLaser2Wavelength] = useState(450); // Blue
    const [showAngles, setShowAngles] = useState(false);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

    // Resize Logic
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas && canvas.parentElement) {
                const w = canvas.parentElement.clientWidth;
                const h = canvas.parentElement.clientHeight;
                canvas.width = w;
                canvas.height = h;
                setDimensions({ w, h });
            }
        };
        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 100);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Physics Calculation (Memoized)
    const simulation: SimulationResult = useMemo(() => {
        if (dimensions.w === 0 || dimensions.h === 0) {
            return { 
                geometry: { A: { x: 0, y: 0 }, B: { x: 0, y: 0 }, C: { x: 0, y: 0 }, P: { x: 0, y: 0 } }, 
                incidentRay: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, 
                rays: [], 
                stats: null 
            };
        }
        
        // Custom calculation for Double Laser
        if (sourceMode === 'double') {
            const res1 = calculatePrism(dimensions.w, dimensions.h, incidentAngle, prismAngle, false, laser1Wavelength);
            const res2 = calculatePrism(dimensions.w, dimensions.h, incidentAngle, prismAngle, false, laser2Wavelength);
            
            return {
                ...res1,
                rays: [...res1.rays, ...res2.rays],
                // For stats, we'll just use the first one or a combined view
                stats: res1.stats 
            };
        }

        return calculatePrism(dimensions.w, dimensions.h, incidentAngle, prismAngle, sourceMode === 'white', laser1Wavelength);
    }, [dimensions, incidentAngle, prismAngle, sourceMode, laser1Wavelength, laser2Wavelength]);

    // Helper: Wavelength to RGB (Simplified for the incident ray)
    const getWavelengthColor = (lambda: number) => {
        let r, g, b;
        if (lambda >= 380 && lambda < 440) { r = -(lambda - 440) / (440 - 380); g = 0; b = 1; }
        else if (lambda >= 440 && lambda < 490) { r = 0; g = (lambda - 440) / (490 - 440); b = 1; }
        else if (lambda >= 490 && lambda < 510) { r = 0; g = 1; b = -(lambda - 510) / (510 - 490); }
        else if (lambda >= 510 && lambda < 580) { r = (lambda - 510) / (580 - 510); g = 1; b = 0; }
        else if (lambda >= 580 && lambda < 645) { r = 1; g = -(lambda - 645) / (645 - 580); b = 0; }
        else if (lambda >= 645 && lambda <= 780) { r = 1; g = 0; b = 0; }
        else { r = 0; g = 0; b = 0; }

        let factor = (lambda >= 380 && lambda < 420) ? 0.3 + 0.7 * (lambda - 380) / (420 - 380) :
                     (lambda >= 701 && lambda < 780) ? 0.3 + 0.7 * (780 - lambda) / (780 - 700) : 1.0;

        return `rgb(${Math.round(r * factor * 255)}, ${Math.round(g * factor * 255)}, ${Math.round(b * factor * 255)})`;
    };

    // Drawing
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        
        // Clear & Background
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = isDark ? '#0F172A' : '#F8FAFC';
        ctx.fillRect(0, 0, width, height);

        // Draw Prism with Glass Effect
        const { A, B, C } = simulation.geometry;
        
        // Internal Prism Gradient (Glassy look)
        const prismGrad = ctx.createLinearGradient(A.x, A.y, C.x, C.y);
        if (isDark) {
            prismGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
            prismGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
            prismGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
        } else {
            prismGrad.addColorStop(0, 'rgba(0, 0, 0, 0.02)');
            prismGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
            prismGrad.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
        }
        
        ctx.fillStyle = prismGrad;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.lineTo(C.x, C.y);
        ctx.closePath();
        ctx.fill();
        
        // Prism Strokes (Glass edges)
        ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Highlighting the top vertex
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(A.x - 5, A.y + 5);
        ctx.lineTo(A.x, A.y);
        ctx.lineTo(A.x + 5, A.y + 5);
        ctx.stroke();

        // Draw Incident Ray(s) with Glow
        const ir = simulation.incidentRay;
        const drawRayGlow = (start: {x:number, y:number}, end: {x:number, y:number}, color: string, width: number) => {
            // Inner core
            ctx.strokeStyle = isDark ? '#fff' : color;
            ctx.lineWidth = width * 0.4;
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
            
            // Outer glow
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.globalAlpha = 0.6;
            if (isDark) {
                ctx.shadowBlur = 12;
                ctx.shadowColor = color;
            }
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
        };

        if (sourceMode === 'white') {
            drawRayGlow(ir.start, ir.end, isDark ? '#ffffff' : '#e2e8f0', 4);
        } else {
            drawRayGlow(ir.start, ir.end, getWavelengthColor(laser1Wavelength), sourceMode === 'double' ? 3 : 5);
            if (sourceMode === 'double') {
                drawRayGlow(ir.start, ir.end, getWavelengthColor(laser2Wavelength), 3);
            }
        }

        // Draw Refracted Rays
        simulation.rays.forEach(ray => {
            ctx.strokeStyle = ray.color;
            ctx.lineWidth = ray.width || 2;
            ctx.globalAlpha = ray.alpha || 1.0;
            
            if (ray.segments.length > 0) {
                ctx.beginPath();
                ctx.moveTo(ray.segments[0].start.x, ray.segments[0].start.y);
                ray.segments.forEach(seg => ctx.lineTo(seg.end.x, seg.end.y));
                ctx.stroke();
                
                // Add tiny bloom for refracted rays in dark mode
                if (isDark && sourceMode !== 'white') {
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = ray.color;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            }
            ctx.globalAlpha = 1.0;
        });

        // Draw Angles if enabled
        if (showAngles && sourceMode === 'single' && simulation.stats) {
            const { A, B, C, P } = simulation.geometry;
            const ray = simulation.rays[0];
            
            if (ray && ray.segments.length > 0) {
                const P_prime = ray.segments[0].end;
                const ir = simulation.incidentRay;
                
                // Calculate geometric directions
                const incidentDir = { x: P.x - ir.start.x, y: P.y - ir.start.y };
                const refractedDir = { x: P_prime.x - P.x, y: P_prime.y - P.y };
                const exitDir = ray.segments[1] ? { x: ray.segments[1].end.x - P_prime.x, y: ray.segments[1].end.y - P_prime.y } : null;

                // Face 2 Normal Calculation
                const dx = C.x - A.x;
                const dy = C.y - A.y;
                const face2_angle = Math.atan2(dy, dx);
                const n2_out_angle = face2_angle - Math.PI/2;
                const n2_in_angle = n2_out_angle + Math.PI;

                // Draw Normals
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                
                // Normal 1 (Horizontal)
                ctx.beginPath();
                ctx.moveTo(P.x - 80, P.y); ctx.lineTo(P.x + 80, P.y);
                ctx.stroke();
                
                // Normal 2 (Perpendicular to Face 2)
                const n2_ext = 80;
                ctx.beginPath();
                ctx.moveTo(P_prime.x - Math.cos(n2_out_angle) * n2_ext, P_prime.y - Math.sin(n2_out_angle) * n2_ext);
                ctx.lineTo(P_prime.x + Math.cos(n2_out_angle) * n2_ext, P_prime.y + Math.sin(n2_out_angle) * n2_ext);
                ctx.stroke();
                ctx.setLineDash([]);

                // Helper to draw angle arc (Arc only, no text)
                const drawAngle = (center: {x:number, y:number}, rayAngle: number, normalAngle: number, color: string, radius: number = 40) => {
                    let s = normalAngle;
                    let e = rayAngle;
                    
                    let diff = e - s;
                    while (diff > Math.PI) { e -= 2 * Math.PI; diff = e - s; }
                    while (diff < -Math.PI) { e += 2 * Math.PI; diff = e - s; }

                    ctx.beginPath();
                    ctx.arc(center.x, center.y, radius, s, e, e < s);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                };

                const { i, r, r_prime, i_prime, tir } = simulation.stats;

                // 1. Incident i
                const ang_inc = Math.atan2(ir.start.y - P.y, ir.start.x - P.x);
                drawAngle(P, ang_inc, Math.PI, '#fbbf24', 45);

                // 2. Refracted r
                const ang_refr = Math.atan2(P_prime.y - P.y, P_prime.x - P.x);
                drawAngle(P, ang_refr, 0, '#38bdf8', 40);

                // 3. Internal Incidence r'
                const ang_int = Math.atan2(P.y - P_prime.y, P.x - P_prime.x);
                drawAngle(P_prime, ang_int, n2_in_angle, '#a855f7', 40);

                // 4. Emergence i'
                if (!tir && exitDir) {
                    const ang_exit = Math.atan2(exitDir.y, exitDir.x);
                    drawAngle(P_prime, ang_exit, n2_out_angle, '#10b981', 45);
                    
                    // 5. Total Deviation D - Dashed extension
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
                    ctx.beginPath();
                    ctx.moveTo(P.x, P.y);
                    const extLen = 250;
                    ctx.lineTo(P.x + extLen * Math.cos(ang_inc + Math.PI), P.y + extLen * Math.sin(ang_inc + Math.PI));
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // 6. Apex Angle A
                const angAB = Math.atan2(B.y - A.y, B.x - A.x);
                const angAC = Math.atan2(C.y - A.y, C.x - A.x);
                drawAngle(A, angAB, angAC, isDark ? '#94a3b8' : '#64748b', 60);
            }
        }

    }, [simulation, isDark, sourceMode, laser1Wavelength, laser2Wavelength, showAngles, prismAngle]);

    const textPrimary = isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]';
    const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#64748B]';
    const cardBg = isDark ? 'bg-[#334155]/50' : 'bg-[#F5F3FF]';
    const borderColor = isDark ? 'border-[#475569]' : 'border-[#8B5CF6]/20';

    const canvasContent = (
        <canvas 
            ref={canvasRef} 
            className="w-full h-full transition-colors duration-200"
        />
    );

    const controlsContent = (
        <>
            <section className={`${cardBg} rounded-2xl p-4 space-y-3 border ${borderColor}`}>
                <h3 className="text-xs font-semibold text-purple-500 uppercase tracking-wider">Mode Source</h3>
                <div className="grid grid-cols-3 gap-1">
                    <button
                        onClick={() => setSourceMode('white')}
                        className={`py-2 px-1 rounded-full text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                            sourceMode === 'white' ? 'bg-blue-500 text-white shadow-sm' : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-white text-[#64748B] border border-[#E2E8F0]'
                        }`}
                    >
                        <Sun size={14} /> Soleil
                    </button>
                    <button
                        onClick={() => setSourceMode('single')}
                        className={`py-2 px-1 rounded-full text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                            sourceMode === 'single' ? 'bg-amber-500 text-white shadow-sm' : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-white text-[#64748B] border border-[#E2E8F0]'
                        }`}
                    >
                        <Droplet size={14} /> 1 Laser
                    </button>
                    <button
                        onClick={() => setSourceMode('double')}
                        className={`py-2 px-1 rounded-full text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                            sourceMode === 'double' ? 'bg-emerald-500 text-white shadow-sm' : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-white text-[#64748B] border border-[#E2E8F0]'
                        }`}
                    >
                        <RefreshCw size={14} /> 2 Lasers
                    </button>
                </div>

                {(sourceMode === 'single' || sourceMode === 'double') && (
                    <div className="pt-2 space-y-3 animate-fade-in">
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className={textSecondary}>{sourceMode === 'double' ? 'Laser 1' : 'Couleur'}</span>
                                <span className="font-mono font-medium" style={{ color: getWavelengthColor(laser1Wavelength) }}>{laser1Wavelength} nm</span>
                            </div>
                            <input 
                                type="range" min="380" max="750" step="1" 
                                value={laser1Wavelength} 
                                onChange={(e) => setLaser1Wavelength(Number(e.target.value))}
                                className="w-full h-1.5"
                                style={{ accentColor: getWavelengthColor(laser1Wavelength) }}
                            />
                        </div>

                        {sourceMode === 'double' && (
                            <div className="space-y-1 border-t border-purple-500/10 pt-2">
                                <div className="flex justify-between text-xs">
                                    <span className={textSecondary}>Laser 2</span>
                                    <span className="font-mono font-medium" style={{ color: getWavelengthColor(laser2Wavelength) }}>{laser2Wavelength} nm</span>
                                </div>
                                <input 
                                    type="range" min="380" max="750" step="1" 
                                    value={laser2Wavelength} 
                                    onChange={(e) => setLaser2Wavelength(Number(e.target.value))}
                                    className="w-full h-1.5"
                                    style={{ accentColor: getWavelengthColor(laser2Wavelength) }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section className={`${isDark ? 'bg-[#334155]/50' : 'bg-white'} rounded-2xl p-4 space-y-4 border ${isDark ? 'border-[#475569]' : 'border-[#E2E8F0]'}`}>
                <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>Géométrie</h3>
                
                <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span className={textPrimary}>Incidence (i)</span>
                        <span className="text-amber-500 font-mono font-medium">{incidentAngle}°</span>
                    </div>
                    <input 
                        type="range" min="0" max="85" step="1" 
                        value={incidentAngle} 
                        onChange={(e) => setIncidentAngle(Number(e.target.value))}
                        className="w-full accent-amber-500"
                    />
                </div>
                
                <div className="space-y-1">
                     <div className="flex justify-between text-sm">
                        <span className={textPrimary}>Angle Prisme (A)</span>
                        <span className="text-purple-500 font-mono font-medium">{prismAngle}°</span>
                     </div>
                     <input 
                         type="range" min="30" max="75" step="1" 
                         value={prismAngle} 
                         onChange={(e) => setPrismAngle(Number(e.target.value))}
                         className="w-full accent-purple-500"
                     />
                </div>

                {sourceMode === 'single' && (
                    <div className="pt-2 border-t border-purple-500/10">
                        <button
                            onClick={() => setShowAngles(!showAngles)}
                            className={`w-full py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center justify-between ${
                                showAngles 
                                    ? 'bg-purple-500 text-white shadow-sm' 
                                    : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-white text-[#64748B] border border-[#E2E8F0]'
                            }`}
                        >
                            <span>Visualiser les Angles</span>
                            <div className={`w-8 h-4 rounded-full relative transition-colors ${showAngles ? 'bg-purple-300' : 'bg-slate-400'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showAngles ? 'left-4.5' : 'left-0.5'}`} />
                            </div>
                        </button>
                    </div>
                )}
            </section>

            {simulation.stats && (
                <section className={`${isDark ? 'bg-gradient-to-br from-[#334155] to-[#1E293B]' : 'bg-gradient-to-br from-[#F5F3FF] to-[#EDE9FE]'} rounded-2xl p-4 border ${isDark ? 'border-[#475569]' : 'border-[#8B5CF6]/30'} space-y-3 shadow-sm`}>
                    <h3 className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Mesures ({sourceMode === 'white' ? 'Dispersion' : 'Laser'})</h3>
                    
                    {!simulation.stats.tir ? (
                        <div className="space-y-2 font-mono text-sm">
                            {sourceMode === 'single' && (
                                <>
                                    <div className="flex justify-between">
                                        <span className={textSecondary}>Incidence i</span>
                                        <span className="text-amber-500 font-medium">{Math.abs(simulation.stats.i).toFixed(1)}°</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className={textSecondary}>Réfraction r</span>
                                        <span className="text-sky-500 font-medium">{Math.abs(simulation.stats.r).toFixed(1)}°</span>
                                    </div>
                                    <div className="flex justify-between border-t border-purple-500/10 pt-2">
                                        <span className={textSecondary}>Incidence r'</span>
                                        <span className="text-purple-500 font-medium">{Math.abs(simulation.stats.r_prime).toFixed(1)}°</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className={textSecondary}>Emergence i'</span>
                                        <span className="text-emerald-500 font-medium">{Math.abs(simulation.stats.i_prime).toFixed(1)}°</span>
                                    </div>
                                </>
                            )}
                            {sourceMode !== 'single' && (
                                <>
                                    <div className="flex justify-between">
                                        <span className={textSecondary}>Réfraction r</span>
                                        <span className="text-blue-500 font-medium">{simulation.stats.r.toFixed(1)}°</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className={textSecondary}>Sortie i'</span>
                                        <span className="text-emerald-500 font-medium">{simulation.stats.i_prime.toFixed(1)}°</span>
                                    </div>
                                </>
                            )}
                            <div className={`flex justify-between border-t ${isDark ? 'border-slate-600' : 'border-purple-200'} pt-2 mt-2`}>
                                <span className="text-rose-500 font-bold">Déviation D</span>
                                <span className="text-rose-500 font-bold">{simulation.stats.D.toFixed(1)}°</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-red-50 text-red-500 p-2 rounded-xl text-center text-xs font-bold border border-red-200">
                            RÉFLEXION TOTALE
                        </div>
                    )}
                </section>
            )}
            
            <section className={`${isDark ? 'bg-[#334155]/30' : 'bg-[#F8FAFC]'} rounded-2xl p-4 border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider mb-2`}>À propos</h3>
                <p className={`text-xs ${textSecondary} leading-relaxed`}>
                    L'indice de réfraction du verre dépend de la longueur d'onde. C'est ce qui provoque la <span className="text-purple-500 font-medium">dispersion</span> de la lumière blanche en arc-en-ciel.
                </p>
            </section>
        </>
    );

    if (embedded) {
        return (
            <EmbeddedLabCard
                title="Prisme et Dispersion"
                subtitle="Simulation autonome a integrer sous une video de cours."
                canvasContent={canvasContent}
                controlsContent={controlsContent}
                accentColor="purple"
                className={className}
            />
        );
    }

    return (
        <LabLayout 
            title="Prisme (Dispersion)"
            onNavigate={handleNavigate}
            currentPage="prism"
            canvasContent={canvasContent}
            controlsContent={controlsContent}
            accentColor="purple"
            headerActions={
                <button 
                    onClick={() => {
                        setIncidentAngle(45);
                        setPrismAngle(60);
                        setSourceMode('white');
                        setLaser1Wavelength(650);
                        setLaser2Wavelength(450);
                        setShowAngles(false);
                    }}
                    className={`px-4 py-2 rounded-full font-medium transition-all ${isDark ? 'bg-[#334155] text-[#E2E8F0] hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'} text-sm`}
                >
                    Reset
                </button>
            }
        />
    );
}
