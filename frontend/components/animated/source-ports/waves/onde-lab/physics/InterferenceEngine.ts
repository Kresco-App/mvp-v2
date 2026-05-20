/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

/**
 * Wave Pulse Interference Engine
 * 
 * Simulates two counter-propagating PULSES on the SAME rope and their superposition.
 * - Pulse 1: travels from left to right
 * - Pulse 2: travels from right to left
 * - Resultant: superposition of both pulses (what the rope actually looks like)
 * - Ghost waves: show where each pulse WOULD be if traveling alone
 * 
 * Demonstrates the superposition principle:
 * - Waves pass through each other unchanged
 * - During collision, amplitudes add (constructive = 2x amplitude)
 * 
 * Scale: 100 pixels = 10 cm (1 px = 0.1 cm = 1 mm)
 */

export type InterferenceMode = 'constructive' | 'destructive';

export interface InterferenceParameters {
    amplitude: number;      // Pulse amplitude in pixels
    pulseWidth: number;     // Width of pulse in pixels
    tension: number;        // Affects wave speed
    mode: InterferenceMode; // Constructive or destructive (inverted pulse 2)
    speedMode: 'slow' | 'normal';
}

export interface InterferenceMetrics {
    waveSpeed: number;      // cm/s
    pulse1Position: number; // cm from left
    pulse2Position: number; // cm from left
    maxAmplitude: number;   // cm (of resultant)
    phaseDifference: number; // degrees (0 or 180)
    collisionProgress: number; // 0-1, how much pulses overlap
    currentTime: number;    // Current time position (0-1 normalized)
    maxTime: number;        // Maximum time for full traversal
}

export interface WavePointData {
    x: number;
    y: number;
}

export interface PulseState {
    active: boolean;
    position: number;       // Center position in pixels from left edge
    direction: 1 | -1;      // 1 = right, -1 = left
    amplitude: number;
    width: number;
}

export class InterferenceEngine {
    // Wave data arrays (displacements from equilibrium)
    private pulse1Displacement: number[] = [];  // Ghost: pulse 1 alone
    private pulse2Displacement: number[] = [];  // Ghost: pulse 2 alone
    private resultant: number[] = [];           // Actual rope: superposition
    private xPositions: number[] = [];          // X coordinates for each point
    
    public readonly NUM_POINTS = 300;
    public readonly MARGIN_X = 60;
    public readonly PIXELS_PER_CM = 10;
    
    private time: number = 0;
    private simulationTime: number = 0;
    private baseHeight: number = 300;
    private dx: number = 1;
    private width: number = 0;
    
    // Pulse states
    private pulse1: PulseState = {
        active: false,
        position: 0,
        direction: 1,
        amplitude: 60,
        width: 80
    };
    
    private pulse2: PulseState = {
        active: false,
        position: 0,
        direction: -1,
        amplitude: 60,
        width: 80
    };
    
    private _metrics: InterferenceMetrics = {
        waveSpeed: 0,
        pulse1Position: 0,
        pulse2Position: 0,
        maxAmplitude: 0,
        phaseDifference: 0,
        collisionProgress: 0,
        currentTime: 0,
        maxTime: 1
    };
    
    private waveSpeed: number = 0;  // pixels per frame
    
    // For time slider support
    private pulseStartTime: number = 0;
    private lastParams: InterferenceParameters | null = null;
    
    get metrics(): InterferenceMetrics {
        return { ...this._metrics };
    }
    
    get simTime(): number {
        return this.simulationTime;
    }
    
    get isPulse1Active(): boolean {
        return this.pulse1.active;
    }
    
    get isPulse2Active(): boolean {
        return this.pulse2.active;
    }
    
    get savedParams(): InterferenceParameters | null {
        return this.lastParams;
    }
    
    get pulseElapsedTime(): number {
        return this.simulationTime - this.pulseStartTime;
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
        if (width <= 0 || height <= 0) {
            this.pulse1Displacement = [];
            this.pulse2Displacement = [];
            this.resultant = [];
            this.xPositions = [];
            return;
        }
        
        this.width = width;
        this.baseHeight = height / 2;
        
        const usableWidth = width - this.MARGIN_X * 2;
        this.dx = usableWidth / (this.NUM_POINTS - 1);
        
        this.pulse1Displacement = new Array(this.NUM_POINTS).fill(0);
        this.pulse2Displacement = new Array(this.NUM_POINTS).fill(0);
        this.resultant = new Array(this.NUM_POINTS).fill(0);
        this.xPositions = [];
        
        for (let i = 0; i < this.NUM_POINTS; i++) {
            this.xPositions.push(this.MARGIN_X + i * this.dx);
        }
        
        this.time = 0;
        this.simulationTime = 0;
        
        // Reset pulses
        this.pulse1 = { active: false, position: 0, direction: 1, amplitude: 60, width: 80 };
        this.pulse2 = { active: false, position: 0, direction: -1, amplitude: 60, width: 80 };
    }

    reset(width: number, height: number): void {
        this.init(width, height);
    }

    /**
     * Send a pulse from the left side (travels right)
     */
    sendPulse1(amplitude: number, width: number): void {
        this.pulse1 = {
            active: true,
            position: this.MARGIN_X,
            direction: 1,
            amplitude: amplitude,
            width: width
        };
    }
    
    /**
     * Send a pulse from the right side (travels left)
     */
    sendPulse2(amplitude: number, width: number, inverted: boolean = false): void {
        this.pulse2 = {
            active: true,
            position: this.width - this.MARGIN_X,
            direction: -1,
            amplitude: inverted ? -amplitude : amplitude,
            width: width
        };
    }
    
    /**
     * Send both pulses simultaneously
     */
    sendBothPulses(amplitude: number, width: number, mode: InterferenceMode): void {
        this.sendPulse1(amplitude, width);
        this.sendPulse2(amplitude, width, mode === 'destructive');
        this.pulseStartTime = this.simulationTime;
        this.lastParams = { amplitude, pulseWidth: width, tension: 2.5, mode, speedMode: 'normal' };
    }

    /**
     * Seek to a specific time position (0 = start, 1 = end of traversal)
     * This positions the pulses as if that much time had elapsed since sending
     */
    seekToTime(normalizedTime: number, params: InterferenceParameters, baseHeight: number): void {
        const n = this.pulse1Displacement.length;
        if (n === 0) return;
        
        this.baseHeight = baseHeight;
        
        // Calculate wave speed
        const c = Math.sqrt(Math.min(params.tension * 0.02, 0.20));
        const speedPerFrame = c * this.dx * 4; // Normal speed (4 iterations)
        this.waveSpeed = speedPerFrame;
        
        // Calculate total distance for full traversal (pulse goes from one end to past the other)
        const totalDistance = (this.width - 2 * this.MARGIN_X) + params.pulseWidth * 2;
        
        // Calculate positions based on normalized time
        const distanceTraveled = normalizedTime * totalDistance;
        
        // Position pulse 1 (starts at left, moves right)
        const pulse1Pos = this.MARGIN_X + distanceTraveled;
        this.pulse1 = {
            active: pulse1Pos < this.width - this.MARGIN_X + params.pulseWidth,
            position: pulse1Pos,
            direction: 1,
            amplitude: params.amplitude,
            width: params.pulseWidth
        };
        
        // Position pulse 2 (starts at right, moves left)
        const pulse2Pos = (this.width - this.MARGIN_X) - distanceTraveled;
        this.pulse2 = {
            active: pulse2Pos > this.MARGIN_X - params.pulseWidth,
            position: pulse2Pos,
            direction: -1,
            amplitude: params.mode === 'destructive' ? -params.amplitude : params.amplitude,
            width: params.pulseWidth
        };
        
        // Calculate displacements
        this.calculateDisplacements();
        this.updateMetrics(params);
        
        // Update time tracking
        this._metrics.currentTime = normalizedTime;
        this._metrics.maxTime = 1;
    }

    /**
     * Calculate displacements at current pulse positions
     */
    private calculateDisplacements(): void {
        const n = this.pulse1Displacement.length;
        
        for (let i = 0; i < n; i++) {
            const x = this.xPositions[i];
            
            // Pulse 1 displacement (ghost)
            if (this.pulse1.active) {
                this.pulse1Displacement[i] = this.gaussianPulse(
                    x, this.pulse1.position, this.pulse1.amplitude, this.pulse1.width
                );
            } else {
                this.pulse1Displacement[i] = 0;
            }
            
            // Pulse 2 displacement (ghost)
            if (this.pulse2.active) {
                this.pulse2Displacement[i] = this.gaussianPulse(
                    x, this.pulse2.position, this.pulse2.amplitude, this.pulse2.width
                );
            } else {
                this.pulse2Displacement[i] = 0;
            }
            
            // Superposition
            this.resultant[i] = this.pulse1Displacement[i] + this.pulse2Displacement[i];
        }
    }

    /**
     * Get the total traversal distance for time calculations
     */
    getTotalTraversalDistance(): number {
        return this.width - 2 * this.MARGIN_X;
    }

    /**
     * Calculate Gaussian pulse shape
     * Returns displacement at position x for a pulse centered at pulseCenter
     */
    private gaussianPulse(x: number, pulseCenter: number, amplitude: number, width: number): number {
        const sigma = width / 4;  // Width controls the spread
        const exponent = -Math.pow(x - pulseCenter, 2) / (2 * sigma * sigma);
        return amplitude * Math.exp(exponent);
    }

    update(params: InterferenceParameters, baseHeight: number): void {
        const n = this.pulse1Displacement.length;
        if (n === 0) return;
        
        this.baseHeight = baseHeight;
        this.lastParams = params;
        
        const { tension, speedMode } = params;
        
        // Speed control
        const iterations = speedMode === 'slow' ? 1 : 4;
        
        // Wave speed based on tension
        const c = Math.sqrt(Math.min(tension * 0.02, 0.20));
        this.waveSpeed = c * this.dx * iterations;
        
        for (let iter = 0; iter < iterations; iter++) {
            this.time += 1;
            this.simulationTime += 1.0 / (60 * iterations);
            
            // Move pulse 1 (left to right)
            if (this.pulse1.active) {
                this.pulse1.position += this.waveSpeed / iterations;
                // Deactivate when fully off screen
                if (this.pulse1.position > this.width - this.MARGIN_X + this.pulse1.width) {
                    this.pulse1.active = false;
                }
            }
            
            // Move pulse 2 (right to left)
            if (this.pulse2.active) {
                this.pulse2.position -= this.waveSpeed / iterations;
                // Deactivate when fully off screen
                if (this.pulse2.position < this.MARGIN_X - this.pulse2.width) {
                    this.pulse2.active = false;
                }
            }
        }
        
        // Calculate displacements
        this.calculateDisplacements();
        this.updateMetrics(params);
    }

    private updateMetrics(params: InterferenceParameters): void {
        const speedPxPerSec = this.waveSpeed * 60;
        this._metrics.waveSpeed = speedPxPerSec / this.PIXELS_PER_CM;
        this._metrics.phaseDifference = params.mode === 'destructive' ? 180 : 0;
        
        // Pulse positions in cm from left edge
        this._metrics.pulse1Position = (this.pulse1.position - this.MARGIN_X) / this.PIXELS_PER_CM;
        this._metrics.pulse2Position = (this.pulse2.position - this.MARGIN_X) / this.PIXELS_PER_CM;
        
        // Find max amplitude of resultant
        let maxAmp = 0;
        for (let i = 0; i < this.resultant.length; i++) {
            const amp = Math.abs(this.resultant[i]);
            if (amp > maxAmp) maxAmp = amp;
        }
        this._metrics.maxAmplitude = maxAmp / this.PIXELS_PER_CM;
        
        // Calculate collision progress (how much pulses overlap)
        if (this.pulse1.active && this.pulse2.active) {
            const distance = Math.abs(this.pulse1.position - this.pulse2.position);
            const overlapThreshold = (this.pulse1.width + this.pulse2.width) / 2;
            this._metrics.collisionProgress = Math.max(0, 1 - distance / overlapThreshold);
        } else {
            this._metrics.collisionProgress = 0;
        }
        
        // Calculate normalized time (how far through the traversal)
        const totalDistance = (this.width - 2 * this.MARGIN_X) + params.pulseWidth * 2;
        const distanceTraveled = this.pulse1.position - this.MARGIN_X;
        this._metrics.currentTime = Math.max(0, Math.min(1, distanceTraveled / totalDistance));
        this._metrics.maxTime = 1;
    }

    /**
     * Get Pulse 1 ghost points for rendering (what pulse 1 would look like alone)
     */
    getWave1Points(): WavePointData[] {
        const points: WavePointData[] = [];
        for (let i = 0; i < this.pulse1Displacement.length; i++) {
            points.push({
                x: this.xPositions[i],
                y: this.baseHeight - this.pulse1Displacement[i]
            });
        }
        return points;
    }

    /**
     * Get Pulse 2 ghost points for rendering (what pulse 2 would look like alone)
     */
    getWave2Points(): WavePointData[] {
        const points: WavePointData[] = [];
        for (let i = 0; i < this.pulse2Displacement.length; i++) {
            points.push({
                x: this.xPositions[i],
                y: this.baseHeight - this.pulse2Displacement[i]
            });
        }
        return points;
    }

    /**
     * Get Resultant wave points for rendering (the actual rope position)
     */
    getResultantPoints(): WavePointData[] {
        const points: WavePointData[] = [];
        for (let i = 0; i < this.resultant.length; i++) {
            points.push({
                x: this.xPositions[i],
                y: this.baseHeight - this.resultant[i]
            });
        }
        return points;
    }

    /**
     * Get center point displacement
     */
    getCenterDisplacement(): { wave1: number; wave2: number; resultant: number } {
        const centerIndex = Math.floor(this.pulse1Displacement.length / 2);
        if (this.pulse1Displacement.length === 0) {
            return { wave1: 0, wave2: 0, resultant: 0 };
        }
        return {
            wave1: this.pulse1Displacement[centerIndex] / this.PIXELS_PER_CM,
            wave2: this.pulse2Displacement[centerIndex] / this.PIXELS_PER_CM,
            resultant: this.resultant[centerIndex] / this.PIXELS_PER_CM
        };
    }
    
    /**
     * Check if any pulse is currently active
     */
    hasActivePulses(): boolean {
        return this.pulse1.active || this.pulse2.active;
    }
}
