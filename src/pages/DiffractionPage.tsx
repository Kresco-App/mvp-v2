import React, { useState, useRef, useEffect } from 'react';
import LabLayout from '../components/LabLayout';
import EmbeddedLabCard from '../components/EmbeddedLabCard';
import { RefreshCw } from 'lucide-react';

interface PageProps {
    onNavigate?: (page: string) => void;
    embedded?: boolean;
    className?: string;
}

export default function DiffractionPage({
    onNavigate,
    embedded = false,
    className,
}: PageProps) {
    const handleNavigate = onNavigate ?? (() => undefined);
    const [wavelength, setWavelength] = useState(400); // nm
    const [slitWidth, setSlitWidth] = useState(100); // um
    const [distance, setDistance] = useState(2.0); // m
    
    // Refs
    const diagramRef = useRef<HTMLCanvasElement>(null);
    const screenRef = useRef<HTMLCanvasElement>(null);
    
    const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
    const isDraggingRef = useRef(false);

    // Resize Handler
    useEffect(() => {
        const handleResize = () => {
            const container = diagramRef.current?.parentElement?.parentElement; // Main canvas container
            if (container) {
                // Top Diagram: 55% height
                if (diagramRef.current) {
                    diagramRef.current.width = container.clientWidth - 32; // padding
                    diagramRef.current.height = container.clientHeight * 0.55;
                }
                
                // Bottom Row: 27% height (Smaller by ~10%)
                const bottomH = container.clientHeight * 0.27;
                // Full width for the screen pattern now that graph is gone
                const bottomW = container.clientWidth - 32; 
                
                if (screenRef.current) {
                    screenRef.current.width = bottomW;
                    screenRef.current.height = bottomH;
                }
                
                setDimensions({ w: container.clientWidth, h: container.clientHeight });
            }
        };
        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 100);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Interactive Dragging Logic
    const getScreenX = (dist: number, width: number) => {
        const minX = width * 0.25;
        const maxX = width * 0.90;
        const minD = 0.5;
        const maxD = 5.0;
        return minX + ((dist - minD) / (maxD - minD)) * (maxX - minX);
    };

    const getDistanceAtX = (x: number, width: number) => {
        const minX = width * 0.25;
        const maxX = width * 0.90;
        const minD = 0.5;
        const maxD = 5.0;
        const norm = (x - minX) / (maxX - minX);
        return Math.max(minD, Math.min(maxD, minD + norm * (maxD - minD)));
    };

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = diagramRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        let clientX;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = e.clientX;
        }
        
        const x = clientX - rect.left;
        const screenX = getScreenX(distance, canvas.width);
        
        if (Math.abs(x - screenX) < 30) {
            isDraggingRef.current = true;
            document.body.style.cursor = 'ew-resize';
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent | TouchEvent) => {
            if (!isDraggingRef.current || !diagramRef.current) return;
            const rect = diagramRef.current.getBoundingClientRect();
            
            let clientX;
            if ('touches' in e) {
                clientX = e.touches[0].clientX;
            } else {
                clientX = e.clientX;
            }

            const x = clientX - rect.left;
            const newDist = getDistanceAtX(x, diagramRef.current.width);
            setDistance(newDist);
        };
        const handleMouseUp = () => {
            if (isDraggingRef.current) {
                isDraggingRef.current = false;
                document.body.style.cursor = 'default';
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleMouseMove);
        window.addEventListener('touchend', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, []);

    // Helper: Wavelength to RGB
    const getWavelengthColor = (lambda: number) => {
        let r, g, b;
        if (lambda >= 380 && lambda < 440) { r = -(lambda - 440) / (440 - 380); g = 0; b = 1; }
        else if (lambda >= 440 && lambda < 490) { r = 0; g = (lambda - 440) / (490 - 440); b = 1; }
        else if (lambda >= 490 && lambda < 510) { r = 0; g = 1; b = -(lambda - 510) / (510 - 490); }
        else if (lambda >= 510 && lambda < 580) { r = (lambda - 510) / (580 - 510); g = 1; b = 0; }
        else if (lambda >= 580 && lambda < 645) { r = 1; g = -(lambda - 645) / (645 - 580); b = 0; }
        else if (lambda >= 645 && lambda <= 780) { r = 1; g = 0; b = 0; }
        else { r = 0; g = 0; b = 0; }

        let factor;
        if (lambda >= 380 && lambda < 420) factor = 0.3 + 0.7 * (lambda - 380) / (420 - 380);
        else if (lambda >= 420 && lambda < 701) factor = 1.0;
        else if (lambda >= 701 && lambda < 780) factor = 0.3 + 0.7 * (780 - lambda) / (780 - 700);
        else factor = 0;

        const R = Math.round(r * factor * 255);
        const G = Math.round(g * factor * 255);
        const B = Math.round(b * factor * 255);
        return `rgb(${R}, ${G}, ${B})`;
    };

    // Draw
    useEffect(() => {
        const colorStr = getWavelengthColor(wavelength);
        const a = slitWidth * 1e-6; 
        const lam = wavelength * 1e-9;
        const D = distance;
        
        // --- 1. Draw Physical Diagram (Schematic Style) ---
        if (diagramRef.current) {
            const ctx = diagramRef.current.getContext('2d');
            if (ctx) {
                const w = diagramRef.current.width;
                const h = diagramRef.current.height;
                const cy = h / 2;
                
                ctx.clearRect(0, 0, w, h);
                ctx.fillStyle = isDraggingRef.current ? '#1e293b' : '#0f172a';
                ctx.fillRect(0, 0, w, h);
                
                // --- Geometry Setup ---
                const slitX = w * 0.15;
                const screenX = getScreenX(distance, w);
                
                // Exaggerated Physics for Visualization
                // Calculate real angle theta = asin(lambda / a)
                const realTheta = Math.asin(lam / a);
                
                // Scale it up significantly (e.g. 25x) so changes are visible but it looks like a diagram
                // Clamp it between 2 degrees and 25 degrees to keep the drawing valid
                const visualTheta = Math.max(0.035, Math.min(Math.PI / 7, realTheta * 25));
                
                const coneHalfHeight = (screenX - slitX) * Math.tan(visualTheta);
                
                // Extract RGB for colors first
                const rgbMatch = colorStr.match(/\d+/g);
                const R = rgbMatch?.[0] || 255; 
                const G = rgbMatch?.[1] || 255; 
                const B = rgbMatch?.[2] || 255;

                // --- 1. Optical Axis ---
                ctx.strokeStyle = '#64748b';
                ctx.setLineDash([8, 6]);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, cy); // Start from far left
                ctx.lineTo(w, cy);
                ctx.stroke();
                ctx.setLineDash([]);

                // --- 1.5 Incoming Laser Beam ---
                // Draw the incident beam up to the slit
                const beamHeight = 4;
                const incidentGrad = ctx.createLinearGradient(0, cy, slitX, cy);
                incidentGrad.addColorStop(0, `rgba(${R},${G},${B},0.0)`);
                incidentGrad.addColorStop(0.2, `rgba(${R},${G},${B},0.8)`);
                incidentGrad.addColorStop(1, `rgba(${R},${G},${B},0.8)`);
                
                ctx.fillStyle = incidentGrad;
                ctx.fillRect(0, cy - beamHeight/2, slitX, beamHeight);
                
                // Add a glow to the incoming beam
                ctx.shadowBlur = 10;
                ctx.shadowColor = `rgba(${R},${G},${B},0.8)`;
                ctx.fillRect(0, cy - 1, slitX, 2); // Core
                ctx.shadowBlur = 0;

                // --- 1.8 Secondary Cone (Faint, Wide) ---
                // Calculate geometry for secondary blobs early
                const secH = coneHalfHeight * 0.25;
                const secGap = coneHalfHeight * 1.35;
                const outerLimit = secGap + secH;

                const wideGrad = ctx.createLinearGradient(slitX, cy, screenX, cy);
                wideGrad.addColorStop(0, `rgba(${R},${G},${B},0.2)`);
                wideGrad.addColorStop(1, `rgba(${R},${G},${B},0.05)`);
                
                ctx.fillStyle = wideGrad;
                ctx.beginPath();
                ctx.moveTo(slitX, cy);
                ctx.lineTo(screenX, cy - outerLimit);
                ctx.lineTo(screenX, cy + outerLimit);
                ctx.closePath();
                ctx.fill();

                // Faint edge lines for secondary - REMOVED per request

                // --- 2. Rays (The Main Spreading Cone) ---
                // Fill the cone to show spreading
                const coneGrad = ctx.createLinearGradient(slitX, cy, screenX, cy);
                coneGrad.addColorStop(0, `rgba(${R},${G},${B},0.8)`);
                coneGrad.addColorStop(1, `rgba(${R},${G},${B},0.1)`); // Fade out towards screen

                ctx.fillStyle = coneGrad;
                ctx.beginPath();
                ctx.moveTo(slitX, cy - 1); // Start slightly thick at slit
                ctx.lineTo(slitX, cy + 1);
                ctx.lineTo(screenX, cy + coneHalfHeight);
                ctx.lineTo(screenX, cy - coneHalfHeight);
                ctx.closePath();
                ctx.fill();

                // Draw the Ray Edges
                ctx.strokeStyle = '#e2e8f0'; 
                ctx.lineWidth = 2;
                ctx.beginPath();
                // Top ray
                ctx.moveTo(slitX, cy);
                ctx.lineTo(screenX, cy - coneHalfHeight);
                // Bottom ray
                ctx.moveTo(slitX, cy);
                ctx.lineTo(screenX, cy + coneHalfHeight);
                ctx.stroke();

                // --- 3. The Slit (Obstacle) ---
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(slitX, cy - 80);
                ctx.lineTo(slitX, cy - 4);
                ctx.moveTo(slitX, cy + 4);
                ctx.lineTo(slitX, cy + 80);
                ctx.stroke();
                ctx.lineCap = 'butt';

                // --- 4. The Screen (Vertical Line) ---
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 3;
                ctx.beginPath();
                // Make screen taller: +/- 220
                ctx.moveTo(screenX, cy - 220);
                ctx.lineTo(screenX, cy + 220);
                ctx.stroke();

                // --- 5. Pattern Blobs (Red Blobs) ---
                ctx.fillStyle = `rgb(${R},${G},${B})`;
                
                // Central Max (L) - Large Ellipse with glow
                ctx.shadowBlur = 10;
                ctx.shadowColor = `rgba(${R},${G},${B},0.5)`;
                ctx.beginPath();
                ctx.ellipse(screenX, cy, 6, coneHalfHeight, 0, 0, 2 * Math.PI);
                ctx.fill();
                ctx.shadowBlur = 0;
                
                // Secondary Maxima - Smaller detached ellipses
                // secH and secGap calculated above
                
                // Top Secondary
                ctx.beginPath();
                ctx.ellipse(screenX, cy - secGap, 4, secH, 0, 0, 2 * Math.PI);
                ctx.fill();
                
                // Bottom Secondary
                ctx.beginPath();
                ctx.ellipse(screenX, cy + secGap, 4, secH, 0, 0, 2 * Math.PI);
                ctx.fill();

                // --- 6. Annotations ---
                
                // Angle Theta (arc) - Labelled as alpha per request
                const arcRadius = 70;
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(slitX, cy, arcRadius, -visualTheta, 0);
                ctx.stroke();
                
                // Arrowhead on arc
                const arrowAngle = -visualTheta;
                const arrowX = slitX + arcRadius * Math.cos(arrowAngle);
                const arrowY = cy + arcRadius * Math.sin(arrowAngle);
                ctx.beginPath();
                ctx.moveTo(arrowX, arrowY);
                ctx.lineTo(arrowX - 5, arrowY + 8);
                ctx.lineTo(arrowX + 8, arrowY + 2);
                ctx.closePath();
                ctx.fillStyle = '#fbbf24';
                ctx.fill();
                
                ctx.font = 'bold italic 16px serif';
                ctx.fillText('α', slitX + arcRadius + 10, cy - 8);

                // Dimension D (Distance) - Bottom Arrow
                const dimY = cy + 100;
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1;
                
                // Line
                ctx.beginPath();
                ctx.moveTo(slitX, dimY);
                ctx.lineTo(screenX, dimY);
                ctx.stroke();
                
                // Ends/Ticks
                ctx.beginPath();
                ctx.moveTo(slitX, dimY - 6); ctx.lineTo(slitX, dimY + 6);
                ctx.moveTo(screenX, dimY - 6); ctx.lineTo(screenX, dimY + 6);
                ctx.stroke();
                
                // Arrowheads
                ctx.fillStyle = '#94a3b8';
                ctx.beginPath();
                ctx.moveTo(slitX + 8, dimY - 4); ctx.lineTo(slitX, dimY); ctx.lineTo(slitX + 8, dimY + 4);
                ctx.moveTo(screenX - 8, dimY - 4); ctx.lineTo(screenX, dimY); ctx.lineTo(screenX - 8, dimY + 4);
                ctx.fill(); 
                
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('D', slitX + (screenX - slitX) / 2, dimY - 10);

                // Dimension L (Width) - Right Arrow
                const dimX = screenX + 50;
                ctx.strokeStyle = '#94a3b8';
                
                // Extension lines
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(screenX, cy - coneHalfHeight); ctx.lineTo(dimX + 10, cy - coneHalfHeight);
                ctx.moveTo(screenX, cy + coneHalfHeight); ctx.lineTo(dimX + 10, cy + coneHalfHeight);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Arrow Line
                ctx.beginPath();
                ctx.moveTo(dimX, cy - coneHalfHeight);
                ctx.lineTo(dimX, cy + coneHalfHeight);
                ctx.stroke();
                
                // Arrowheads
                ctx.beginPath();
                ctx.moveTo(dimX - 4, cy - coneHalfHeight + 8); ctx.lineTo(dimX, cy - coneHalfHeight); ctx.lineTo(dimX + 4, cy - coneHalfHeight + 8);
                ctx.moveTo(dimX - 4, cy + coneHalfHeight - 8); ctx.lineTo(dimX, cy + coneHalfHeight); ctx.lineTo(dimX + 4, cy + coneHalfHeight - 8);
                ctx.fill();

                ctx.textAlign = 'left';
                ctx.fillText('L', dimX + 12, cy + 5);

                // Interactive Handle Hint
                ctx.fillStyle = isDraggingRef.current ? '#fbbf24' : '#475569';
                ctx.beginPath();
                ctx.arc(screenX, dimY, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // --- 2. Shared Physics for Pattern & Graph ---
        const screenRealWidth = 0.15; // 15 cm view
        
        // --- Draw Pattern ---
        if (screenRef.current) {
            const ctx = screenRef.current.getContext('2d');
            if (ctx) {
                const w = screenRef.current.width;
                const h = screenRef.current.height;
                const imageData = ctx.createImageData(w, h);
                const data = imageData.data;
                
                const rgbMatch = colorStr.match(/\d+/g);
                const R = parseInt(rgbMatch?.[0] || '255');
                const G = parseInt(rgbMatch?.[1] || '255');
                const B = parseInt(rgbMatch?.[2] || '255');
                
                for (let px = 0; px < w; px++) {
                    const xM = ((px - w/2) / w) * screenRealWidth;
                    let I = 0;
                    if (lam > 0 && D > 0) {
                        const u = (Math.PI * a * xM) / (lam * D);
                        if (Math.abs(u) < 1e-6) I = 1;
                        else I = Math.pow(Math.sin(u) / u, 2);
                    }
                    // Visual boost: Increase contrast and brightness significantly
                    // Power 0.6 makes faint parts brighter (gamma correction-ish)
                    const visualI = Math.min(1, Math.pow(I, 0.6) * 1.5);
                    
                    for (let py = 0; py < h; py++) {
                        const dy = Math.abs(py - h/2);
                        // Make the pattern vertically thinner (fade out faster)
                        // Using h * 0.25 instead of h * 0.45 concentrates it in the middle 50%
                        const vFactor = Math.max(0, 1 - Math.pow(dy / (h * 0.35), 2)); // Use parabolic fade for smoother edges
                        
                        const idx = (py * w + px) * 4;
                        data[idx] = R;
                        data[idx+1] = G;
                        data[idx+2] = B;
                        // Alpha based on intensity
                        data[idx+3] = Math.min(255, visualI * vFactor * 255);
                    }
                }
                ctx.putImageData(imageData, 0, 0);

                // --- Draw L measurement overlay on Pattern ---
                // Calculate L in screen pixels
                // The screen covers "screenRealWidth" (0.15m)
                // L_physical = 2 * lam * D / a
                const L_physical = (2 * lam * D) / a;
                const L_pixels = (L_physical / screenRealWidth) * w;
                const centerX = w / 2;
                
                // Only draw if it fits
                if (L_pixels > 10 && L_pixels < w) {
                    const arrowY = h * 0.8;
                    const startX = centerX - L_pixels / 2;
                    const endX = centerX + L_pixels / 2;

                    ctx.strokeStyle = '#fbbf24'; // Amber
                    ctx.lineWidth = 1;
                    
                    // Arrow Line
                    ctx.beginPath();
                    ctx.moveTo(startX, arrowY);
                    ctx.lineTo(endX, arrowY);
                    ctx.stroke();
                    
                    // Limits (vertical ticks)
                    ctx.beginPath();
                    ctx.moveTo(startX, arrowY - 4); ctx.lineTo(startX, arrowY + 4);
                    ctx.moveTo(endX, arrowY - 4); ctx.lineTo(endX, arrowY + 4);
                    ctx.stroke();
                    
                    // Arrowheads (Left)
                    ctx.beginPath();
                    ctx.moveTo(startX + 5, arrowY - 3); ctx.lineTo(startX, arrowY); ctx.lineTo(startX + 5, arrowY + 3);
                    ctx.stroke();
                    // Arrowheads (Right)
                    ctx.beginPath();
                    ctx.moveTo(endX - 5, arrowY - 3); ctx.lineTo(endX, arrowY); ctx.lineTo(endX - 5, arrowY + 3);
                    ctx.stroke();

                    // Label L
                    ctx.fillStyle = '#fbbf24';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('L', centerX, arrowY - 6);
                    
                    // Value (optional, maybe just L is enough per request)
                    ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
                    ctx.font = '10px monospace';
                    ctx.fillText((L_physical * 1000).toFixed(1) + ' mm', centerX, arrowY + 14);
                }
            }
        }

    }, [wavelength, slitWidth, distance, dimensions]);

    const canvasContent = (
        <div className="flex flex-col w-full h-full gap-4 p-4">
            {/* Top: Diagram */}
            <div className="flex-shrink-0 relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-xl cursor-ew-resize">
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 rounded text-xs text-slate-400 font-mono uppercase z-10 pointer-events-none">
                    Montage Expérimental (Glisser l'écran)
                </div>
                <canvas 
                    ref={diagramRef} 
                    onMouseDown={handleMouseDown} 
                    onTouchStart={handleMouseDown}
                    className="w-full h-full block touch-none" 
                />
            </div>

            {/* Bottom: Results */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Pattern */}
                <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-700 bg-black shadow-lg">
                    <div className="absolute top-2 left-2 px-2 py-1 bg-white/10 rounded text-[10px] text-slate-300 font-mono uppercase z-10">
                        Figure de Diffraction
                    </div>
                    <canvas ref={screenRef} className="w-full h-full block" />
                </div>
            </div>
        </div>
    );

    const controlsContent = (
        <>
            <section className="bg-slate-700/50 rounded-xl p-4 space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Paramètres</h3>
                
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Longueur d'onde (λ)</span>
                        <span className="font-mono" style={{ color: getWavelengthColor(wavelength) }}>{wavelength} nm</span>
                    </div>
                    <input 
                        type="range" min="380" max="750" step="1" 
                        value={wavelength} 
                        onChange={(e) => setWavelength(Number(e.target.value))}
                        className="w-full accent-blue-500"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Largeur Fente (a)</span>
                        <span className="text-emerald-400 font-mono">{slitWidth} µm</span>
                    </div>
                    <input 
                        type="range" min="20" max="200" step="5" 
                        value={slitWidth} 
                        onChange={(e) => setSlitWidth(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                    />
                </div>

                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-600">
                    <div className="text-xs text-slate-400 uppercase mb-1">Distance (D)</div>
                    <div className="text-xl font-mono text-amber-400">{distance.toFixed(2)} m</div>
                    <div className="text-[10px] text-slate-500 mt-1 italic">Glissez l'écran blanc ci-dessus pour ajuster</div>
                </div>
            </section>

            <section className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/50">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Théorie</h3>
                <div className="text-xs text-slate-400 leading-relaxed font-mono bg-slate-800 p-2 rounded mb-2 text-center text-blue-300">
                    L = 2·λ·D / a
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Observez que la tache centrale s'élargit si vous éloignez l'écran ou réduisez la fente.
                </p>
            </section>
        </>
    );

    if (embedded) {
        return (
            <EmbeddedLabCard
                title="Diffraction"
                subtitle="Simulation autonome a integrer sous une video de cours."
                canvasContent={canvasContent}
                controlsContent={controlsContent}
                accentColor="cyan"
                className={className}
            />
        );
    }

    return (
        <LabLayout 
            title="Diffraction"
            onNavigate={handleNavigate}
            currentPage="diffraction"
            canvasContent={canvasContent}
            controlsContent={controlsContent}
            headerActions={
                <button 
                    onClick={() => { setWavelength(400); setSlitWidth(100); setDistance(2.0); }}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all text-sm"
                >
                    <RefreshCw size={16} />
                </button>
            }
        />
    );
}
