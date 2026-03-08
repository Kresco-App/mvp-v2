import React, { useState, useRef, useEffect } from 'react';
import { GeometricOpticsEngine } from '../physics/GeometricOpticsEngine';
import LabLayout from '../components/LabLayout';
import EmbeddedLabCard from '../components/EmbeddedLabCard';
import { useTheme } from '../context/ThemeContext';

interface PageProps {
    onNavigate?: (page: string) => void;
    embedded?: boolean;
    className?: string;
}

export default function GeometricOpticsPage({
    onNavigate: onNavigateInternal,
    embedded = false,
    className,
}: PageProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const handleNavigate = onNavigateInternal ?? (() => undefined);

    const [angleDeg, setAngleDeg] = useState(45);
    const [n1, setN1] = useState(1.0); // Air
    const [n2, setN2] = useState(1.5); // Glass
    const [showAngles, setShowAngles] = useState(false);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dimensions, setDimensions] = useState({ w: 600, h: 500 });

    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas && canvas.parentElement) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
                setDimensions({ w: canvas.width, h: canvas.height });
            }
        };
        
        window.addEventListener('resize', handleResize);
        handleResize(); // Init
        
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const cx = width / 2;
        const cy = height / 2;
        
        // Colors based on theme
        const boundaryColor = isDark ? '#475569' : '#cbd5e1';
        const normalColor = isDark ? '#334155' : '#e2e8f0';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        const getMediumColor = (n: number) => {
            const intensity = Math.max(0, (n - 1) / 1.5);
            if (isDark) {
                const base = 15; // Slate 900 base
                const add = Math.round(intensity * 40);
                return `rgb(${base + add}, ${base + add + 8}, ${base + add + 27})`;
            } else {
                const base = 250; // Very light base
                const sub = Math.round(intensity * 50);
                return `rgb(${base - sub}, ${base - sub - 10}, ${base - sub - 5})`;
            }
        };

        // Medium 1 (Top)
        ctx.fillStyle = getMediumColor(n1);
        ctx.fillRect(0, 0, width, cy);

        // Medium 2 (Bottom)
        ctx.fillStyle = getMediumColor(n2);
        ctx.fillRect(0, cy, width, height - cy);

        // Draw Boundary
        ctx.strokeStyle = boundaryColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();

        // Draw Normal
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = normalColor;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Helper for Glowing Rays
        const drawRayGlow = (start: {x:number, y:number}, end: {x:number, y:number}, color: string, width: number, alpha: number = 1.0) => {
            ctx.globalAlpha = alpha;
            // Inner core
            ctx.strokeStyle = isDark ? '#fff' : color;
            ctx.lineWidth = width * 0.4;
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
            
            // Outer glow
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.globalAlpha = alpha * 0.6;
            if (isDark) {
                ctx.shadowBlur = 12;
                ctx.shadowColor = color;
            }
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
        };

        // Helper to extend ray to canvas edge (Infinity)
        const extendRay = (x0: number, y0: number, angle: number) => {
            const dx = Math.sin(angle);
            const dy = Math.cos(angle); // Down is positive Y
            
            // Distances to walls
            // dx > 0 ? Right Wall : Left Wall
            const tx = dx > 0 ? (width - x0) / dx : -x0 / dx;
            // dy > 0 ? Bottom Wall : Top Wall
            const ty = dy > 0 ? (height - y0) / dy : -y0 / dy;
            
            // We want the smallest positive t
            let t = 10000;
            if (tx > 0) t = Math.min(t, tx);
            if (ty > 0) t = Math.min(t, ty);
            
            return {
                x: x0 + dx * t,
                y: y0 + dy * t
            };
        };

        // Calculate Physics
        const angleRad = angleDeg * (Math.PI / 180);
        const refractionRad = GeometricOpticsEngine.calculateRefraction(angleRad, n1, n2);
        
        // --- 1. Draw Incident Ray (Top-Left -> Center) ---
        // Angle is angleRad relative to normal (Up). Incident comes from PI + angleRad relative to Down
        const incidentStart = extendRay(cx, cy, angleRad + Math.PI); 
        drawRayGlow(incidentStart, {x: cx, y: cy}, '#fbbf24', 5);

        // --- 2. Draw Reflected Ray (Center -> Top-Right) ---
        // Reflection angle is -angleRad relative to normal (Up)
        // Vector: x = sin(angleRad), y = -cos(angleRad)
        const r_dx = Math.sin(angleRad);
        const r_dy = -Math.cos(angleRad);
        
        // Intersect with Top or Right wall
        // t to Top (y=0) = -cy / r_dy
        // t to Right (x=width) = (width - cx) / r_dx
        let t_refl = -cy / r_dy;
        if (r_dx > 0) t_refl = Math.min(t_refl, (width - cx) / r_dx);
        else t_refl = Math.min(t_refl, -cx / r_dx); // Should be right usually, but safe fallback
        
        const reflectedEnd = { x: cx + r_dx * t_refl, y: cy + r_dy * t_refl };
        const reflIntensity = 0.3 + 0.5 * Math.pow(angleDeg/90, 4); 
        
        drawRayGlow({x: cx, y: cy}, reflectedEnd, '#fbbf24', 4, reflIntensity);

        // --- 3. Draw Refracted Ray or TIR (Center -> Bottom) ---
        if (refractionRad !== null) {
            // Refracted goes DOWN (+Y)
            const refr_dx = Math.sin(refractionRad);
            const refr_dy = Math.cos(refractionRad);
            
            // Intersection with Bottom (y=height) or Sides
            let t_refr = (height - cy) / refr_dy;
            if (refr_dx > 0) t_refr = Math.min(t_refr, (width - cx) / refr_dx);
            else t_refr = Math.min(t_refr, -cx / refr_dx);

            const refractedEnd = { x: cx + refr_dx * t_refr, y: cy + refr_dy * t_refr };
            drawRayGlow({x: cx, y: cy}, refractedEnd, '#38bdf8', 5);
            
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold italic 16px serif';
            ctx.fillText('r', cx + 20, cy + 40);
        } else {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.fillText("RÉFLEXION TOTALE INTERNE", cx + 20, cy + 40);
            
            // Draw Full Reflection if TIR (same path as reflection but intense)
            drawRayGlow({x: cx, y: cy}, reflectedEnd, '#ef4444', 5, 1.0);
        }
        
        // Draw Angles if enabled
        if (showAngles) {
            const drawAngleArc = (startAngle: number, endAngle: number, color: string, radius: number = 40) => {
                ctx.beginPath();
                ctx.arc(cx, cy, radius, startAngle, endAngle, endAngle < startAngle);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();
            };

            // Normal Up is -PI/2
            const normalUp = -Math.PI / 2;
            const normalDown = Math.PI / 2;

            // Incident Angle i (from Normal Up to Incident Ray)
            drawAngleArc(normalUp - angleRad, normalUp, '#fbbf24', 50);

            // Reflected Angle (Symmetric to right) - Larger and Dotted
            ctx.setLineDash([4, 4]);
            drawAngleArc(normalUp, normalUp + angleRad, '#fbbf24', 70); // Larger radius
            ctx.setLineDash([]);

            // Refracted Angle r (from Normal Down)
            if (refractionRad !== null) {
                // Normal is Down (PI/2)
                // Refracted Ray is to the right, so angle is (PI/2 - refractionRad) in standard atan2 coords
                // We draw from Normal (PI/2) to Ray (PI/2 - r)
                // Since end < start, we must use anticlockwise = true
                const start = Math.PI / 2;
                const end = Math.PI / 2 - refractionRad;
                
                ctx.beginPath();
                ctx.arc(cx, cy, 50, start, end, true); 
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        // Labels
        ctx.fillStyle = textColor;
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(`Milieu 1 (n=${n1.toFixed(2)})`, 10, cy - 10);
        ctx.fillText(`Milieu 2 (n=${n2.toFixed(2)})`, 10, cy + 20);
        
        // Position label near incident ray start
        const labelX = incidentStart.x + (cx - incidentStart.x) * 0.2;
        const labelY = incidentStart.y + (cy - incidentStart.y) * 0.2;
        ctx.font = 'bold italic 16px serif';
        ctx.fillText('i', labelX, labelY - 10);

    }, [angleDeg, n1, n2, dimensions, isDark, showAngles]);

    const canvasContent = (
        <canvas 
            ref={canvasRef} 
            width={600} 
            height={500} 
            className="w-full h-full cursor-crosshair transition-colors duration-200"
        />
    );

    const textPrimary = isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]';
    const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#64748B]';
    const cardBg = isDark ? 'bg-[#334155]/50' : 'bg-[#FFF9EB]';
    const borderColor = isDark ? 'border-[#475569]' : 'border-[#FBAE17]/20';

    const controlsContent = (
        <>
            <section className={`${cardBg} rounded-2xl p-4 space-y-4 border ${borderColor}`}>
                <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Paramètres</h3>
                
                <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span className={textPrimary}>Angle d'incidence (i)</span>
                        <span className="text-amber-500 font-mono font-medium">{angleDeg}°</span>
                    </div>
                    <input 
                        type="range" min="0" max="90" step="1" 
                        value={angleDeg} 
                        onChange={(e) => setAngleDeg(Number(e.target.value))}
                        className="w-full accent-amber-500"
                    />
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span className={textPrimary}>Indice Milieu 1 (n₁)</span>
                        <span className="text-blue-500 font-mono font-medium">{n1.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" min="1.0" max="2.5" step="0.01" 
                        value={n1} 
                        onChange={(e) => setN1(Number(e.target.value))}
                        className="w-full accent-blue-500"
                    />
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span className={textPrimary}>Indice Milieu 2 (n₂)</span>
                        <span className="text-cyan-500 font-mono font-medium">{n2.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" min="1.0" max="2.5" step="0.01" 
                        value={n2} 
                        onChange={(e) => setN2(Number(e.target.value))}
                        className="w-full accent-cyan-500"
                    />
                </div>

                <div className="pt-2 border-t border-amber-500/10">
                    <button
                        onClick={() => setShowAngles(!showAngles)}
                        className={`w-full py-2 px-3 rounded-full text-sm font-medium transition-all flex items-center justify-between ${
                            showAngles 
                                ? 'bg-amber-500 text-white shadow-sm' 
                                : isDark ? 'bg-[#475569] text-[#E2E8F0]' : 'bg-white text-[#64748B] border border-[#E2E8F0]'
                        }`}
                    >
                        <span>Visualiser les Angles</span>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${showAngles ? 'bg-amber-300' : 'bg-slate-400'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showAngles ? 'left-4.5' : 'left-0.5'}`} />
                        </div>
                    </button>
                </div>
            </section>

            <section className={`${isDark ? 'bg-[#334155]/30' : 'bg-[#F8FAFC]'} rounded-2xl p-4 border ${isDark ? 'border-[#334155]' : 'border-[#E2E8F0]'}`}>
                <h3 className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider mb-2`}>Théorie</h3>
                <p className={`text-xs ${textSecondary} leading-relaxed`}>
                    <strong className={textPrimary}>Loi de Snell-Descartes :</strong><br/>
                    n₁ sin(i) = n₂ sin(r)<br/><br/>
                    Si n₁ &gt; n₂, il existe un angle critique au-delà duquel la lumière est totalement réfléchie (Réflexion Totale Interne).
                </p>
            </section>
        </>
    );

    if (embedded) {
        return (
            <EmbeddedLabCard
                title="Reflexion et Refraction"
                subtitle="Simulation autonome a integrer sous une video de cours."
                canvasContent={canvasContent}
                controlsContent={controlsContent}
                accentColor="amber"
                className={className}
            />
        );
    }

    return (
        <LabLayout 
            title="Réflexion et Réfraction"
            onNavigate={handleNavigate}
            currentPage="optics"
            canvasContent={canvasContent}
            controlsContent={controlsContent}
            accentColor="amber"
            headerActions={
                <button 
                    onClick={() => { setAngleDeg(45); setN1(1.0); setN2(1.5); }}
                    className={`px-4 py-2 rounded-full font-medium transition-all ${isDark ? 'bg-[#334155] text-[#E2E8F0] hover:bg-[#475569]' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'} text-sm`}
                >
                    Reset
                </button>
            }
        />
    );
}
