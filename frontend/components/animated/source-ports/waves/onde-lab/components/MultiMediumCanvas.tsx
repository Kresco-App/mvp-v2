/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { MultiMediumWaveEngine, DualWaveParams, WaveMode, DualWaveMetrics, LongWavePoint } from '../physics/MultiMediumWaveEngine';

interface MultiMediumCanvasProps {
    isPlaying: boolean;
    amplitude: number;
    frequency: number;
    damping: number;
    tension1: number;
    tension2: number;
    waveMode: WaveMode;
    speedMode: 'normal' | 'slow';
    colorMode: 'off' | 'strain' | 'displacement';
    showWaveInfo: boolean;
    onMetricsUpdate?: (metrics: DualWaveMetrics) => void;
    theme?: 'light' | 'dark';
}

export interface MultiMediumCanvasRef {
    reset: () => void;
    triggerPulse: (amp: number) => void;
}

const MultiMediumCanvas = forwardRef<MultiMediumCanvasRef, MultiMediumCanvasProps>((props, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<MultiMediumWaveEngine>(new MultiMediumWaveEngine());
    const animationRef = useRef<number>(0);
    const propsRef = useRef(props);

    useEffect(() => { propsRef.current = props; }, [props]);

    // Dragging source only (applied to both)
    const isDraggingSourceRef = useRef(false);
    const mousePosRef = useRef(0);

    const reset = useCallback(() => {
        if (!canvasRef.current) return;
        const { width, height } = canvasRef.current;
        engineRef.current.reset(width, height);
    }, []);

    useImperativeHandle(ref, () => ({
        reset,
        triggerPulse: (amp) => engineRef.current.triggerPulse(amp)
    }));

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current || propsRef.current.waveMode !== 'manual') return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        // Check if clicking near the source (left side)
        const equilibriumX = engineRef.current.MARGIN_X;
        
        if (Math.abs(x - equilibriumX) < 60) {
            isDraggingSourceRef.current = true;
            mousePosRef.current = x;
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDraggingSourceRef.current && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const engine = engineRef.current;
            const equilibriumX = engine.MARGIN_X;
            let targetX = x;
            if (targetX < equilibriumX - 100) targetX = equilibriumX - 100;
            if (targetX > equilibriumX + 100) targetX = equilibriumX + 100;
            mousePosRef.current = targetX - equilibriumX;
        }
    };

    const handleMouseUp = () => {
        isDraggingSourceRef.current = false;
    };

    const drawWave = (ctx: CanvasRenderingContext2D, points: LongWavePoint[], yCenter: number, label: string, isDark: boolean) => {
        if (points.length === 0) return;

        const DISPLAY_POINTS = 100;
        const sampleInterval = (points.length - 1) / (DISPLAY_POINTS - 1);
        const lineHeight = 100; // Taller springs
        const currentProps = propsRef.current;

        // Label
        ctx.fillStyle = isDark ? '#94A3B8' : '#64748B';
        ctx.font = 'bold 12px "Inter", sans-serif';
        ctx.fillText(label, 20, yCenter - 60);

        // Compute strain/maxDisp for coloring
        let maxDisp = 50; 

        for (let i = 0; i < DISPLAY_POINTS; i++) {
            const idx = Math.round(i * sampleInterval);
            const p = points[idx];
            
            let strain = 0;
            if (idx < points.length - 1) {
                const pNext = points[idx + 1];
                const segmentWidth = pNext.actualX - p.actualX;
                const dxRest = pNext.baseX - p.baseX;
                strain = 1 - (segmentWidth / dxRest);
            }

            let color = '#64748b';
            
            if (currentProps.colorMode === 'strain') {
                if (strain > 0.01) {
                    const intensity = Math.min(1, strain * 4);
                    color = `rgb(${100 + 145*intensity}, ${116 + 42*intensity}, ${139 - 128*intensity})`;
                } else if (strain < -0.01) {
                    const intensity = Math.min(1, -strain * 4);
                    color = `rgb(${100 - 94*intensity}, ${116 + 66*intensity}, ${139 + 73*intensity})`;
                }
            } else if (currentProps.colorMode === 'displacement') {
                const intensity = Math.min(1, Math.abs(p.disp) / maxDisp);
                color = `rgb(${100 + 68*intensity}, ${116 - 31*intensity}, ${139 + 108*intensity})`;
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.actualX, yCenter - lineHeight / 2);
            ctx.lineTo(p.actualX, yCenter + lineHeight / 2);
            ctx.stroke();
        }
        
        // Draw Source Plate
        const firstP = points[0];
        ctx.fillStyle = isDraggingSourceRef.current ? '#FBAE17' : '#707FFF';
        ctx.fillRect(firstP.actualX - 8, yCenter - 50, 12, 100);
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height } = canvas;
        const engine = engineRef.current;
        const currentProps = propsRef.current;
        const isDark = currentProps.theme === 'dark';

        // Theme colors
        const colors = isDark ? {
            bg1: '#0F172A',
            bg2: '#1E293B',
            divider: '#334155',
            text: '#94A3B8',
            accent: '#707FFF',
            infoBox: 'rgba(15, 23, 42, 0.95)',
            infoBorder: '#334155',
        } : {
            bg1: '#F8FAFC',
            bg2: '#EFF6FF',
            divider: '#CBD5E1',
            text: '#64748B',
            accent: '#707FFF',
            infoBox: 'rgba(255, 255, 255, 0.95)',
            infoBorder: '#E2E8F0',
        };

        // Background - Split for Top and Bottom Mediums
        ctx.fillStyle = colors.bg1;
        ctx.fillRect(0, 0, width, height / 2);
        
        ctx.fillStyle = colors.bg2;
        ctx.fillRect(0, height / 2, width, height / 2);
        
        // Draw Divider
        ctx.strokeStyle = colors.divider;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw Top Wave (Medium 1)
        const topPoints = engine.getFilteredPoints('top', 0.5);
        drawWave(ctx, topPoints, height * 0.25, 'MILIEU 1 (Haut)', isDark);

        // Draw Bottom Wave (Medium 2)
        const bottomPoints = engine.getFilteredPoints('bottom', 0.5);
        drawWave(ctx, bottomPoints, height * 0.75, 'MILIEU 2 (Bas)', isDark);

        // Info Box
        if (currentProps.showWaveInfo) {
             const m = engine.metrics;
             ctx.fillStyle = colors.infoBox;
             ctx.fillRect(width - 240, 10, 230, 130);
             ctx.strokeStyle = colors.infoBorder;
             ctx.lineWidth = 1;
             ctx.strokeRect(width - 240, 10, 230, 130);
             
             ctx.fillStyle = colors.accent;
             ctx.font = 'bold 12px "Inter", sans-serif';
             ctx.fillText('COMPARAISON MILIEUX', width - 230, 30);
             
             // Medium 1 Info
             ctx.fillStyle = colors.text;
             ctx.font = '11px "Inter", monospace';
             ctx.fillText('Milieu 1:', width - 230, 50);
             ctx.fillStyle = colors.accent;
             ctx.fillText(`v=${m.waveSpeed1.toFixed(0)}cm/s λ=${m.wavelength1.toFixed(1)}cm`, width - 170, 50);

             // Medium 2 Info
             ctx.fillStyle = colors.text;
             ctx.fillText('Milieu 2:', width - 230, 70);
             ctx.fillStyle = colors.accent;
             ctx.fillText(`v=${m.waveSpeed2.toFixed(0)}cm/s λ=${m.wavelength2.toFixed(1)}cm`, width - 170, 70);
             
             ctx.fillStyle = colors.text;
             ctx.fillText(`Ratio v2/v1: ${(m.waveSpeed2/Math.max(1, m.waveSpeed1)).toFixed(2)}`, width - 230, 100);
             ctx.fillText(`Freq: ${m.frequency.toFixed(1)} Hz`, width - 230, 118);
        }
    }, []);

    const loopRef = useRef<(() => void) | null>(null);
    const drawRef = useRef(draw);
    drawRef.current = draw;
    
    loopRef.current = () => {
        const currentProps = propsRef.current;
        if (currentProps.isPlaying) {
            const params: DualWaveParams = { 
                ...currentProps, 
            };
            engineRef.current.update(params, isDraggingSourceRef.current ? mousePosRef.current : undefined);
            
            if (currentProps.onMetricsUpdate) currentProps.onMetricsUpdate(engineRef.current.metrics);
        }
        drawRef.current();
        animationRef.current = requestAnimationFrame(() => loopRef.current?.());
    };

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
                engineRef.current.reset(canvasRef.current.width, canvasRef.current.height);
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

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <canvas 
                ref={canvasRef} 
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isDraggingSourceRef.current ? 'ew-resize' : 'default', display: 'block' }}
            />
        </div>
    );
});

export default MultiMediumCanvas;
