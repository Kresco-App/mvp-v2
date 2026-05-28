/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

/**
 * Longitudinal Wave Physics Engine
 * 
 * Simulates a spring/slinky where particles move parallel to wave propagation.
 * - Solves for displacement 'u' where x_final = x_equilibrium + u
 * - Uses the same FD scheme as transverse waves
 */

export interface LongWavePoint {
    baseX: number;     // Equilibrium position (constant)
    disp: number;      // Displacement from equilibrium (variable u)
    prevDisp: number;  // Previous displacement (u_prev)
    velocity: number;  // du/dt
    
    // Computed for convenience
    actualX: number;   // baseX + disp
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
    speedMode: 'slow' | 'normal';
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

export class LongitudinalWaveEngine {
    points: LongWavePoint[] = [];
    time: number = 0;
    
    // Visible points for rendering
    public readonly NUM_VISIBLE_POINTS = 200;
    // Hidden extension points for absorbing boundary
    public readonly NUM_HIDDEN_POINTS = 200;
    // Total points including hidden
    public readonly NUM_POINTS = 400; // 200 + 200
    public readonly MARGIN_X = 60;
    
    // Scale: 100 pixels = 10 cm
    public readonly PIXELS_PER_CM = 10;
    
    private pulse = { active: false, startTime: 0, amplitude: 0 };
    private _metrics: WaveMetrics = { waveSpeed: 0, wavelength: 0, period: 0, maxAmplitude: 0, energy: 0 };
    
    public tracerIndices: [number, number] = [20, 60];
    
    private simulationTime: number = 0;
    private prevTension: number = 2.5;
    private prevFrequency: number = 1.0;
    private phaseAccumulator: number = 0; // Accumulated phase for smooth frequency changes
    private dx: number = 1; // Spacing between equilibrium points
    
    private stringLengthCm: number = 0;

    get metrics(): WaveMetrics {
        return { ...this._metrics };
    }
    
    get simTime(): number {
        return this.simulationTime;
    }

    init(width: number, height: number): void {
        this.points = [];
        
        if (width <= 0) return;
        
        const usableWidth = width - this.MARGIN_X * 2;
        // dx based on visible points only
        this.dx = usableWidth / (this.NUM_VISIBLE_POINTS - 1);
        
        this.stringLengthCm = usableWidth / this.PIXELS_PER_CM;

        // Create all points (visible + hidden extension)
        for (let i = 0; i < this.NUM_POINTS; i++) {
            const bx = this.MARGIN_X + i * this.dx;
            this.points.push({
                baseX: bx,
                disp: 0,
                prevDisp: 0,
                velocity: 0,
                actualX: bx
            });
        }
        
        this.time = 0;
        this.simulationTime = 0;
        this.phaseAccumulator = 0;
        this.prevFrequency = 1.0;
        this.pulse = { active: false, startTime: 0, amplitude: 0 };
    }

    reset(width: number, height: number): void {
        this.init(width, height);
    }

    triggerPulse(amplitude: number): void {
        // For longitudinal, amplitude is a shift in X. 
        // A positive pulse pushes right.
        this.pulse = {
            active: true,
            startTime: this.time,
            amplitude: amplitude
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
        
        // Find closest point based on actualX
        let closestIndex = 0;
        let closestDist = Infinity;
        
        for (let i = 0; i < this.points.length; i++) {
            const dist = Math.abs(this.points[i].actualX - x);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }
        return closestIndex;
    }

    update(params: WaveParameters, manualDisp?: number): boolean {
        const n = this.points.length;
        if (n === 0) return true;

        const { tension, damping, endCondition, waveMode, amplitude, frequency, speedMode } = params;
        
        const iterations = speedMode === 'slow' ? 2 : 6;
        
        const smoothTension = this.prevTension + (tension - this.prevTension) * 0.1;
        this.prevTension = smoothTension;
        
        const rawC2 = smoothTension * 0.015;
        const maxC2 = 0.35;
        const c2 = Math.min(rawC2, maxC2);
        
        const dampPerIteration = Math.pow(1.0 - damping * 0.3, 1.0 / iterations);

        for (let iter = 0; iter < iterations; iter++) {
            this.time += 1;
            this.simulationTime += 1.0 / (60 * iterations);

            const newDisp = new Float64Array(n);
            
            for (let i = 0; i < n; i++) {
                newDisp[i] = this.points[i].disp;
            }

            // Interior points
            for (let i = 1; i < n - 1; i++) {
                const uCurrent = this.points[i].disp;
                const uLeft = this.points[i - 1].disp;
                const uRight = this.points[i + 1].disp;
                const uPrev = this.points[i].prevDisp;
                
                const laplacian = uLeft + uRight - 2 * uCurrent;
                const acceleration = c2 * laplacian;
                
                let uNew = 2 * uCurrent - uPrev + acceleration;
                
                const velocity = uNew - uCurrent;
                uNew = uCurrent + velocity * dampPerIteration;
                
                newDisp[i] = uNew;
            }

            // Left boundary (Source)
            newDisp[0] = this.computeSourceDisp(
                waveMode, amplitude, frequency, manualDisp
            );

            // Right boundary
            const last = n - 1;
            if (endCondition === 'fixed') {
                // Fixed at the last visible point
                newDisp[this.NUM_VISIBLE_POINTS - 1] = 0;
                // Hidden points also fixed
                for (let i = this.NUM_VISIBLE_POINTS; i < n; i++) {
                    newDisp[i] = 0;
                }
            } else if (endCondition === 'loose') {
                // Last visible point copies its neighbor
                newDisp[this.NUM_VISIBLE_POINTS - 1] = newDisp[this.NUM_VISIBLE_POINTS - 2];
                // Hidden points follow along
                for (let i = this.NUM_VISIBLE_POINTS; i < n; i++) {
                    newDisp[i] = newDisp[i - 1];
                }
            } else {
                // Infinite (absorbing) - wave propagates into hidden extension
                // Use First-order Mur Absorbing Boundary Condition at the very end
                // Formula: U_N^new = U_{N-1}^old + coeff * (U_{N-1}^new - U_N^old)
                // coeff = (c*dt/dx - 1) / (c*dt/dx + 1)
                
                const c = Math.sqrt(c2); // Courant number (c * dt / dx)
                const coeff = (c - 1) / (c + 1);
                
                newDisp[last] = this.points[last - 1].disp + 
                               coeff * (newDisp[last - 1] - this.points[last].disp);
            }

            // Apply updates
            for (let i = 0; i < n; i++) {
                const p = this.points[i];
                p.velocity = newDisp[i] - p.disp;
                p.prevDisp = p.disp;
                p.disp = newDisp[i];
                p.actualX = p.baseX + p.disp; // Update actual position
                
                // Stability check
                if (!isFinite(p.disp) || Math.abs(p.disp) > 1000) {
                    return false;
                }
            }
        }

        this.updateMetrics(params);
        return true;
    }

    private computeSourceDisp(
        waveMode: WaveMode,
        amplitude: number,
        frequency: number,
        manualDisp?: number
    ): number {
        const current = this.points[0].disp;
        
        if (waveMode === 'oscillate') {
            // Smooth frequency changes to avoid phase discontinuities
            const smoothFreq = this.prevFrequency + (frequency - this.prevFrequency) * 0.05;
            this.prevFrequency = smoothFreq;
            
            // Use phase accumulator instead of omega * time
            // This ensures smooth transitions when frequency changes
            const deltaPhase = 2 * Math.PI * smoothFreq * 0.004;
            this.phaseAccumulator += deltaPhase;
            
            return Math.sin(this.phaseAccumulator) * amplitude;
            
        } else if (manualDisp !== undefined && waveMode === 'manual') {
            // Smoothly move towards manual target
            const diff = manualDisp - current;
            return current + diff * 0.5;
            
        } else if (this.pulse.active) {
            const duration = 300; // Longer duration for smoother pulse
            const elapsed = this.time - this.pulse.startTime;
            
            if (elapsed >= 0 && elapsed < duration) {
                const t = elapsed / duration;
                // Smooth Gaussian-like pulse shape
                const shape = Math.sin(Math.PI * t) * Math.sin(Math.PI * t * 0.5);
                return shape * this.pulse.amplitude;
            } else if (elapsed >= duration) {
                this.pulse.active = false;
                return 0;
            }
        }
        
        // Return to 0 if nothing active
        return current * 0.9;
    }

    private updateMetrics(params: WaveParameters): void {
        const c = Math.sqrt(Math.min(params.tension * 0.015, 0.35));
        
        const speedPxPerFrame = c * this.dx;
        const speedPxPerSec = speedPxPerFrame * 60 * 6; // Updated for 6 iterations
        this._metrics.waveSpeed = speedPxPerSec / this.PIXELS_PER_CM;
        
        this._metrics.period = params.frequency > 0 ? 1 / params.frequency : 0;
        this._metrics.wavelength = this._metrics.waveSpeed * this._metrics.period;
        
        let maxDisp = 0;
        let totalEnergy = 0;
        
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const d = Math.abs(p.disp);
            if (d > maxDisp) maxDisp = d;
            
            const ke = 0.5 * p.velocity * p.velocity * 3600;
            const pe = 0.5 * d * d * 0.01;
            totalEnergy += ke + pe;
        }
        
        this._metrics.maxAmplitude = maxDisp / this.PIXELS_PER_CM;
        this._metrics.energy = totalEnergy / this.points.length;
    }

    getPoints(): LongWavePoint[] {
        // Return only visible points (not the hidden extension)
        return this.points.slice(0, this.NUM_VISIBLE_POINTS);
    }

    getTracerPoint(tracerNum: 0 | 1 = 0): { x: number; y: number; velocity: number; index: number } | null {
        const index = this.tracerIndices[tracerNum];
        if (index >= 0 && index < this.NUM_VISIBLE_POINTS) {
            const p = this.points[index];
            return { x: p.actualX, y: 0, velocity: p.velocity, index }; // Y is relative
        }
        return null;
    }
    
    getTracerData(tracerNum: 0 | 1 = 0): TracerData | null {
        const index = this.tracerIndices[tracerNum];
        if (index >= 0 && index < this.NUM_VISIBLE_POINTS) {
            const p = this.points[index];
            return {
                time: this.simulationTime,
                displacement: p.disp, // Longitudinal displacement
                velocity: p.velocity * 60,
                index,
                x: p.actualX
            };
        }
        return null;
    }

    /**
     * Get filtered points for display - applies noise reduction
     * 1. Low-pass filter (smoothing) to remove high-frequency jitter
     * 2. Amplitude threshold to zero out tiny displacements
     * 
     * @param amplitudeThreshold - Displacements below this are zeroed (default 0.5 pixels)
     * @param smoothingPasses - Number of smoothing passes (default 2)
     */
    getFilteredPoints(amplitudeThreshold: number = 0.5, smoothingPasses: number = 2): LongWavePoint[] {
        // Only work with visible points
        const n = this.NUM_VISIBLE_POINTS;
        if (this.points.length === 0) return [];

        // Copy displacements to work array (visible only)
        let displacements = this.points.slice(0, n).map(p => p.disp);

        // Apply simple moving average smoothing (low-pass filter)
        for (let pass = 0; pass < smoothingPasses; pass++) {
            const smoothed = new Array(n);
            for (let i = 0; i < n; i++) {
                if (i === 0) {
                    smoothed[i] = (displacements[0] * 2 + displacements[1]) / 3;
                } else if (i === n - 1) {
                    smoothed[i] = (displacements[n - 2] + displacements[n - 1] * 2) / 3;
                } else {
                    // 3-point weighted average: [0.25, 0.5, 0.25]
                    smoothed[i] = displacements[i - 1] * 0.25 + displacements[i] * 0.5 + displacements[i + 1] * 0.25;
                }
            }
            displacements = smoothed;
        }

        // Apply amplitude threshold - zero out tiny displacements
        for (let i = 0; i < n; i++) {
            if (Math.abs(displacements[i]) < amplitudeThreshold) {
                displacements[i] = 0;
            }
        }

        // Create filtered points with updated actualX (visible only)
        return this.points.slice(0, n).map((p, i) => ({
            baseX: p.baseX,
            disp: displacements[i],
            prevDisp: p.prevDisp,
            velocity: p.velocity,
            actualX: p.baseX + displacements[i]
        }));
    }
}
