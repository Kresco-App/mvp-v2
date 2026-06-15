/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { CircularWaveEngine, CircularWaveParams } from '../physics/CircularWaveEngine';

interface CircularCanvasProps extends CircularWaveParams {
    isPlaying: boolean;
    resolution: number; // Visible grid size
    zoom: number; // Zoom level (0.5 - 3.0)
    theme?: 'light' | 'dark';
    simSpeed?: number; // Simulation speed multiplier (0.25 - 4)
}

export interface CircularCanvasRef {
    reset: () => void;
}

const CircularCanvas = forwardRef<CircularCanvasRef, CircularCanvasProps>((props, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Physics Engine
    // Direct resolution mapping (1 slider unit = 1 physics grid unit)
    const engineRef = useRef<CircularWaveEngine>(new CircularWaveEngine(props.resolution, props.resolution));
    const animationRef = useRef<number>(0);
    const propsRef = useRef(props);
    
    // View State
    const viewRef = useRef({ rotation: Math.PI / 4, tilt: 0.6 });
    const dragRef = useRef({ active: false, startX: 0, startY: 0, startRot: 0, startTilt: 0, hasMoved: false });

    useEffect(() => { 
        propsRef.current = props; 
        if (engineRef.current.visibleWidth !== props.resolution) {
            engineRef.current.resize(props.resolution, props.resolution);
        }
    }, [props]);

    useImperativeHandle(ref, () => ({
        reset: () => {
            const size = propsRef.current.resolution;
            engineRef.current.resize(size, size);
            viewRef.current = { rotation: Math.PI / 4, tilt: 0.6 };
        }
    }));

    const handleMouseDown = (e: React.MouseEvent) => {
        dragRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            startRot: viewRef.current.rotation,
            startTilt: viewRef.current.tilt,
            hasMoved: false
        };
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current.active) return;
        
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            dragRef.current.hasMoved = true;
        }
        
        viewRef.current.rotation = dragRef.current.startRot + dx * 0.01;
        viewRef.current.tilt = Math.max(0.1, Math.min(Math.PI / 2, dragRef.current.startTilt + dy * 0.01));
    };
    
    const handleMouseUp = (e: React.MouseEvent) => {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        
        if (!dragRef.current.hasMoved && canvasRef.current && props.waveMode === 'manual') {
            triggerWaveAt(e.clientX, e.clientY);
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        dragRef.current = {
            active: true,
            startX: touch.clientX,
            startY: touch.clientY,
            startRot: viewRef.current.rotation,
            startTilt: viewRef.current.tilt,
            hasMoved: false
        };
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!dragRef.current.active) return;
        const touch = e.touches[0];
        const dx = touch.clientX - dragRef.current.startX;
        const dy = touch.clientY - dragRef.current.startY;
        
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            dragRef.current.hasMoved = true;
        }
        
        viewRef.current.rotation = dragRef.current.startRot + dx * 0.01;
        viewRef.current.tilt = Math.max(0.1, Math.min(Math.PI / 2, dragRef.current.startTilt + dy * 0.01));
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        
        if (!dragRef.current.hasMoved && canvasRef.current && props.waveMode === 'manual') {
            // Use the last known position or changedTouches if available
            // For a tap, we might need the start position since touchEnd has no touches list usually
            triggerWaveAt(dragRef.current.startX, dragRef.current.startY);
        }
    };

    const triggerWaveAt = (clientX: number, clientY: number) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const dx = (clientX - rect.left - centerX) / 4; 
        const dy = (clientY - rect.top - centerY) / 2; 
        
        const rot = -viewRef.current.rotation;
        const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
        const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
        
        const relX = 0.5 + rx / props.resolution;
        const relY = 0.5 + ry / props.resolution;
        
        if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
            engineRef.current.disturb(relX, relY, props.amplitude * 3);
        }
    };

    const project = (x: number, y: number, z: number, width: number, height: number): [number, number] => {
        const { rotation, tilt } = viewRef.current;
        const res = propsRef.current.resolution;
        
        // Scale factor: fit the grid within the smaller dimension of the canvas
        // Zoom level controlled by props (default 1.5 for closer view)
        const gridSize = Math.min(width, height) * propsRef.current.zoom;
        const cellSize = gridSize / res;
        
        // Center the grid coordinates
        const centeredX = (x - res / 2) * cellSize;
        const centeredY = (y - res / 2) * cellSize;
        
        // Apply rotation
        const rotX = centeredX * Math.cos(rotation) - centeredY * Math.sin(rotation);
        const rotY = centeredX * Math.sin(rotation) + centeredY * Math.cos(rotation);
        
        // Project to screen with tilt and height offset
        // z-scale multiplier makes wave height visible (higher = taller waves)
        const screenX = width / 2 + rotX;
        const screenY = height / 2 + rotY * Math.sin(tilt) - z * 6;
        
        return [screenX, screenY];
    };

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const engine = engineRef.current;
        const currentProps = propsRef.current;
        const isDark = currentProps.theme === 'dark';
        
        ctx.fillStyle = isDark ? '#0f172a' : '#F8FAFC';
        ctx.fillRect(0, 0, width, height);
        
        const res = engine.visibleWidth;
        const pad = engine.PADDING;
        const totalW = engine.totalWidth;
        
        // Dynamic LOD: Skip lines for very high resolutions to keep FPS high
        const step = Math.max(1, Math.floor(res / 60));
        
        ctx.lineWidth = 1;
        
        // Horizontal
        for (let y = 0; y < res; y += step) {
            ctx.beginPath();
            let first = true;
            const depth = y / res;
            const alpha = 0.3 + 0.7 * depth;
            ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`; 
            
            for (let x = 0; x < res; x += step) {
                const physIdx = (y + pad) * totalW + (x + pad);
                const z = engine.u[physIdx];
                const [sx, sy] = project(x, y, z, width, height);
                if (first) { ctx.moveTo(sx, sy); first = false; }
                else { ctx.lineTo(sx, sy); }
            }
            ctx.stroke();
        }
        
        // Vertical
        for (let x = 0; x < res; x += step) {
            ctx.beginPath();
            let first = true;
            ctx.strokeStyle = `rgba(6, 182, 212, 0.4)`; 
            
            for (let y = 0; y < res; y += step) {
                const physIdx = (y + pad) * totalW + (x + pad);
                const z = engine.u[physIdx];
                const [sx, sy] = project(x, y, z, width, height);
                if (first) { ctx.moveTo(sx, sy); first = false; }
                else { ctx.lineTo(sx, sy); }
            }
            ctx.stroke();
        }
        
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(30, 41, 59, 0.6)';
        ctx.font = '12px "Roboto Mono", monospace';
        ctx.fillText('Glissez pour tourner / incliner', 20, 30);
        if (currentProps.waveMode === 'manual') {
             ctx.fillText('Clic pour créer une vague', 20, 45);
        }
    };

    // Use refs to avoid stale closure issues in animation loop
    const loopRef = useRef<(() => void) | null>(null);
    const drawRef = useRef(draw);
    const frameCounterRef = useRef(0);
    drawRef.current = draw;

    loopRef.current = () => {
        const currentProps = propsRef.current;
        if (currentProps.isPlaying) {
            const speed = currentProps.simSpeed || 1;
            
            if (speed >= 1) {
                // Speed up: run multiple updates per frame
                const steps = Math.round(speed);
                for (let i = 0; i < steps; i++) {
                    engineRef.current.update(currentProps);
                }
            } else {
                // Slow down: skip frames (e.g., 0.25x = update every 4th frame)
                frameCounterRef.current++;
                const skipFrames = Math.round(1 / speed);
                if (frameCounterRef.current >= skipFrames) {
                    engineRef.current.update(currentProps);
                    frameCounterRef.current = 0;
                }
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
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        
        // Start the animation loop
        animationRef.current = requestAnimationFrame(() => loopRef.current?.());
        
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationRef.current);
        };
    }, []);

    return (
        <div ref={containerRef} className={`w-full h-full cursor-move overflow-hidden ${props.theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'}`}>
            <canvas 
                ref={canvasRef} 
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="touch-none"
            />
        </div>
    );
});

export default CircularCanvas;
