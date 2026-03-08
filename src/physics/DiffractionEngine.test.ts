import { describe, it, expect } from 'vitest';
import { DiffractionEngine } from './DiffractionEngine';

describe('DiffractionEngine', () => {
    it('should have max intensity at theta = 0', () => {
        const intensity = DiffractionEngine.calculateIntensity(0, 1e-4, 500e-9);
        expect(intensity).toBe(1.0);
    });

    it('should have zero intensity at first minimum', () => {
        // First minimum happens when a * sin(theta) = lambda
        // sin(theta) = lambda / a
        const lambda = 500e-9;
        const a = 1e-5; // 10 microns
        const sinTheta = lambda / a;
        const theta = Math.asin(sinTheta);
        
        const intensity = DiffractionEngine.calculateIntensity(theta, a, lambda);
        // Intensity should be very close to 0
        expect(intensity).toBeLessThan(1e-10);
    });
    
    it('should calculate screen position correctly', () => {
        // y = lambda * D / a
        const lambda = 600e-9;
        const D = 2.0;
        const a = 0.1e-3; // 0.1mm
        
        const y = DiffractionEngine.calculateFirstMinimumPosition(a, lambda, D);
        const expected = (600e-9 * 2.0) / 0.1e-3;
        
        expect(y).toBeCloseTo(expected);
    });
});
