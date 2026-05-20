/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

/**
 * Dual Wave Physics Engine
 * 
 * Simulates two independent longitudinal waves to compare propagation
 * through different media (e.g. Sound in Air vs Water).
 */

export interface LongWavePoint {
    baseX: number;     // Equilibrium position
    disp: number;      // Displacement
    prevDisp: number;  // Previous displacement
    velocity: number;  // du/dt
    actualX: number;   // baseX + disp
}

export type WaveMode = 'manual' | 'oscillate';

export interface DualWaveParams {
    tension1: number;      // Tension/Speed for Top Wave
    tension2: number;      // Tension/Speed for Bottom Wave
    damping: number;
    amplitude: number;
    frequency: number;
    waveMode: WaveMode;
    speedMode: 'slow' | 'normal';
}

export interface DualWaveMetrics {
    waveSpeed1: number;
    waveSpeed2: number;
    wavelength1: number;
    wavelength2: number;
    frequency: number;
}

export class MultiMediumWaveEngine {
    topPoints: LongWavePoint[] = [];
    bottomPoints: LongWavePoint[] = [];
    
    time: number = 0;
    
    public readonly NUM_VISIBLE_POINTS = 200;
    public readonly NUM_HIDDEN_POINTS = 100;
    public readonly NUM_POINTS = 300; 
    public readonly MARGIN_X = 60;
    public readonly PIXELS_PER_CM = 10;
    
    private pulse = { active: false, startTime: 0, amplitude: 0 };
    private _metrics: DualWaveMetrics = { waveSpeed1: 0, waveSpeed2: 0, wavelength1: 0, wavelength2: 0, frequency: 0 };
    
    private simulationTime: number = 0;
    private prevFrequency: number = 1.0;
    private phaseAccumulator: number = 0;
    private dx: number = 1;
    
    // Smooth transition vars
    private prevTension1: number = 2.5;
    private prevTension2: number = 2.5;

    get metrics(): DualWaveMetrics {
        return { ...this._metrics };
    }

    init(width: number, height: number): void {
        this.topPoints = [];
        this.bottomPoints = [];
        
        if (width <= 0) return;
        
        const usableWidth = width - this.MARGIN_X * 2;
        this.dx = usableWidth / (this.NUM_VISIBLE_POINTS - 1);
        
        // Init Top Wave
        for (let i = 0; i < this.NUM_POINTS; i++) {
            const bx = this.MARGIN_X + i * this.dx;
            this.topPoints.push({
                baseX: bx, disp: 0, prevDisp: 0, velocity: 0, actualX: bx
            });
        }
        
        // Init Bottom Wave
        for (let i = 0; i < this.NUM_POINTS; i++) {
            const bx = this.MARGIN_X + i * this.dx;
            this.bottomPoints.push({
                baseX: bx, disp: 0, prevDisp: 0, velocity: 0, actualX: bx
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
            amplitude: amplitude
        };
    }
    
    update(params: DualWaveParams, manualDisp?: number): boolean {
        if (this.topPoints.length === 0) return true;

        const { tension1, tension2, damping, waveMode, amplitude, frequency, speedMode } = params;
        
        const iterations = speedMode === 'slow' ? 2 : 6;
        
        // Smooth tension updates
        this.prevTension1 += (tension1 - this.prevTension1) * 0.1;
        this.prevTension2 += (tension2 - this.prevTension2) * 0.1;

        // Calculate Courant numbers
        const c2_1 = Math.min(this.prevTension1 * 0.015, 0.45);
        const c2_2 = Math.min(this.prevTension2 * 0.015, 0.45);
        
        const dampPerIteration = Math.pow(1.0 - damping * 0.3, 1.0 / iterations);

        for (let iter = 0; iter < iterations; iter++) {
            this.time += 1;
            this.simulationTime += 1.0 / (60 * iterations);

            // Update Top Wave
            this.updateWave(this.topPoints, c2_1, dampPerIteration, waveMode, amplitude, frequency, manualDisp);
            
            // Update Bottom Wave
            this.updateWave(this.bottomPoints, c2_2, dampPerIteration, waveMode, amplitude, frequency, manualDisp);
        }

        this.updateMetrics(params, c2_1, c2_2);
        return true;
    }

    private updateWave(
        points: LongWavePoint[], 
        c2: number, 
        damp: number, 
        mode: WaveMode, 
        amp: number, 
        freq: number, 
        manualDisp?: number
    ) {
        const n = points.length;
        const newDisp = new Float64Array(n);
        
        for (let i = 0; i < n; i++) newDisp[i] = points[i].disp;

        // Interior
        for (let i = 1; i < n - 1; i++) {
            const u = points[i].disp;
            const laplacian = points[i-1].disp + points[i+1].disp - 2 * u;
            const uNew = 2 * u - points[i].prevDisp + c2 * laplacian;
            const vel = uNew - u;
            newDisp[i] = u + vel * damp;
        }

        // Source
        newDisp[0] = this.computeSourceDisp(mode, amp, freq, manualDisp);

        // Absorbing Boundary (Right)
        const last = n - 1;
        const c = Math.sqrt(c2);
        const coeff = (c - 1) / (c + 1);
        newDisp[last] = points[last-1].disp + coeff * (newDisp[last-1] - points[last].disp);

        // Apply
        for (let i = 0; i < n; i++) {
            const p = points[i];
            p.velocity = newDisp[i] - p.disp;
            p.prevDisp = p.disp;
            p.disp = newDisp[i];
            p.actualX = p.baseX + p.disp;
        }
    }

    private computeSourceDisp(mode: WaveMode, amp: number, freq: number, manualDisp?: number): number {
        const current = this.topPoints[0].disp; // Use top as ref, they should be synced at source
        
        if (mode === 'oscillate') {
            const smoothFreq = this.prevFrequency + (freq - this.prevFrequency) * 0.05;
            this.prevFrequency = smoothFreq;
            const deltaPhase = 2 * Math.PI * smoothFreq * 0.004;
            this.phaseAccumulator += deltaPhase;
            return Math.sin(this.phaseAccumulator) * amp;
        } else if (manualDisp !== undefined && mode === 'manual') {
            const diff = manualDisp - current;
            return current + diff * 0.5;
        } else if (this.pulse.active) {
            const duration = 300;
            const elapsed = this.time - this.pulse.startTime;
            if (elapsed >= 0 && elapsed < duration) {
                const t = elapsed / duration;
                const shape = Math.sin(Math.PI * t) * Math.sin(Math.PI * t * 0.5);
                return shape * this.pulse.amplitude;
            } else if (elapsed >= duration) {
                this.pulse.active = false;
                return 0;
            }
        }
        return current * 0.9;
    }

    private updateMetrics(params: DualWaveParams, c2_1: number, c2_2: number): void {
        const c1 = Math.sqrt(c2_1);
        const c2 = Math.sqrt(c2_2);
        
        const factor = 60 * 6; // fps * iterations
        this._metrics.waveSpeed1 = (c1 * this.dx * factor) / this.PIXELS_PER_CM;
        this._metrics.waveSpeed2 = (c2 * this.dx * factor) / this.PIXELS_PER_CM;
        
        this._metrics.frequency = params.frequency;
        this._metrics.wavelength1 = params.frequency > 0 ? this._metrics.waveSpeed1 / params.frequency : 0;
        this._metrics.wavelength2 = params.frequency > 0 ? this._metrics.waveSpeed2 / params.frequency : 0;
    }
    
    getFilteredPoints(which: 'top' | 'bottom', amplitudeThreshold: number = 0.5): LongWavePoint[] {
        const n = this.NUM_VISIBLE_POINTS;
        const source = which === 'top' ? this.topPoints : this.bottomPoints;
        if (source.length === 0) return [];

        let displacements = source.slice(0, n).map(p => p.disp);
        
        // Smoothing
        for (let pass = 0; pass < 2; pass++) {
            const smoothed = new Array(n);
            for (let i = 0; i < n; i++) {
                if (i === 0) smoothed[i] = (displacements[0] * 2 + displacements[1]) / 3;
                else if (i === n - 1) smoothed[i] = (displacements[n - 2] + displacements[n - 1] * 2) / 3;
                else smoothed[i] = displacements[i - 1] * 0.25 + displacements[i] * 0.5 + displacements[i + 1] * 0.25;
            }
            displacements = smoothed;
        }

        return source.slice(0, n).map((p, i) => ({
            ...p,
            disp: Math.abs(displacements[i]) < amplitudeThreshold ? 0 : displacements[i],
            actualX: p.baseX + (Math.abs(displacements[i]) < amplitudeThreshold ? 0 : displacements[i])
        }));
    }
}
