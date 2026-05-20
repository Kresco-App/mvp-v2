/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

/**
 * Wave Physics Engine v7.0
 * 
 * Dead simple infinite boundary approach:
 * - NO extra points, NO complex math
 * - Just copy the wave out and dampen it aggressively at the boundary
 * - The key insight: reflections happen when the boundary "pushes back"
 * - If we just let the last point follow the wave with no resistance, no reflection
 * 
 * Real measurements: 100 pixels = 10 cm (1 px = 0.1 cm = 1 mm)
 */

export interface WavePoint {
    x: number;
    y: number;
    prevY: number;
    velocity: number;
}

export type EndCondition = 'fixed' | 'loose' | 'none';
export type WaveMode = 'manual' | 'oscillate';

export interface WaveParameters {
    tension: number;
    damping: number;
    amplitude: number;
    frequency: number;
    endCondition: EndCondition;
    waveMode: WaveMode;
    speedMode: 'slow' | 'normal';  // Changed from isSlowMotion
    linearMass?: number; // Linear mass density (μ) - default 1.0
}

export interface WaveMetrics {
    waveSpeed: number;
    wavelength: number;
    period: number;
    maxAmplitude: number;
    energy: number;
}

export interface TracerData {
    time: number;
    displacement: number;
    velocity: number;
    index: number;
    x: number;
}

export class WaveEngine {
    points: WavePoint[] = [];
    time: number = 0;
    
    // Visible points for rendering
    public readonly NUM_VISIBLE_POINTS = 150;
    // Hidden extension points for absorbing boundary
    public readonly NUM_HIDDEN_POINTS = 200;
    // Total points including hidden
    public readonly NUM_POINTS = 350; // 150 + 200
    public readonly MARGIN_X = 60;
    
    // Scale: 100 pixels = 10 cm (so 1 px = 1 mm)
    public readonly PIXELS_PER_CM = 10;
    
    private pulse = { active: false, startTime: 0, amplitude: 0 };
    private _metrics: WaveMetrics = { waveSpeed: 0, wavelength: 0, period: 0, maxAmplitude: 0, energy: 0 };
    
    // Two tracer points
    public tracerIndices: [number, number] = [30, 80];
    
    private simulationTime: number = 0;
    private prevTension: number = 2.5;
    private dx: number = 1;
    private baseHeight: number = 300;
    
    // String length in cm (calculated on init)
    private stringLengthCm: number = 0;

    get metrics(): WaveMetrics {
        return { ...this._metrics };
    }
    
    get simTime(): number {
        return this.simulationTime;
    }
    
    get stringLength(): number {
        return this.stringLengthCm;
    }
    
    // Convert pixels to cm
    pxToCm(px: number): number {
        return px / this.PIXELS_PER_CM;
    }
    
    // Convert cm to pixels
    cmToPx(cm: number): number {
        return cm * this.PIXELS_PER_CM;
    }

    init(width: number, height: number): void {
        this.points = [];
        
        if (width <= 0 || height <= 0) return;
        
        const usableWidth = width - this.MARGIN_X * 2;
        // dx based on visible points only
        this.dx = usableWidth / (this.NUM_VISIBLE_POINTS - 1);
        this.baseHeight = height / 2;
        
        // Calculate string length in cm
        this.stringLengthCm = usableWidth / this.PIXELS_PER_CM;

        // Create all points (visible + hidden extension)
        for (let i = 0; i < this.NUM_POINTS; i++) {
            this.points.push({
                x: this.MARGIN_X + i * this.dx,
                y: this.baseHeight,
                prevY: this.baseHeight,
                velocity: 0
            });
        }
        
        this.time = 0;
        this.simulationTime = 0;
        this.pulse = { active: false, startTime: 0, amplitude: 0 };
    }

    reset(width: number, height: number): void {
        this.init(width, height);
    }

    triggerPulse(amplitude: number): void {
        this.pulse = {
            active: true,
            startTime: this.time,
            amplitude: -amplitude
        };
    }
    
    setTracerIndex(tracerNum: 0 | 1, pointIndex: number): void {
        // Allow tracers only on visible points
        if (pointIndex >= 0 && pointIndex < this.NUM_VISIBLE_POINTS) {
            this.tracerIndices[tracerNum] = pointIndex;
        }
    }
    
    getPointIndexAtX(x: number): number {
        if (this.points.length === 0) return 0;
        
        let closestIndex = 0;
        let closestDist = Infinity;
        
        for (let i = 0; i < this.points.length; i++) {
            const dist = Math.abs(this.points[i].x - x);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }
        
        return closestIndex;
    }

    update(params: WaveParameters, baseHeight: number, manualY?: number): boolean {
        const n = this.points.length;
        if (n === 0) return true;

        this.baseHeight = baseHeight;
        
        const { tension, damping, endCondition, waveMode, amplitude, frequency, speedMode, linearMass = 1.0 } = params;
        
        // Speed control: 
        // - 'normal' = 4 iterations (what was slow-mo before)
        // - 'slow' = 1 iteration (even slower for detailed observation)
        const iterations = speedMode === 'slow' ? 1 : 4;
        
        const smoothTension = this.prevTension + (tension - this.prevTension) * 0.1;
        this.prevTension = smoothTension;
        
        // Wave speed: v = sqrt(T/μ), so c² = T/μ * factor
        // Higher mass = slower waves, lower mass = faster waves
        const rawC2 = (smoothTension / linearMass) * 0.02;
        const maxC2 = 0.20;
        const c2 = Math.min(rawC2, maxC2);
        
        const dampPerIteration = Math.pow(1.0 - damping * 0.3, 1.0 / iterations);

        for (let iter = 0; iter < iterations; iter++) {
            this.time += 1;
            this.simulationTime += 1.0 / (60 * iterations);

            const newY = new Float64Array(n);
            
            for (let i = 0; i < n; i++) {
                newY[i] = this.points[i].y;
            }

            // Update interior points (1 to n-2)
            for (let i = 1; i < n - 1; i++) {
                const p = this.points[i];
                const yLeft = this.points[i - 1].y;
                const yRight = this.points[i + 1].y;
                const yCurrent = p.y;
                const yPrev = p.prevY;
                
                const laplacian = yLeft + yRight - 2 * yCurrent;
                const acceleration = c2 * laplacian;
                
                let yNew = 2 * yCurrent - yPrev + acceleration;
                
                const velocity = yNew - yCurrent;
                yNew = yCurrent + velocity * dampPerIteration;
                
                newY[i] = yNew;
            }

            // Left boundary (wave source)
            newY[0] = this.computeSourcePosition(
                waveMode, amplitude, frequency, baseHeight, manualY
            );

            // Right boundary
            const last = n - 1;
            
            if (endCondition === 'fixed') {
                // Fixed at the last visible point
                newY[this.NUM_VISIBLE_POINTS - 1] = baseHeight;
                // Hidden points also fixed
                for (let i = this.NUM_VISIBLE_POINTS; i < n; i++) {
                    newY[i] = baseHeight;
                }
                
            } else if (endCondition === 'loose') {
                // Last visible point copies its neighbor
                newY[this.NUM_VISIBLE_POINTS - 1] = newY[this.NUM_VISIBLE_POINTS - 2];
                // Hidden points follow along
                for (let i = this.NUM_VISIBLE_POINTS; i < n; i++) {
                    newY[i] = newY[i - 1];
                }
                
            } else {
                // Infinite (absorbing) - wave propagates into hidden extension
                // Use First-order Mur Absorbing Boundary Condition at the very end
                // Formula: U_N^new = U_{N-1}^old + coeff * (U_{N-1}^new - U_N^old)
                
                const c = Math.sqrt(c2); // Courant number
                const coeff = (c - 1) / (c + 1);
                
                newY[last] = this.points[last - 1].y + 
                            coeff * (newY[last - 1] - this.points[last].y);
            }

            // Apply updates
            for (let i = 0; i < n; i++) {
                const p = this.points[i];
                p.velocity = newY[i] - p.y;
                p.prevY = p.y;
                p.y = newY[i];
                
                if (!isFinite(p.y) || Math.abs(p.y - baseHeight) > 500) {
                    return false;
                }
            }
        }

        this.updateMetrics(params, baseHeight);
        return true;
    }

    private computeSourcePosition(
        waveMode: WaveMode,
        amplitude: number,
        frequency: number,
        baseHeight: number,
        manualY?: number
    ): number {
        const current = this.points[0].y;
        
        if (waveMode === 'oscillate') {
            const omega = 2 * Math.PI * frequency * 0.004;
            return baseHeight + Math.sin(omega * this.time) * amplitude;
            
        } else if (manualY !== undefined && waveMode === 'manual') {
            const diff = manualY - current;
            return current + diff * 0.2;
            
        } else if (this.pulse.active) {
            const duration = 200;
            const elapsed = this.time - this.pulse.startTime;
            
            if (elapsed >= 0 && elapsed < duration) {
                const t = elapsed / duration;
                const shape = Math.sin(Math.PI * t);
                return baseHeight + shape * this.pulse.amplitude;
            } else if (elapsed >= duration) {
                this.pulse.active = false;
                return baseHeight;
            }
        }
        
        return current + (baseHeight - current) * 0.1;
    }

    private updateMetrics(params: WaveParameters, baseHeight: number): void {
        const linearMass = params.linearMass || 1.0;
        const c = Math.sqrt(Math.min((params.tension / linearMass) * 0.02, 0.20));
        
        // Speed in cm/s (convert from px/frame to cm/s)
        const speedPxPerFrame = c * this.dx;
        const speedPxPerSec = speedPxPerFrame * 60 * 4; // 60 fps, 4 iterations
        this._metrics.waveSpeed = speedPxPerSec / this.PIXELS_PER_CM; // Convert to cm/s
        
        this._metrics.period = params.frequency > 0 ? 1 / params.frequency : 0;
        // Wavelength in cm
        this._metrics.wavelength = this._metrics.waveSpeed * this._metrics.period;
        
        let maxAmp = 0;
        let totalEnergy = 0;
        
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const displacement = Math.abs(p.y - baseHeight);
            if (displacement > maxAmp) maxAmp = displacement;
            
            const ke = 0.5 * p.velocity * p.velocity * 3600;
            const pe = 0.5 * displacement * displacement * 0.01;
            totalEnergy += ke + pe;
        }
        
        // Max amplitude in cm
        this._metrics.maxAmplitude = maxAmp / this.PIXELS_PER_CM;
        this._metrics.energy = totalEnergy / this.points.length;
    }

    /**
     * Get visible points for rendering (excludes hidden extension)
     */
    getVisiblePoints(): WavePoint[] {
        return this.points.slice(0, this.NUM_VISIBLE_POINTS);
    }

    getTracerPoint(tracerNum: 0 | 1 = 0): { x: number; y: number; velocity: number; index: number } | null {
        const index = this.tracerIndices[tracerNum];
        if (index >= 0 && index < this.NUM_VISIBLE_POINTS) {
            const p = this.points[index];
            return { x: p.x, y: p.y, velocity: p.velocity, index };
        }
        return null;
    }
    
    getTracerData(tracerNum: 0 | 1 = 0): TracerData | null {
        const index = this.tracerIndices[tracerNum];
        if (index >= 0 && index < this.NUM_VISIBLE_POINTS) {
            const p = this.points[index];
            return {
                time: this.simulationTime,
                displacement: this.baseHeight - p.y,
                velocity: -p.velocity * 60,
                index,
                x: p.x
            };
        }
        return null;
    }
    
    // Legacy
    get tracerIndex(): number {
        return this.tracerIndices[0];
    }
    
    set tracerIndex(val: number) {
        this.tracerIndices[0] = val;
    }

    /**
     * Get filtered points for display - applies noise reduction
     */
    getFilteredPoints(amplitudeThreshold: number = 0.5, smoothingPasses: number = 2): WavePoint[] {
        const n = this.NUM_VISIBLE_POINTS;
        if (this.points.length === 0) return [];

        // Copy y-values to work array (visible only)
        let yValues = this.points.slice(0, n).map(p => p.y);

        // Apply simple moving average smoothing (low-pass filter)
        for (let pass = 0; pass < smoothingPasses; pass++) {
            const smoothed = new Array(n);
            for (let i = 0; i < n; i++) {
                if (i === 0) {
                    smoothed[i] = (yValues[0] * 2 + yValues[1]) / 3;
                } else if (i === n - 1) {
                    smoothed[i] = (yValues[n - 2] + yValues[n - 1] * 2) / 3;
                } else {
                    // 3-point weighted average: [0.25, 0.5, 0.25]
                    smoothed[i] = yValues[i - 1] * 0.25 + yValues[i] * 0.5 + yValues[i + 1] * 0.25;
                }
            }
            yValues = smoothed;
        }

        // Apply amplitude threshold (relative to baseHeight)
        const base = this.baseHeight;
        for (let i = 0; i < n; i++) {
            const disp = yValues[i] - base;
            if (Math.abs(disp) < amplitudeThreshold) {
                yValues[i] = base;
            }
        }

        // Create filtered points (visible only)
        return this.points.slice(0, n).map((p, i) => ({
            x: p.x,
            y: yValues[i],
            prevY: p.prevY,
            velocity: p.velocity
        }));
    }
}
