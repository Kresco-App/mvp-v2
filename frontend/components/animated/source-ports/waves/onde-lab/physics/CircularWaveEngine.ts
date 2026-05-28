/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

/**
 * Circular Wave Engine (2D)
 * 
 * Simulates the 2D Wave Equation with bulletproof absorbing boundaries.
 * 
 * Three-layer defense against reflections:
 * 1. Deep sponge layer with quintic damping ramp (300px padding)
 * 2. First-order Mur Absorbing Boundary Condition at all edges
 * 3. Proper double-buffering for numerical stability
 * 
 * - Visible Area: The central crop that the user sees.
 * - Padding: A wide border (300px) around the visible area.
 * - Sponge Layer: Damping ramps up with quintic curve inside the padding.
 * - Mur ABC: Mathematically-derived boundary condition that absorbs outgoing waves.
 */

export type WaveMode2D = 'manual' | 'oscillate';

export interface CircularWaveParams {
    amplitude: number;
    frequency: number;
    damping: number;
    waveMode: WaveMode2D;
    speed: number;
}

export class CircularWaveEngine {
    // Visible dimensions (Requested by UI)
    visibleWidth: number = 0;
    visibleHeight: number = 0;

    // Total physics dimensions (Visible + Padding)
    totalWidth: number = 0;
    totalHeight: number = 0;
    
    // Deep padding for absorption (sponge + Mur ABC)
    public readonly PADDING = 300; 
    
    // Double-buffered wave state (Total Size)
    u: Float32Array;      // Current state
    uPrev: Float32Array;  // Previous state (for Verlet integration)
    uNext: Float32Array;  // Next state (output buffer)
    
    // Damping mask (sponge layer in padding zone)
    dampingMask: Float32Array;
    
    // State
    time: number = 0;
    phaseAccumulator: number = 0;
    
    constructor(cols: number = 100, rows: number = 100) {
        // Initialize with empty arrays first
        this.u = new Float32Array(0);
        this.uPrev = new Float32Array(0);
        this.uNext = new Float32Array(0);
        this.dampingMask = new Float32Array(0);
        this.init(cols, rows);
    }

    init(visibleCols: number, visibleRows: number) {
        this.visibleWidth = visibleCols;
        this.visibleHeight = visibleRows;
        
        this.totalWidth = visibleCols + 2 * this.PADDING;
        this.totalHeight = visibleRows + 2 * this.PADDING;
        
        const size = this.totalWidth * this.totalHeight;
        
        this.u = new Float32Array(size);
        this.uPrev = new Float32Array(size);
        this.uNext = new Float32Array(size);
        this.dampingMask = new Float32Array(size);
        
        this.initDampingMask();
        this.time = 0;
        this.phaseAccumulator = 0;
    }
    
    /**
     * Initialize sponge layer damping mask.
     * Uses quintic (5th power) ramp for smooth onset and strong absorption.
     * Maximum damping of 0.95 ensures near-total absorption before reaching edge.
     */
    initDampingMask() {
        const w = this.totalWidth;
        const h = this.totalHeight;
        const pad = this.PADDING;
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                
                // Check if we are in the padding zone
                const isHidden = x < pad || x >= w - pad || y < pad || y >= h - pad;
                
                if (isHidden) {
                    // Distance into the padding (0 at visible boundary, PADDING at edge)
                    const distLeft = Math.max(0, pad - x);
                    const distRight = Math.max(0, x - (w - pad - 1));
                    const distTop = Math.max(0, pad - y);
                    const distBottom = Math.max(0, y - (h - pad - 1));
                    
                    const distIntoPadding = Math.max(distLeft, distRight, distTop, distBottom);
                    
                    // Cubic ramp (3rd power) for faster absorption onset
                    // Combined with high max damping for near-total absorption
                    const ratio = distIntoPadding / pad;
                    this.dampingMask[i] = Math.pow(ratio, 3) * 0.98;
                } else {
                    this.dampingMask[i] = 0;
                }
            }
        }
    }

    resize(visibleCols: number, visibleRows: number) {
        if (visibleCols === this.visibleWidth && visibleRows === this.visibleHeight) {
            this.u.fill(0);
            this.uPrev.fill(0);
            this.uNext.fill(0);
            this.time = 0;
            return;
        }
        this.init(visibleCols, visibleRows);
    }
    
    update(params: CircularWaveParams) {
        const { amplitude, frequency, damping, waveMode, speed } = params;
        
        // Wave speed squared (Courant number squared)
        // Clamped to ensure numerical stability (CFL condition)
        const c2 = Math.min(speed * 0.1, 0.5); 
        const c = Math.sqrt(c2);
        
        const w = this.totalWidth;
        const h = this.totalHeight;
        
        // ============================================
        // STEP 1: Apply oscillator source at center
        // ============================================
        if (waveMode === 'oscillate') {
            const cx = Math.floor(w / 2);
            const cy = Math.floor(h / 2);
            const centerIdx = cy * w + cx;
            this.phaseAccumulator += frequency * 0.15;
            this.u[centerIdx] = Math.sin(this.phaseAccumulator) * amplitude;
        }
        
        // ============================================
        // STEP 2: Main physics loop (interior points)
        // Verlet integration with sponge damping
        // ============================================
        for (let y = 1; y < h - 1; y++) {
            const rowOffset = y * w;
            for (let x = 1; x < w - 1; x++) {
                const i = rowOffset + x;
                
                const val = this.u[i];
                const prevVal = this.uPrev[i];
                
                // 5-point Laplacian stencil
                const laplacian = this.u[i - 1] + this.u[i + 1] + 
                                  this.u[i - w] + this.u[i + w] - 4 * val;
                
                // Combined damping: physics damping + sponge absorption
                const totalDamping = 1.0 - Math.min(0.99, damping + this.dampingMask[i]);
                
                // Verlet integration: u_next = 2*u - u_prev + c^2 * laplacian
                const nextVal = (2 * val - prevVal + c2 * laplacian) * totalDamping;
                
                this.uNext[i] = nextVal;
            }
        }
        
        // ============================================
        // STEP 3: Apply Mur Absorbing Boundary Condition
        // First-order Mur ABC absorbs normally-incident waves
        // Formula: u_edge^new = u_neighbor^old + coeff*(u_neighbor^new - u_edge^old)
        // where coeff = (c - 1)/(c + 1)
        // ============================================
        const murCoeff = (c - 1) / (c + 1);
        
        // Left edge (x = 0)
        for (let y = 1; y < h - 1; y++) {
            const i = y * w;
            this.uNext[i] = this.u[i + 1] + murCoeff * (this.uNext[i + 1] - this.u[i]);
        }
        
        // Right edge (x = w - 1)
        for (let y = 1; y < h - 1; y++) {
            const i = y * w + (w - 1);
            this.uNext[i] = this.u[i - 1] + murCoeff * (this.uNext[i - 1] - this.u[i]);
        }
        
        // Top edge (y = 0)
        for (let x = 1; x < w - 1; x++) {
            this.uNext[x] = this.u[x + w] + murCoeff * (this.uNext[x + w] - this.u[x]);
        }
        
        // Bottom edge (y = h - 1)
        for (let x = 1; x < w - 1; x++) {
            const i = (h - 1) * w + x;
            this.uNext[i] = this.u[i - w] + murCoeff * (this.uNext[i - w] - this.u[i]);
        }
        
        // Corners: average of adjacent edge values for smoothness
        this.uNext[0] = 0.5 * (this.uNext[1] + this.uNext[w]);                        // Top-left
        this.uNext[w - 1] = 0.5 * (this.uNext[w - 2] + this.uNext[2 * w - 1]);        // Top-right
        this.uNext[(h - 1) * w] = 0.5 * (this.uNext[(h - 1) * w + 1] + this.uNext[(h - 2) * w]); // Bottom-left
        this.uNext[h * w - 1] = 0.5 * (this.uNext[h * w - 2] + this.uNext[(h - 1) * w - 1]);     // Bottom-right
        
        // ============================================
        // STEP 4: Triple buffer rotation
        // uPrev <- u <- uNext
        // ============================================
        const temp = this.uPrev;
        this.uPrev = this.u;
        this.u = this.uNext;
        this.uNext = temp;
        
        // ============================================
        // STEP 5: Re-apply source (maintains clean oscillation)
        // ============================================
        if (waveMode === 'oscillate') {
            const cx = Math.floor(w / 2);
            const cy = Math.floor(h / 2);
            this.u[cy * w + cx] = Math.sin(this.phaseAccumulator) * amplitude;
        }
        
        this.time++;
    }
    
    /**
     * Create a disturbance at a relative position in the visible area.
     * @param relX - X position (0-1) relative to visible area
     * @param relY - Y position (0-1) relative to visible area  
     * @param strength - Amplitude of disturbance
     */
    disturb(relX: number, relY: number, strength: number) {
        const x = Math.floor(relX * this.visibleWidth) + this.PADDING;
        const y = Math.floor(relY * this.visibleHeight) + this.PADDING;
        
        if (x > 1 && x < this.totalWidth - 2 && y > 1 && y < this.totalHeight - 2) {
            const i = y * this.totalWidth + x;
            this.u[i] += strength;
            this.uPrev[i] = this.u[i]; // Zero velocity start for stability
        }
    }
}
