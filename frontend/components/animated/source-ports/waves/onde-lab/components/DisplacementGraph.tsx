/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useRef, useEffect, useCallback } from 'react';

export interface TracerDataPoint {
    time: number;
    displacement: number;
    velocity: number;
}

interface DisplacementGraphProps {
    history1Ref: React.MutableRefObject<TracerDataPoint[]>;
    history2Ref: React.MutableRefObject<TracerDataPoint[]>;
    maxAmplitude: number;
    timeWindow: number;
    isPlaying: boolean;
    height?: number;
    theme?: 'light' | 'dark';
}

// Same colors as SimulationCanvas
const TRACER_COLORS = [
    { main: '#22C55E', glow: 'rgba(34, 197, 94, 0.3)', light: '#86EFAC', name: 'Traceur A' },
    { main: '#A855F7', glow: 'rgba(168, 85, 247, 0.3)', light: '#D8B4FE', name: 'Traceur B' },
];

const THEMES = {
    light: {
        backgroundColor: '#F8FAFC',
        gridColor: '#E2E8F0',
        axisColor: '#94A3B8',
        labelColor: '#64748B',
        titleColor: '#1E293B',
        equilibriumColor: '#CBD5E1',
        borderColor: '#E2E8F0',
    },
    dark: {
        backgroundColor: '#0F172A',
        gridColor: '#1E293B',
        axisColor: '#334155',
        labelColor: '#94A3B8',
        titleColor: '#F1F5F9',
        equilibriumColor: '#334155',
        borderColor: '#334155',
    }
};

/**
 * Real-time Displacement-Time Graph showing both tracer points
 */
export function DisplacementGraph({
    history1Ref,
    history2Ref,
    maxAmplitude = 80,
    timeWindow = 5,
    isPlaying,
    height = 180,
    theme = 'light',
}: DisplacementGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number>(0);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const { width, height: canvasHeight } = canvas;
        const colors = THEMES[theme];
        
        const paddingLeft = 60;
        const paddingRight = 20;
        const paddingTop = 25;
        const paddingBottom = 35;
        
        const plotWidth = width - paddingLeft - paddingRight;
        const plotHeight = canvasHeight - paddingTop - paddingBottom;
        const centerY = paddingTop + plotHeight / 2;
        
        // Clear
        ctx.fillStyle = colors.backgroundColor;
        ctx.fillRect(0, 0, width, canvasHeight);
        
        // Get both histories
        const histories = [history1Ref.current, history2Ref.current];
        
        // Calculate time range from the most recent data
        let timeEnd = 0;
        for (const history of histories) {
            if (history.length > 0) {
                const lastTime = history[history.length - 1].time;
                if (lastTime > timeEnd) timeEnd = lastTime;
            }
        }
        const timeStart = Math.max(0, timeEnd - timeWindow);
        
        // Grid
        ctx.strokeStyle = colors.gridColor;
        ctx.lineWidth = 1;
        
        const timeStep = timeWindow <= 2 ? 0.2 : (timeWindow <= 6 ? 0.5 : (timeWindow <= 10 ? 1 : 2));
        const epsilon = 0.001;
        
        for (let t = Math.ceil(timeStart / timeStep) * timeStep; t <= timeEnd + epsilon; t += timeStep) {
            const x = paddingLeft + ((t - timeStart) / timeWindow) * plotWidth;
            if (x >= paddingLeft && x <= paddingLeft + plotWidth) {
                ctx.beginPath();
                ctx.moveTo(x, paddingTop);
                ctx.lineTo(x, paddingTop + plotHeight);
                ctx.stroke();
            }
        }
        
        const ampStep = maxAmplitude <= 60 ? 20 : 40;
        for (let d = -maxAmplitude; d <= maxAmplitude; d += ampStep) {
            const y = centerY - (d / maxAmplitude) * (plotHeight / 2);
            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(paddingLeft + plotWidth, y);
            ctx.stroke();
        }
        
        // Equilibrium line
        ctx.strokeStyle = colors.equilibriumColor;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, centerY);
        ctx.lineTo(paddingLeft + plotWidth, centerY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Axes
        ctx.strokeStyle = colors.axisColor;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(paddingLeft, paddingTop);
        ctx.lineTo(paddingLeft, paddingTop + plotHeight);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(paddingLeft, paddingTop + plotHeight);
        ctx.lineTo(paddingLeft + plotWidth, paddingTop + plotHeight);
        ctx.stroke();
        
        // Axis labels
        ctx.font = '11px "Inter", monospace';
        ctx.fillStyle = colors.labelColor;
        
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let d = -maxAmplitude; d <= maxAmplitude; d += ampStep) {
            const y = centerY - (d / maxAmplitude) * (plotHeight / 2);
            const cmVal = d / 10;
            const label = d === 0 ? '0' : (d > 0 ? `+${cmVal.toFixed(0)}` : `${cmVal.toFixed(0)}`);
            ctx.fillText(label, paddingLeft - 8, y);
        }
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let t = Math.ceil(timeStart / timeStep) * timeStep; t <= timeEnd + epsilon; t += timeStep) {
            const x = paddingLeft + ((t - timeStart) / timeWindow) * plotWidth;
            if (x >= paddingLeft && x <= paddingLeft + plotWidth) {
                const label = Number.isInteger(timeStep) ? t.toFixed(0) : t.toFixed(1);
                ctx.fillText(`${label}s`, x, paddingTop + plotHeight + 6);
            }
        }
        
        // Axis titles
        ctx.fillStyle = colors.titleColor;
        ctx.font = 'bold 11px "Inter", sans-serif';
        
        ctx.save();
        ctx.translate(14, centerY);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Déplacement (cm)', 0, 0);
        ctx.restore();
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Temps (s)', paddingLeft + plotWidth / 2, canvasHeight - 3);
        
        // Title
        ctx.fillStyle = colors.titleColor;
        ctx.font = 'bold 12px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('📊 Déplacement vs Temps', paddingLeft, 6);
        
        // Legend
        for (let i = 0; i < 2; i++) {
            const legendX = width - 160 + i * 80;
            ctx.fillStyle = TRACER_COLORS[i].main;
            ctx.beginPath();
            ctx.arc(legendX, 14, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = colors.labelColor;
            ctx.font = '10px "Inter", sans-serif';
            ctx.fillText(TRACER_COLORS[i].name, legendX + 10, 17);
        }
        
        // Draw traces for both histories
        for (let h = 0; h < 2; h++) {
            const history = histories[h];
            const color = TRACER_COLORS[h];
            
            if (history.length > 1) {
                // Glow
                ctx.shadowColor = color.glow;
                ctx.shadowBlur = 6;
                ctx.strokeStyle = color.main;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                ctx.beginPath();
                
                let started = false;
                for (let i = 0; i < history.length; i++) {
                    const point = history[i];
                    if (point.time < timeStart) continue;
                    
                    const x = paddingLeft + ((point.time - timeStart) / timeWindow) * plotWidth;
                    const y = centerY - (point.displacement / maxAmplitude) * (plotHeight / 2);
                    const clampedY = Math.max(paddingTop, Math.min(paddingTop + plotHeight, y));
                    
                    if (!started) {
                        ctx.moveTo(x, clampedY);
                        started = true;
                    } else {
                        ctx.lineTo(x, clampedY);
                    }
                }
                
                ctx.stroke();
                ctx.shadowBlur = 0;
                
                // Current point marker
                if (history.length > 0) {
                    const lastPoint = history[history.length - 1];
                    if (lastPoint.time >= timeStart) {
                        const x = paddingLeft + ((lastPoint.time - timeStart) / timeWindow) * plotWidth;
                        const y = centerY - (lastPoint.displacement / maxAmplitude) * (plotHeight / 2);
                        const clampedY = Math.max(paddingTop, Math.min(paddingTop + plotHeight, y));
                        
                        ctx.shadowColor = color.main;
                        ctx.shadowBlur = 10;
                        ctx.fillStyle = color.main;
                        ctx.beginPath();
                        ctx.arc(x, clampedY, 5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        
                        ctx.fillStyle = color.light;
                        ctx.beginPath();
                        ctx.arc(x, clampedY, 2.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
        
        // No data message
        if (histories[0].length === 0 && histories[1].length === 0) {
            ctx.fillStyle = colors.labelColor;
            ctx.font = '14px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💡 Activez Traceurs pour voir le graphique', width / 2, canvasHeight / 2);
        }
        
        if (isPlaying) {
            animationRef.current = requestAnimationFrame(draw);
        }
    }, [history1Ref, history2Ref, maxAmplitude, timeWindow, isPlaying, theme]);

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                const { clientWidth } = containerRef.current;
                canvasRef.current.width = clientWidth;
                canvasRef.current.height = height;
                draw();
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [height, draw]);

    useEffect(() => {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = requestAnimationFrame(draw);
        
        return () => cancelAnimationFrame(animationRef.current);
    }, [draw]);

    const colors = THEMES[theme];

    return (
        <div 
            ref={containerRef} 
            style={{ 
                width: '100%', 
                height: `${height}px`,
                backgroundColor: colors.backgroundColor,
                borderTop: `1px solid ${colors.borderColor}`,
            }}
        >
            <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
    );
}

export default DisplacementGraph;
