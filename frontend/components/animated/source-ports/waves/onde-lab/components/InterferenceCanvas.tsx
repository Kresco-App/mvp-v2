/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { InterferenceEngine, InterferenceParameters, InterferenceMetrics, InterferenceMode } from '../physics/InterferenceEngine';

interface InterferenceCanvasProps {
    isPlaying: boolean;
    amplitude: number;
    pulseWidth: number;
    tension: number;
    mode: InterferenceMode;
    speedMode: 'normal' | 'slow';
    showGhostWaves: boolean;
    showResultant: boolean;
    showRuler: boolean;
    showReferenceLine: boolean;
    showWaveInfo: boolean;
    onMetricsUpdate?: (metrics: InterferenceMetrics) => void;
    theme?: 'light' | 'dark';
}

export interface InterferenceCanvasRef {
    reset: () => void;
    sendPulse1: () => void;
    sendPulse2: () => void;
    sendBothPulses: () => void;
    seekToTime: (normalizedTime: number) => void;
}

// Wave colors
const WAVE_COLORS = {
    ghost1: { main: 'rgba(88, 166, 255, 0.4)', glow: 'rgba(88, 166, 255, 0.2)', light: 'rgba(121, 192, 255, 0.5)', name: 'Pulse 1 Ghost' },
    ghost2: { main: 'rgba(249, 115, 22, 0.4)', glow: 'rgba(249, 115, 22, 0.2)', light: 'rgba(251, 146, 60, 0.5)', name: 'Pulse 2 Ghost' },
    resultant: { main: '#a855f7', glow: 'rgba(168, 85, 247, 0.5)', light: '#c084fc', name: 'Rope (Superposition)' },
};

const InterferenceCanvas = forwardRef<InterferenceCanvasRef, InterferenceCanvasProps>((props, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const engineRef = useRef<InterferenceEngine>(new InterferenceEngine());
    const animationRef = useRef<number>(0);
    const propsRef = useRef(props);
    propsRef.current = props;

    const reset = useCallback(() => {
        if (!canvasRef.current) return;
        const { width, height } = canvasRef.current;
        engineRef.current.reset(width, height);
    }, []);

    const sendPulse1 = useCallback(() => {
        engineRef.current.sendPulse1(propsRef.current.amplitude, propsRef.current.pulseWidth);
    }, []);

    const sendPulse2 = useCallback(() => {
        engineRef.current.sendPulse2(
            propsRef.current.amplitude, 
            propsRef.current.pulseWidth, 
            propsRef.current.mode === 'destructive'
        );
    }, []);

    const sendBothPulses = useCallback(() => {
        engineRef.current.sendBothPulses(
            propsRef.current.amplitude, 
            propsRef.current.pulseWidth, 
            propsRef.current.mode
        );
    }, []);

    const seekToTime = useCallback((normalizedTime: number) => {
        const params = {
            amplitude: propsRef.current.amplitude,
            pulseWidth: propsRef.current.pulseWidth,
            tension: propsRef.current.tension,
            mode: propsRef.current.mode,
            speedMode: propsRef.current.speedMode,
        };
        const baseHeight = canvasRef.current ? canvasRef.current.height / 2 : 300;
        engineRef.current.seekToTime(normalizedTime, params, baseHeight);
        
        if (propsRef.current.onMetricsUpdate) {
            propsRef.current.onMetricsUpdate(engineRef.current.metrics);
        }
    }, []);

    useImperativeHandle(ref, () => ({
        reset,
        sendPulse1,
        sendPulse2,
        sendBothPulses,
        seekToTime,
    }));

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height } = canvas;
        const baseHeight = height / 2;
        const engine = engineRef.current;
        const isDark = propsRef.current.theme === 'dark';

        // Theme colors
        const colors = isDark ? {
            background: '#0F172A',
            grid: '#1E293B',
            axis: '#475569',
            text: '#94A3B8',
            titleText: '#F1F5F9',
            equilibrium: '#334155',
            infoBox: 'rgba(15, 23, 42, 0.95)',
            infoBorder: '#334155',
        } : {
            background: '#F8FAFC',
            grid: '#E2E8F0',
            axis: '#94A3B8',
            text: '#64748B',
            titleText: '#1E293B',
            equilibrium: '#CBD5E1',
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

        // Reference Line (the rope at rest)
        if (props.showReferenceLine) {
            ctx.beginPath();
            ctx.strokeStyle = colors.equilibrium;
            ctx.setLineDash([8, 4]);
            ctx.lineWidth = 2;
            ctx.moveTo(engine.MARGIN_X, baseHeight);
            ctx.lineTo(width - engine.MARGIN_X, baseHeight);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = colors.text;
            ctx.font = '11px "Inter", sans-serif';
            ctx.fillText('Corde au Repos', engine.MARGIN_X, baseHeight - 10);
        }

        // Ruler
        if (props.showRuler) {
            ctx.strokeStyle = colors.axis;
            ctx.fillStyle = colors.text;
            ctx.lineWidth = 1;
            ctx.font = '11px "Inter", monospace';

            ctx.fillStyle = colors.titleText;
            ctx.fillText('Amplitude (cm)', 5, 20);
            
            // Vertical ruler
            for (let y = -150; y <= 150; y += 50) {
                const screenY = baseHeight + y;
                ctx.strokeStyle = y === 0 ? colors.titleText : colors.axis;
                ctx.beginPath();
                ctx.moveTo(engine.MARGIN_X - 25, screenY);
                ctx.lineTo(engine.MARGIN_X - 5, screenY);
                ctx.stroke();
                
                ctx.fillStyle = colors.text;
                const cmVal = Math.abs(y) / 10;
                const label = y === 0 ? '0' : (y < 0 ? `+${cmVal}` : `-${cmVal}`);
                ctx.fillText(label, engine.MARGIN_X - 45, screenY + 4);
            }

            ctx.fillStyle = colors.titleText;
            ctx.fillText('Position (cm)', width / 2 - 40, height - 10);
            
            // Horizontal ruler
            for (let x = engine.MARGIN_X; x <= width - engine.MARGIN_X; x += 100) {
                ctx.strokeStyle = colors.axis;
                ctx.beginPath();
                ctx.moveTo(x, baseHeight - 8);
                ctx.lineTo(x, baseHeight + 8);
                ctx.stroke();
                
                ctx.fillStyle = colors.text;
                const cmVal = (x - engine.MARGIN_X) / 10;
                ctx.fillText(`${cmVal.toFixed(0)}`, x - 8, baseHeight + 25);
            }
        }

        // Helper function to draw a smooth wave
        const drawWave = (
            points: { x: number; y: number }[],
            color: typeof WAVE_COLORS.ghost1,
            lineWidth: number = 3,
            showGlow: boolean = true,
            isDashed: boolean = false
        ) => {
            if (points.length < 2) return;
            
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            
            // Catmull-Rom spline for smoothness
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[Math.max(0, i - 1)];
                const p1 = points[i];
                const p2 = points[Math.min(points.length - 1, i + 1)];
                const p3 = points[Math.min(points.length - 1, i + 2)];
                
                const segments = 4;
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
            
            if (isDashed) {
                ctx.setLineDash([8, 6]);
            }
            
            // Glow effect
            if (showGlow && !isDashed) {
                ctx.shadowColor = color.main;
                ctx.shadowBlur = 10;
                ctx.strokeStyle = color.glow;
                ctx.lineWidth = lineWidth + 6;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
            
            // Main line
            ctx.shadowBlur = showGlow ? 4 : 0;
            ctx.strokeStyle = color.main;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            
            // Highlight
            ctx.shadowBlur = 0;
            ctx.strokeStyle = color.light;
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.setLineDash([]);
        };

        // Get wave points
        const ghost1Points = engine.getWave1Points();
        const ghost2Points = engine.getWave2Points();
        const resultantPoints = engine.getResultantPoints();

        // Sample points for smoother rendering
        const samplePoints = (pts: { x: number; y: number }[], step: number = 2) => {
            const sampled: { x: number; y: number }[] = [];
            for (let i = 0; i < pts.length; i += step) {
                sampled.push(pts[i]);
            }
            if (pts.length > 0 && sampled[sampled.length - 1] !== pts[pts.length - 1]) {
                sampled.push(pts[pts.length - 1]);
            }
            return sampled;
        };

        // Draw ghost waves (dashed, semi-transparent - show individual pulse paths)
        if (props.showGhostWaves) {
            if (engine.isPulse1Active) {
                drawWave(samplePoints(ghost1Points), WAVE_COLORS.ghost1, 2, false, true);
            }
            if (engine.isPulse2Active) {
                drawWave(samplePoints(ghost2Points), WAVE_COLORS.ghost2, 2, false, true);
            }
        }
        
        // Draw resultant wave (the actual rope - solid, prominent)
        if (props.showResultant && resultantPoints.length > 0) {
            drawWave(samplePoints(resultantPoints), WAVE_COLORS.resultant, 4, true, false);
        }

        // Draw fixed end points (the rope is attached at both ends)
        const leftX = engine.MARGIN_X;
        const rightX = width - engine.MARGIN_X;
        
        // Left fixed point
        ctx.fillStyle = colors.equilibrium;
        ctx.fillRect(leftX - 20, baseHeight - 40, 15, 80);
        
        ctx.fillStyle = '#707FFF';
        ctx.beginPath();
        ctx.arc(leftX, baseHeight, 8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = colors.text;
        ctx.font = '10px "Inter", monospace';
        ctx.fillText('GAUCHE', leftX - 12, baseHeight + 55);
        
        // Right fixed point
        ctx.fillStyle = colors.equilibrium;
        ctx.fillRect(rightX + 5, baseHeight - 40, 15, 80);
        
        ctx.fillStyle = '#FBAE17';
        ctx.beginPath();
        ctx.arc(rightX, baseHeight, 8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = colors.text;
        ctx.fillText('DROITE', rightX - 15, baseHeight + 55);

        // Center marker for collision zone
        const centerX = width / 2;
        const metrics = engine.metrics;
        
        if (metrics.collisionProgress > 0) {
            // Highlight collision zone
            const glowIntensity = metrics.collisionProgress;
            ctx.fillStyle = props.mode === 'constructive' 
                ? `rgba(63, 185, 80, ${glowIntensity * 0.3})`
                : `rgba(248, 81, 73, ${glowIntensity * 0.3})`;
            ctx.beginPath();
            ctx.arc(centerX, baseHeight, 60 * glowIntensity, 0, Math.PI * 2);
            ctx.fill();
            
            // Collision label
            ctx.fillStyle = props.mode === 'constructive' ? '#3fb950' : '#f85149';
            ctx.font = 'bold 14px "Roboto Mono", monospace';
            const label = props.mode === 'constructive' ? 'CONSTRUCTIVE !' : 'DESTRUCTIVE !';
            ctx.fillText(label, centerX - 50, baseHeight - 100);
            
            // Show amplitude during collision
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px "Roboto Mono", monospace';
            ctx.fillText(`Amplitude: ${metrics.maxAmplitude.toFixed(2)} cm`, centerX - 55, baseHeight - 80);
        }

        // Wave Info Panel
        if (props.showWaveInfo) {
            ctx.fillStyle = colors.infoBox;
            ctx.fillRect(width - 220, 10, 210, 140);
            ctx.strokeStyle = colors.infoBorder;
            ctx.lineWidth = 1;
            ctx.strokeRect(width - 220, 10, 210, 140);
            
            ctx.fillStyle = '#707FFF';
            ctx.font = 'bold 12px "Inter", sans-serif';
            ctx.fillText('SUPERPOSITION D\'IMPULSIONS', width - 210, 30);
            
            ctx.fillStyle = colors.text;
            ctx.font = '11px "Inter", monospace';
            ctx.fillText(`Mode: ${props.mode}`, width - 210, 50);
            ctx.fillText(`Diff Phase: ${metrics.phaseDifference}°`, width - 210, 68);
            ctx.fillText(`Vitesse: ${metrics.waveSpeed.toFixed(1)} cm/s`, width - 210, 86);
            ctx.fillText(`Amp Max: ${metrics.maxAmplitude.toFixed(2)} cm`, width - 210, 104);
            
            // Pulse status
            const p1Status = engine.isPulse1Active ? 'ACTIVE' : 'attente';
            const p2Status = engine.isPulse2Active ? 'ACTIVE' : 'attente';
            ctx.fillStyle = engine.isPulse1Active ? '#707FFF' : colors.text;
            ctx.fillText(`Impulsion 1: ${p1Status}`, width - 210, 122);
            ctx.fillStyle = engine.isPulse2Active ? '#FBAE17' : colors.text;
            ctx.fillText(`Impulsion 2: ${p2Status}`, width - 210, 140);
        }

        // Legend
        const legendY = 10;
        const legendX = 10;
        ctx.fillStyle = colors.infoBox;
        ctx.fillRect(legendX, legendY, 160, 90);
        ctx.strokeStyle = colors.infoBorder;
        ctx.strokeRect(legendX, legendY, 160, 90);
        
        ctx.font = '10px "Inter", monospace';
        
        if (props.showResultant) {
            ctx.fillStyle = WAVE_COLORS.resultant.main;
            ctx.fillRect(legendX + 10, legendY + 15, 20, 5);
            ctx.fillStyle = colors.titleText;
            ctx.fillText('Corde (réelle)', legendX + 35, legendY + 20);
        }
        
        if (props.showGhostWaves) {
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = WAVE_COLORS.ghost1.main;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(legendX + 10, legendY + 40);
            ctx.lineTo(legendX + 30, legendY + 40);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = colors.text;
            ctx.fillText('Trajet Impuls. 1 →', legendX + 35, legendY + 44);
            
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = WAVE_COLORS.ghost2.main;
            ctx.beginPath();
            ctx.moveTo(legendX + 10, legendY + 60);
            ctx.lineTo(legendX + 30, legendY + 60);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = colors.text;
            ctx.fillText('Trajet Impuls. 2 ←', legendX + 35, legendY + 64);
        }
        
        ctx.fillStyle = colors.text;
        ctx.font = '9px "Inter", sans-serif';
        ctx.fillText('Fantômes: trajets individuels', legendX + 10, legendY + 82);

    }, [props.showReferenceLine, props.showRuler, props.showWaveInfo, props.showGhostWaves, props.showResultant, props.mode, props.theme]);

    const loop = useCallback(() => {
        if (props.isPlaying) {
            const params: InterferenceParameters = {
                amplitude: props.amplitude,
                pulseWidth: props.pulseWidth,
                tension: props.tension,
                mode: props.mode,
                speedMode: props.speedMode,
            };
            const baseHeight = canvasRef.current ? canvasRef.current.height / 2 : 300;
            engineRef.current.update(params, baseHeight);
            
            if (props.onMetricsUpdate) {
                props.onMetricsUpdate(engineRef.current.metrics);
            }
        }
        draw();
        animationRef.current = requestAnimationFrame(loop);
    }, [props, draw]);

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                canvasRef.current.width = clientWidth;
                canvasRef.current.height = clientHeight;
                reset();
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [reset]);

    useEffect(() => {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationRef.current);
    }, [loop]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <canvas 
                ref={canvasRef} 
                style={{ cursor: 'default', display: 'block' }}
            />
        </div>
    );
});

export default InterferenceCanvas;
