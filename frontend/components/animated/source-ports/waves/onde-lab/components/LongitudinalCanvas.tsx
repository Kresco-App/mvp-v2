/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { LongitudinalWaveEngine, WaveParameters, WaveMode, EndCondition, WaveMetrics, TracerData } from '../physics/LongitudinalWaveEngine';

interface LongitudinalCanvasProps {
    isPlaying: boolean;
    amplitude: number;
    frequency: number;
    damping: number;
    tension: number;
    endCondition: EndCondition;
    waveMode: WaveMode;
    speedMode: 'normal' | 'slow';
    colorMode: 'off' | 'strain' | 'displacement';
    noiseFilter: boolean;
    showRuler: boolean;
    showReferenceLine: boolean;
    showTracerPoints: boolean;
    showWaveInfo: boolean;
    onMetricsUpdate?: (metrics: WaveMetrics) => void;
    onTracerUpdate?: (tracer1: TracerData | null, tracer2: TracerData | null) => void;
    theme?: 'light' | 'dark';
}

export interface LongitudinalCanvasRef {
    reset: () => void;
    triggerPulse: (amp: number) => void;
    setTracerIndex: (tracerNum: 0 | 1, index: number) => void;
    getTracerIndices: () => [number, number];
}

const TRACER_COLORS = [
    { main: '#3fb950', glow: 'rgba(63, 185, 80, 0.4)', light: '#7ee787', name: 'Traceur A' },
    { main: '#a371f7', glow: 'rgba(163, 113, 247, 0.4)', light: '#d2a8ff', name: 'Traceur B' },
];

const LongitudinalCanvas = forwardRef<LongitudinalCanvasRef, LongitudinalCanvasProps>((props, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const engineRef = useRef<LongitudinalWaveEngine>(new LongitudinalWaveEngine());
    const animationRef = useRef<number>(0);

    // Store latest props in a ref to avoid animation loop restarts on slider changes
    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);

    // Dragging state for source point (horizontal now)
    const isDraggingSourceRef = useRef(false);
    const mousePosRef = useRef(0); // This will track X position
    
    // Dragging state for tracer points
    const draggingTracerRef = useRef<0 | 1 | null>(null);
    
    // Tracer point history
    const tracerHistoryRef = useRef<[{x: number, time: number}[], {x: number, time: number}[]]>([[], []]);

    const reset = useCallback(() => {
        if (!canvasRef.current) return;
        const { width, height } = canvasRef.current;
        engineRef.current.reset(width, height);
        tracerHistoryRef.current = [[], []];
    }, []);

    useImperativeHandle(ref, () => ({
        reset,
        triggerPulse: (amp) => {
            engineRef.current.triggerPulse(amp);
        },
        setTracerIndex: (tracerNum: 0 | 1, index: number) => {
            engineRef.current.setTracerIndex(tracerNum, index);
            tracerHistoryRef.current[tracerNum] = [];
        },
        getTracerIndices: () => {
            return [...engineRef.current.tracerIndices] as [number, number];
        }
    }));

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const engine = engineRef.current;
        const baseHeight = canvasRef.current.height / 2;
        const currentProps = propsRef.current;
        
        if (engine.points.length === 0) return;
        
        // Check if clicking on tracer points first
        // The tracer line spans from baseHeight-50 to baseHeight+50
        // The marker triangle is at baseHeight-60 to baseHeight-48
        // Labels are above that. So the clickable area is roughly baseHeight-80 to baseHeight+60
        if (currentProps.showTracerPoints) {
            for (let t = 0; t < 2; t++) {
                const tracer = engine.getTracerPoint(t as 0 | 1);
                if (!tracer) continue;
                
                // Check if click is within horizontal range of tracer
                const hitX = Math.abs(x - tracer.x) < 30;
                // Check if click is within vertical range (marker + line area)
                const hitY = y > baseHeight - 80 && y < baseHeight + 60;
                
                if (hitX && hitY) {
                    draggingTracerRef.current = t as 0 | 1;
                    return;
                }
            }
        }
        
        // Check if clicking on source point
        if (currentProps.waveMode === 'manual') {
            const hitX = engine.points[0].actualX;
            // Hit area around the source plate
            if (Math.abs(x - hitX) < 50 && Math.abs(y - baseHeight) < 100) {
                isDraggingSourceRef.current = true;
                mousePosRef.current = x;
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        // Dragging a tracer point
        if (draggingTracerRef.current !== null) {
            const engine = engineRef.current;
            const newIndex = engine.getPointIndexAtX(x);
            engine.setTracerIndex(draggingTracerRef.current, newIndex);
            tracerHistoryRef.current[draggingTracerRef.current] = [];
            return;
        }
        
        // Dragging source point
        if (isDraggingSourceRef.current) {
            const engine = engineRef.current;
            // Calculate displacement relative to equilibrium
            const equilibriumX = engine.MARGIN_X; 
            // Clamp roughly to reasonable limits
            let targetX = x;
            if (targetX < equilibriumX - 100) targetX = equilibriumX - 100;
            if (targetX > equilibriumX + 100) targetX = equilibriumX + 100;
            
            // Store the displacement target
            mousePosRef.current = targetX - equilibriumX;
        }
    };

    const handleMouseUp = () => {
        isDraggingSourceRef.current = false;
        draggingTracerRef.current = null;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const engine = engineRef.current;
        const baseHeight = canvasRef.current.height / 2;
        const currentProps = propsRef.current;
        
        if (engine.points.length === 0) return;
        
        // Check tracers
        if (currentProps.showTracerPoints) {
            for (let t = 0; t < 2; t++) {
                const tracer = engine.getTracerPoint(t as 0 | 1);
                if (!tracer) continue;
                
                // Wider hit area for touch
                const hitX = Math.abs(x - tracer.x) < 40;
                const hitY = y > baseHeight - 90 && y < baseHeight + 70;
                
                if (hitX && hitY) {
                    draggingTracerRef.current = t as 0 | 1;
                    return;
                }
            }
        }
        
        // Check source
        if (currentProps.waveMode === 'manual') {
            const hitX = engine.points[0].actualX;
            if (Math.abs(x - hitX) < 60 && Math.abs(y - baseHeight) < 120) {
                isDraggingSourceRef.current = true;
                mousePosRef.current = x;
            }
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        
        if (draggingTracerRef.current !== null) {
            const engine = engineRef.current;
            const newIndex = engine.getPointIndexAtX(x);
            engine.setTracerIndex(draggingTracerRef.current, newIndex);
            tracerHistoryRef.current[draggingTracerRef.current] = [];
            return;
        }
        
        if (isDraggingSourceRef.current) {
            const engine = engineRef.current;
            const equilibriumX = engine.MARGIN_X; 
            let targetX = x;
            if (targetX < equilibriumX - 100) targetX = equilibriumX - 100;
            if (targetX > equilibriumX + 100) targetX = equilibriumX + 100;
            mousePosRef.current = targetX - equilibriumX;
        }
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height } = canvas;
        const baseHeight = height / 2;
        const engine = engineRef.current;
        const currentProps = propsRef.current;
        const isDark = currentProps.theme === 'dark';

        // Theme colors
        const colors = isDark ? {
            background: '#0F172A',
            grid: '#1E293B',
            axis: '#475569',
            text: '#94A3B8',
            titleText: '#F1F5F9',
            source: '#707FFF',
            sourceActive: '#FBAE17',
            infoBox: 'rgba(15, 23, 42, 0.95)',
            infoBorder: '#334155',
        } : {
            background: '#F8FAFC',
            grid: '#E2E8F0',
            axis: '#94A3B8',
            text: '#64748B',
            titleText: '#1E293B',
            source: '#707FFF',
            sourceActive: '#FBAE17',
            infoBox: 'rgba(255, 255, 255, 0.95)',
            infoBorder: '#E2E8F0',
        };

        // Clear
        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        const gridSize = 50;
        for (let x = engine.MARGIN_X; x < width - engine.MARGIN_X; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }

        // Draw Slinky as thin vertical lines (sampled from physics points)
        // Use filtered points if noise filter is enabled
        const points = currentProps.noiseFilter 
            ? engine.getFilteredPoints(0.5, 2) 
            : engine.points;
        if (points.length === 0) return;

        // Sample 100 points for display (physics uses all 200)
        const DISPLAY_POINTS = 100;
        const sampleInterval = (points.length - 1) / (DISPLAY_POINTS - 1);

        // Find max displacement for normalization in displacement mode
        let maxDisp = 1;
        if (currentProps.colorMode === 'displacement') {
            for (let i = 0; i < points.length; i++) {
                const d = Math.abs(points[i].disp);
                if (d > maxDisp) maxDisp = d;
            }
        }

        // Draw sampled points as thin vertical lines
        const lineHeight = 80;
        ctx.lineCap = 'round';
        
        for (let i = 0; i < DISPLAY_POINTS; i++) {
            const idx = Math.round(i * sampleInterval);
            const p = points[idx];
            
            // Calculate strain using neighboring points for color
            let strain = 0;
            if (idx < points.length - 1) {
                const pNext = points[idx + 1];
                const segmentWidth = pNext.actualX - p.actualX;
                const dxRest = pNext.baseX - p.baseX;
                strain = 1 - (segmentWidth / dxRest); // Positive = Compressed
            }
            
            // Determine color based on color mode
            let color = '#64748b'; // Default slate gray
            
            if (currentProps.colorMode === 'strain') {
                // Strain mode: Amber for compression, Cyan for stretch
                if (strain > 0.01) {
                    // Compressed - Amber/Orange tones
                    const intensity = Math.min(1, strain * 4);
                    const r = Math.round(100 + 145 * intensity); // 100 -> 245
                    const g = Math.round(116 + 42 * intensity);  // 116 -> 158
                    const b = Math.round(139 - 128 * intensity); // 139 -> 11
                    color = `rgb(${r}, ${g}, ${b})`;
                } else if (strain < -0.01) {
                    // Stretched - Cyan/Teal tones
                    const intensity = Math.min(1, -strain * 4);
                    const r = Math.round(100 - 94 * intensity);  // 100 -> 6
                    const g = Math.round(116 + 66 * intensity);  // 116 -> 182
                    const b = Math.round(139 + 73 * intensity);  // 139 -> 212
                    color = `rgb(${r}, ${g}, ${b})`;
                }
            } else if (currentProps.colorMode === 'displacement') {
                // Displacement mode: Gray to Purple based on |displacement|
                const intensity = Math.min(1, Math.abs(p.disp) / maxDisp);
                const r = Math.round(100 + 68 * intensity);  // 100 -> 168
                const g = Math.round(116 - 31 * intensity);  // 116 -> 85
                const b = Math.round(139 + 108 * intensity); // 139 -> 247
                color = `rgb(${r}, ${g}, ${b})`;
            }
            // colorMode === 'off' uses default gray

            // Draw thin vertical line (string-like)
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.actualX, baseHeight - lineHeight / 2);
            ctx.lineTo(p.actualX, baseHeight + lineHeight / 2);
            ctx.stroke();
        }

        // Draw Tracers
        if (currentProps.showTracerPoints) {
            for (let t = 0; t < 2; t++) {
                const tracer = engine.getTracerPoint(t as 0 | 1);
                if (!tracer) continue;
                
                const color = TRACER_COLORS[t];
                const isDragging = draggingTracerRef.current === t;
                
                // Draw vertical indicator line through the segment
                ctx.strokeStyle = color.main;
                ctx.lineWidth = isDragging ? 4 : 3;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(tracer.x, baseHeight - lineHeight / 2 - 10);
                ctx.lineTo(tracer.x, baseHeight + lineHeight / 2 + 10);
                ctx.stroke();
                
                // Draw tracer marker above the segment
                ctx.shadowColor = color.main;
                ctx.shadowBlur = isDragging ? 25 : 15;
                ctx.fillStyle = isDragging ? color.light : color.main;
                
                // Triangle marker pointing down
                ctx.beginPath();
                const markerY = baseHeight - lineHeight / 2 - 20;
                ctx.moveTo(tracer.x, markerY + 12);
                ctx.lineTo(tracer.x - 8, markerY);
                ctx.lineTo(tracer.x + 8, markerY);
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;
                
                // Label
                ctx.fillStyle = color.light;
                ctx.font = 'bold 11px "Roboto Mono", monospace';
                ctx.fillText(color.name, tracer.x - 22, markerY - 25);
                
                // Displacement text
                const p = engine.points[tracer.index];
                const dispCm = p.disp / 10;
                
                ctx.fillStyle = colors.text;
                ctx.font = '10px "Inter", monospace';
                ctx.fillText(`u: ${dispCm > 0 ? '+' : ''}${dispCm.toFixed(1)} cm`, tracer.x - 28, markerY - 10);
            }
        }
        
        // Source Plate
        const firstP = points[0];
        ctx.fillStyle = isDraggingSourceRef.current ? colors.sourceActive : colors.source;
        ctx.fillRect(firstP.actualX - 8, baseHeight - 50, 12, 100);
        
        ctx.fillStyle = colors.text;
        ctx.font = '10px "Inter", monospace';
        ctx.fillText('SOURCE', firstP.actualX - 18, baseHeight + 70);

        // Boundary
        const lastP = points[points.length - 1];
        if (currentProps.endCondition === 'fixed') {
             ctx.fillStyle = colors.axis;
             ctx.fillRect(lastP.actualX, baseHeight - 50, 15, 100);
             ctx.fillStyle = colors.text;
             ctx.fillText('FIXE', lastP.actualX - 5, baseHeight + 70);
        } else if (currentProps.endCondition === 'loose') {
             ctx.strokeStyle = colors.axis;
             ctx.lineWidth = 2;
             ctx.beginPath();
             ctx.arc(lastP.actualX, baseHeight, 10, 0, Math.PI * 2);
             ctx.stroke();
             ctx.fillStyle = colors.text;
             ctx.fillText('LIBRE', lastP.actualX - 10, baseHeight + 70);
        }

        // Info Box
        if (currentProps.showWaveInfo) {
             const metrics = engine.metrics;
             ctx.fillStyle = colors.infoBox;
             ctx.fillRect(width - 200, 10, 190, 110);
             ctx.strokeStyle = colors.infoBorder;
             ctx.lineWidth = 1;
             ctx.strokeRect(width - 200, 10, 190, 110);
             
             ctx.fillStyle = '#FBAE17';
             ctx.font = 'bold 12px "Inter", sans-serif';
             ctx.fillText('ONDE LONGITUDINALE', width - 190, 30);
             
             ctx.fillStyle = colors.text;
             ctx.font = '11px "Inter", monospace';
             ctx.fillText(`Vitesse: ${metrics.waveSpeed.toFixed(1)} cm/s`, width - 190, 50);
             ctx.fillText(`Long. Onde: ${metrics.wavelength.toFixed(1)} cm`, width - 190, 68);
             ctx.fillText(`Période: ${metrics.period.toFixed(2)} s`, width - 190, 86);
             ctx.fillText(`Dépl Max: ${metrics.maxAmplitude.toFixed(2)} cm`, width - 190, 104);
        }

    }, []);

    // Animation loop - runs independently of React render cycle
    // Uses refs exclusively to avoid any dependency on props/state
    const loopRef = useRef<(() => void) | null>(null);
    
    // Store draw function in ref so loop can access latest version
    const drawRef = useRef(draw);
    drawRef.current = draw;
    
    loopRef.current = () => {
        const currentProps = propsRef.current;
        if (currentProps.isPlaying) {
            const params: WaveParameters = { ...currentProps };
            if (!engineRef.current.update(params, isDraggingSourceRef.current ? mousePosRef.current : undefined)) {
                if (canvasRef.current) {
                    const { width, height } = canvasRef.current;
                    engineRef.current.reset(width, height);
                    tracerHistoryRef.current = [[], []];
                }
            }
            if (currentProps.onMetricsUpdate) currentProps.onMetricsUpdate(engineRef.current.metrics);
            if (currentProps.onTracerUpdate && currentProps.showTracerPoints) {
                const t1 = engineRef.current.getTracerData(0);
                const t2 = engineRef.current.getTracerData(1);
                currentProps.onTracerUpdate(t1, t2);
            }
        }
        
        drawRef.current();
        animationRef.current = requestAnimationFrame(() => loopRef.current?.());
    };

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
                const { width, height } = canvasRef.current;
                engineRef.current.reset(width, height);
                tracerHistoryRef.current = [[], []];
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        // Start animation loop once on mount
        animationRef.current = requestAnimationFrame(() => loopRef.current?.());
        return () => cancelAnimationFrame(animationRef.current);
    }, []);

    const getCursorClass = () => {
        if (draggingTracerRef.current !== null) return 'cursor-ew-resize';
        if (isDraggingSourceRef.current) return 'cursor-ew-resize';
        if (props.showTracerPoints) return 'cursor-ew-resize'; // Hint that horizontal drag works
        if (props.waveMode === 'manual') return 'cursor-ew-resize';
        return 'cursor-default';
    };

    return (
        <div ref={containerRef} className="relative h-full w-full">
            <canvas 
                ref={canvasRef} 
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
                onTouchCancel={handleMouseUp}
                className={`${getCursorClass()} block touch-none`}
            />
            {props.showTracerPoints && (
                <div className={`absolute bottom-2 left-2 rounded-md border px-2.5 py-1.5 font-sans text-[11px] ${props.theme === 'dark' ? 'border-[#334155] bg-[#0F172A]/90 text-[#94A3B8]' : 'border-[#E2E8F0] bg-white/90 text-[#64748B]'}`}>
                    Glissez les particules gauche/droite
                </div>
            )}
        </div>
    );
});

export default LongitudinalCanvas;
