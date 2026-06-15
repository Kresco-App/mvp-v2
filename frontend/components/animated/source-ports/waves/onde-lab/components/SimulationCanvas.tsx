/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { WaveEngine, WaveParameters, WaveMode, EndCondition, WaveMetrics, TracerData } from '../physics/WaveEngine';

interface SimulationCanvasProps {
    isPlaying: boolean;
    amplitude: number;
    frequency: number;
    damping: number;
    tension: number;
    linearMass?: number;
    endCondition: EndCondition;
    waveMode: WaveMode;
    speedMode: 'normal' | 'slow';
    showRuler: boolean;
    showReferenceLine: boolean;
    showTracerPoints: boolean;
    showWaveInfo: boolean;
    noiseFilter?: boolean;
    onMetricsUpdate?: (metrics: WaveMetrics) => void;
    onTracerUpdate?: (tracer1: TracerData | null, tracer2: TracerData | null) => void;
    theme?: 'light' | 'dark';
}

export interface SimulationCanvasRef {
    reset: () => void;
    triggerPulse: (amp: number) => void;
    setTracerIndex: (tracerNum: 0 | 1, index: number) => void;
    getTracerIndices: () => [number, number];
}

// Tracer colors
const TRACER_COLORS = [
    { main: '#22C55E', glow: 'rgba(34, 197, 94, 0.4)', light: '#86EFAC', name: 'Traceur A' },
    { main: '#A855F7', glow: 'rgba(168, 85, 247, 0.4)', light: '#D8B4FE', name: 'Traceur B' },
];

// Theme colors
const THEMES = {
    light: {
        background: '#F8FAFC',
        grid: '#E2E8F0',
        axis: '#94A3B8',
        text: '#64748B',
        titleText: '#1E293B',
        equilibrium: '#CBD5E1',
        rope: '#FBAE17',
        ropeGlow: 'rgba(251, 174, 23, 0.3)',
        ropeHighlight: '#FDD675',
        beads: '#F59E0B',
        beadsHighlight: '#FEF3C7',
        source: '#707FFF',
        sourceGlow: 'rgba(112, 127, 255, 0.4)',
        sourceInner: '#A3ADFF',
        infoBox: 'rgba(255, 255, 255, 0.95)',
        infoBorder: '#E2E8F0',
    },
    dark: {
        background: '#0F172A',
        grid: '#1E293B',
        axis: '#475569',
        text: '#94A3B8',
        titleText: '#F1F5F9',
        equilibrium: '#334155',
        rope: '#FF6B6B',
        ropeGlow: 'rgba(255, 107, 107, 0.4)',
        ropeHighlight: '#FFC9C9',
        beads: '#FFA8A8',
        beadsHighlight: '#FFD9D9',
        source: '#58A6FF',
        sourceGlow: 'rgba(88, 166, 255, 0.4)',
        sourceInner: '#79C0FF',
        infoBox: 'rgba(15, 23, 42, 0.95)',
        infoBorder: '#334155',
    }
};

const SimulationCanvas = forwardRef<SimulationCanvasRef, SimulationCanvasProps>((props, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const engineRef = useRef<WaveEngine>(new WaveEngine());
    const animationRef = useRef<number>(0);

    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);

    const isDraggingSourceRef = useRef(false);
    const mousePosRef = useRef(0);
    const draggingTracerRef = useRef<0 | 1 | null>(null);
    const tracerHistoryRef = useRef<[{y: number, time: number}[], {y: number, time: number}[]]>([[], []]);

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
        const currentProps = propsRef.current;
        
        if (engine.points.length === 0) return;
        
        if (currentProps.showTracerPoints) {
            for (let t = 0; t < 2; t++) {
                const tracer = engine.getTracerPoint(t as 0 | 1);
                if (tracer && Math.abs(x - tracer.x) < 20 && Math.abs(y - tracer.y) < 30) {
                    draggingTracerRef.current = t as 0 | 1;
                    return;
                }
            }
        }
        
        if (currentProps.waveMode === 'manual') {
            const hitX = engine.points[0].x;
            const hitY = engine.points[0].y;
            
            if (Math.abs(x - hitX) < 50 && Math.abs(y - hitY) < 100) {
                isDraggingSourceRef.current = true;
                mousePosRef.current = y;
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (draggingTracerRef.current !== null) {
            const engine = engineRef.current;
            const newIndex = engine.getPointIndexAtX(x);
            engine.setTracerIndex(draggingTracerRef.current, newIndex);
            tracerHistoryRef.current[draggingTracerRef.current] = [];
            return;
        }
        
        if (isDraggingSourceRef.current) {
            mousePosRef.current = y;
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // Reuse logic logic from MouseDown
        const engine = engineRef.current;
        const currentProps = propsRef.current;
        
        if (engine.points.length === 0) return;
        
        if (currentProps.showTracerPoints) {
            for (let t = 0; t < 2; t++) {
                const tracer = engine.getTracerPoint(t as 0 | 1);
                if (tracer && Math.abs(x - tracer.x) < 30 && Math.abs(y - tracer.y) < 40) {
                    draggingTracerRef.current = t as 0 | 1;
                    return;
                }
            }
        }
        
        if (currentProps.waveMode === 'manual') {
            const hitX = engine.points[0].x;
            const hitY = engine.points[0].y;
            
            if (Math.abs(x - hitX) < 50 && Math.abs(y - hitY) < 100) {
                isDraggingSourceRef.current = true;
                mousePosRef.current = y;
            }
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        if (draggingTracerRef.current !== null) {
            const engine = engineRef.current;
            const newIndex = engine.getPointIndexAtX(x);
            engine.setTracerIndex(draggingTracerRef.current, newIndex);
            tracerHistoryRef.current[draggingTracerRef.current] = [];
            return;
        }
        
        if (isDraggingSourceRef.current) {
            mousePosRef.current = y;
        }
    };

    const handleMouseUp = () => {
        isDraggingSourceRef.current = false;
        draggingTracerRef.current = null;
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
        const theme = THEMES[currentProps.theme || 'light'];

        // Clear
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1;
        const gridSize = 50;
        for (let x = engine.MARGIN_X; x < width - engine.MARGIN_X; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Reference Line
        if (currentProps.showReferenceLine) {
            ctx.beginPath();
            ctx.strokeStyle = theme.equilibrium;
            ctx.setLineDash([8, 4]);
            ctx.lineWidth = 2;
            ctx.moveTo(engine.MARGIN_X, baseHeight);
            ctx.lineTo(width - engine.MARGIN_X, baseHeight);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = theme.text;
            ctx.font = '11px "Inter", sans-serif';
            ctx.fillText('Équilibre', engine.MARGIN_X, baseHeight - 10);
        }

        // Ruler
        if (currentProps.showRuler) {
            ctx.strokeStyle = theme.axis;
            ctx.fillStyle = theme.text;
            ctx.lineWidth = 1;
            ctx.font = '11px "Inter", monospace';

            ctx.fillStyle = theme.titleText;
            ctx.fillText('Amplitude (cm)', 5, 20);
            
            for (let y = -150; y <= 150; y += 50) {
                const screenY = baseHeight + y;
                ctx.strokeStyle = y === 0 ? theme.titleText : theme.axis;
                ctx.beginPath();
                ctx.moveTo(engine.MARGIN_X - 25, screenY);
                ctx.lineTo(engine.MARGIN_X - 5, screenY);
                ctx.stroke();
                
                ctx.fillStyle = theme.text;
                const cmVal = Math.abs(y) / 10;
                const label = y === 0 ? '0' : (y < 0 ? `+${cmVal}` : `-${cmVal}`);
                ctx.fillText(label, engine.MARGIN_X - 45, screenY + 4);
            }

            ctx.fillStyle = theme.titleText;
            ctx.fillText('Position (cm)', width / 2 - 40, height - 10);
            
            for (let x = engine.MARGIN_X; x <= width - engine.MARGIN_X; x += 100) {
                ctx.strokeStyle = theme.axis;
                ctx.beginPath();
                ctx.moveTo(x, baseHeight - 8);
                ctx.lineTo(x, baseHeight + 8);
                ctx.stroke();
                
                ctx.fillStyle = theme.text;
                const cmVal = (x - engine.MARGIN_X) / 10;
                ctx.fillText(`${cmVal.toFixed(0)}`, x - 8, baseHeight + 25);
            }
        }

        // Draw String
        const useFilter = currentProps.noiseFilter !== false;
        const points = useFilter ? engine.getFilteredPoints() : engine.getVisiblePoints();
        if (points.length === 0) return;

        const catmullRomSpline = (
            ctx: CanvasRenderingContext2D,
            pts: { x: number; y: number }[],
        ) => {
            if (pts.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[Math.min(pts.length - 1, i + 1)];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                
                const segments = 6;
                for (let t = 1; t <= segments; t++) {
                    const tNorm = t / segments;
                    const tSq = tNorm * tNorm;
                    const tCu = tSq * tNorm;
                    
                    const x = 0.5 * (
                        (2 * p1.x) + (-p0.x + p2.x) * tNorm +
                        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tSq +
                        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tCu
                    );
                    const y = 0.5 * (
                        (2 * p1.y) + (-p0.y + p2.y) * tNorm +
                        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tSq +
                        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tCu
                    );
                    ctx.lineTo(x, y);
                }
            }
        };

        const sampledPoints: { x: number; y: number }[] = [];
        for (let i = 0; i < points.length; i += 2) {
            sampledPoints.push({ x: points[i].x, y: points[i].y });
        }
        if (points.length > 0) {
            const lastPt = points[points.length - 1];
            if (sampledPoints[sampledPoints.length - 1]?.x !== lastPt.x) {
                sampledPoints.push({ x: lastPt.x, y: lastPt.y });
            }
        }

        // Glow
        ctx.shadowColor = theme.rope;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = theme.ropeGlow;
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        catmullRomSpline(ctx, sampledPoints);
        ctx.stroke();
        
        // Main rope
        ctx.shadowBlur = 6;
        ctx.strokeStyle = theme.rope;
        ctx.lineWidth = 5;
        catmullRomSpline(ctx, sampledPoints);
        ctx.stroke();
        
        // Highlight
        ctx.shadowBlur = 0;
        ctx.strokeStyle = theme.ropeHighlight;
        ctx.lineWidth = 2;
        catmullRomSpline(ctx, sampledPoints);
        ctx.stroke();

        // Beads
        ctx.fillStyle = theme.beads;
        for (let i = 0; i < points.length; i += 10) {
            ctx.beginPath();
            ctx.arc(points[i].x, points[i].y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = theme.beadsHighlight;
            ctx.beginPath();
            ctx.arc(points[i].x - 1, points[i].y - 1, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = theme.beads;
        }

        // Draw Tracer Points
        if (currentProps.showTracerPoints) {
            for (let t = 0; t < 2; t++) {
                const tracer = engine.getTracerPoint(t as 0 | 1);
                if (!tracer) continue;
                
                const color = TRACER_COLORS[t];
                const history = tracerHistoryRef.current[t];
                
                if (currentProps.isPlaying) {
                    history.push({ y: tracer.y, time: engine.time });
                    if (history.length > 60) history.shift();
                }

                // Vertical guide line
                ctx.strokeStyle = color.main;
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(tracer.x, 0);
                ctx.lineTo(tracer.x, height);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;

                // Motion trail
                const trailWidth = 60;
                ctx.strokeStyle = color.glow;
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < history.length; i++) {
                    const alpha = i / history.length;
                    const xOffset = tracer.x - trailWidth + (trailWidth * alpha);
                    if (i === 0) {
                        ctx.moveTo(xOffset, history[i].y);
                    } else {
                        ctx.lineTo(xOffset, history[i].y);
                    }
                }
                ctx.stroke();

                // Tracer point
                const isDragging = draggingTracerRef.current === t;
                ctx.shadowColor = color.main;
                ctx.shadowBlur = isDragging ? 25 : 15;
                ctx.fillStyle = isDragging ? color.light : color.main;
                ctx.beginPath();
                ctx.arc(tracer.x, tracer.y, isDragging ? 14 : 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Inner highlight
                ctx.fillStyle = color.light;
                ctx.beginPath();
                ctx.arc(tracer.x, tracer.y, 5, 0, Math.PI * 2);
                ctx.fill();

                // Velocity arrow
                const arrowScale = 15;
                const vy = tracer.velocity * arrowScale;
                if (Math.abs(vy) > 2) {
                    ctx.strokeStyle = '#FBAE17';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(tracer.x + 18, tracer.y);
                    ctx.lineTo(tracer.x + 18, tracer.y + vy);
                    ctx.stroke();
                    
                    const headSize = 5;
                    const direction = vy > 0 ? 1 : -1;
                    ctx.beginPath();
                    ctx.moveTo(tracer.x + 18, tracer.y + vy);
                    ctx.lineTo(tracer.x + 18 - headSize, tracer.y + vy - headSize * direction);
                    ctx.lineTo(tracer.x + 18 + headSize, tracer.y + vy - headSize * direction);
                    ctx.closePath();
                    ctx.fillStyle = '#FBAE17';
                    ctx.fill();
                }

                // Label
                ctx.fillStyle = color.main;
                ctx.font = 'bold 11px "Inter", sans-serif';
                const labelY = t === 0 ? 22 : 38;
                ctx.fillText(color.name, tracer.x - 28, labelY);
                ctx.font = '10px "Inter", monospace';
                const dispCm = (baseHeight - tracer.y) / 10;
                ctx.fillText(`y: ${dispCm.toFixed(1)} cm`, tracer.x - 28, labelY + 12);
            }
        }

        // End Condition Visualization
        const lastP = points[points.length - 1];
        if (currentProps.endCondition === 'fixed') {
            ctx.fillStyle = theme.axis;
            ctx.fillRect(lastP.x - 3, baseHeight - 80, 12, 160);
            
            ctx.strokeStyle = theme.text;
            ctx.lineWidth = 1;
            for (let i = -80; i < 80; i += 10) {
                ctx.beginPath();
                ctx.moveTo(lastP.x, baseHeight + i);
                ctx.lineTo(lastP.x + 10, baseHeight + i + 10);
                ctx.stroke();
            }
            
            ctx.fillStyle = theme.rope;
            ctx.beginPath();
            ctx.arc(lastP.x, lastP.y, 6, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = theme.text;
            ctx.font = '10px "Inter", monospace';
            ctx.fillText('FIXE', lastP.x - 15, baseHeight + 100);
            
        } else if (currentProps.endCondition === 'loose') {
            ctx.strokeStyle = theme.axis;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(lastP.x, baseHeight - 100);
            ctx.lineTo(lastP.x, baseHeight + 100);
            ctx.stroke();
            
            ctx.fillStyle = theme.background;
            ctx.strokeStyle = theme.rope;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(lastP.x, lastP.y, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = theme.text;
            ctx.font = '10px "Inter", monospace';
            ctx.fillText('LIBRE', lastP.x - 12, baseHeight + 120);
            
        } else if (currentProps.endCondition === 'none') {
            const gradient = ctx.createLinearGradient(lastP.x - 60, 0, lastP.x + 30, 0);
            gradient.addColorStop(0, theme.rope);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(lastP.x - 60, lastP.y);
            ctx.lineTo(lastP.x + 30, lastP.y);
            ctx.stroke();
            
            ctx.fillStyle = theme.text;
            ctx.font = '16px serif';
            ctx.fillText('→∞', lastP.x + 10, baseHeight + 5);
            
            ctx.font = '10px "Inter", monospace';
            ctx.fillText('INFINIE', lastP.x - 20, baseHeight + 100);
        }
        
        // Source point
        const firstP = points[0];
        
        ctx.fillStyle = theme.equilibrium;
        ctx.fillRect(firstP.x - 30, baseHeight - 60, 25, 120);
        
        ctx.strokeStyle = theme.axis;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(firstP.x - 15, firstP.y);
        ctx.lineTo(firstP.x, firstP.y);
        ctx.stroke();
        
        if (isDraggingSourceRef.current) {
            ctx.shadowColor = '#FBAE17';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#FBAE17';
        } else {
            ctx.shadowColor = theme.source;
            ctx.shadowBlur = 15;
            ctx.fillStyle = theme.source;
        }
        ctx.beginPath();
        ctx.arc(firstP.x, firstP.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = isDraggingSourceRef.current ? '#FDD675' : theme.sourceInner;
        ctx.beginPath();
        ctx.arc(firstP.x, firstP.y, 7, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = theme.text;
        ctx.font = '10px "Inter", monospace';
        ctx.fillText('SOURCE', firstP.x - 22, baseHeight + 100);

        // Wave Info
        if (currentProps.showWaveInfo) {
            const metrics = engine.metrics;
            
            ctx.fillStyle = theme.infoBox;
            ctx.fillRect(width - 200, 10, 190, 110);
            ctx.strokeStyle = theme.infoBorder;
            ctx.lineWidth = 1;
            ctx.strokeRect(width - 200, 10, 190, 110);
            
            ctx.fillStyle = theme.titleText;
            ctx.font = 'bold 12px "Inter", sans-serif';
            ctx.fillText('PROPRIÉTÉS DE L\'ONDE', width - 190, 30);
            
            ctx.fillStyle = theme.text;
            ctx.font = '11px "Inter", monospace';
            ctx.fillText(`Vitesse: ${metrics.waveSpeed.toFixed(1)} cm/s`, width - 190, 50);
            ctx.fillText(`Long. Onde: ${metrics.wavelength.toFixed(1)} cm`, width - 190, 68);
            ctx.fillText(`Période: ${metrics.period.toFixed(2)} s`, width - 190, 86);
            ctx.fillText(`Amp Max: ${metrics.maxAmplitude.toFixed(2)} cm`, width - 190, 104);
        }
    }, []);

    const loopRef = useRef<(() => void) | null>(null);
    const drawRef = useRef(draw);
    drawRef.current = draw;
    
    loopRef.current = () => {
        const currentProps = propsRef.current;
        if (currentProps.isPlaying) {
            const params: WaveParameters = { ...currentProps };
            const baseHeight = canvasRef.current ? canvasRef.current.height / 2 : 300;
            if (!engineRef.current.update(params, baseHeight, isDraggingSourceRef.current ? mousePosRef.current : undefined)) {
                console.warn("Divergence detected, resetting.");
                if (canvasRef.current) {
                    const { width, height } = canvasRef.current;
                    engineRef.current.reset(width, height);
                    tracerHistoryRef.current = [[], []];
                }
            }
            
            if (currentProps.onMetricsUpdate) {
                currentProps.onMetricsUpdate(engineRef.current.metrics);
            }
            
            if (currentProps.onTracerUpdate && currentProps.showTracerPoints) {
                const tracer1 = engineRef.current.getTracerData(0);
                const tracer2 = engineRef.current.getTracerData(1);
                currentProps.onTracerUpdate(tracer1, tracer2);
            }
        }
        drawRef.current();
        animationRef.current = requestAnimationFrame(() => loopRef.current?.());
    };

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                canvasRef.current.width = clientWidth;
                canvasRef.current.height = clientHeight;
                engineRef.current.reset(clientWidth, clientHeight);
                tracerHistoryRef.current = [[], []];
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        animationRef.current = requestAnimationFrame(() => loopRef.current?.());
        return () => cancelAnimationFrame(animationRef.current);
    }, []);

    const getCursorClass = () => {
        if (draggingTracerRef.current !== null) return 'cursor-grabbing';
        if (isDraggingSourceRef.current) return 'cursor-grabbing';
        if (props.showTracerPoints) return 'cursor-grab';
        if (props.waveMode === 'manual') return 'cursor-grab';
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
                <div className={`absolute bottom-2 left-2 rounded-full border px-3 py-1.5 font-sans text-[11px] ${props.theme === 'dark' ? 'border-[#334155] bg-[#0F172A]/90 text-[#94A3B8]' : 'border-[#E2E8F0] bg-white/95 text-[#64748B]'}`}>
                    ↔️ Glissez les points pour les déplacer
                </div>
            )}
        </div>
    );
});

export default SimulationCanvas;
