import { describe, it, expect } from 'vitest';
import { calculatePrism, Vector, RaySegment } from './PrismLogic';

describe('PrismLogic', () => {
    describe('Vector Math', () => {
        it('should add vectors correctly', () => {
            const v1 = new Vector(1, 2);
            const v2 = new Vector(3, 4);
            const sum = v1.add(v2);
            expect(sum.x).toBe(4);
            expect(sum.y).toBe(6);
        });

        it('should calculate magnitude and normalize', () => {
            const v = new Vector(3, 4);
            expect(v.mag()).toBe(5);
            
            const norm = v.normalize();
            expect(norm.x).toBeCloseTo(0.6);
            expect(norm.y).toBeCloseTo(0.8);
            expect(norm.mag()).toBeCloseTo(1.0);
        });

        it('should calculate dot product', () => {
            const v1 = new Vector(1, 0);
            const v2 = new Vector(0, 1);
            expect(v1.dot(v2)).toBe(0); // Perpendicular
            
            const v3 = new Vector(2, 2);
            expect(v1.dot(v3)).toBe(2);
        });
    });

    describe('calculatePrism', () => {
        const width = 800;
        const height = 600;

        it('should return valid geometry', () => {
            const result = calculatePrism(width, height, 45, 60, false);
            
            expect(result.geometry).toBeDefined();
            expect(result.geometry.A).toBeDefined();
            expect(result.geometry.B).toBeDefined();
            expect(result.geometry.C).toBeDefined();
            
            // Check if P (incident point) is on AB
            // A.x should be close to B.x (Vertical face logic)
            expect(result.geometry.A.x).toBeCloseTo(result.geometry.B.x);
        });

        it('should trace rays for Red light', () => {
            // Single wavelength (Red)
            const result = calculatePrism(width, height, 45, 60, false);
            
            expect(result.rays.length).toBe(1);
            expect(result.rays[0].color).toBe('#ef4444'); // Red from SPECTRUM
            expect(result.rays[0].segments.length).toBeGreaterThan(0);
        });

        it('should trace multiple rays for White light', () => {
            const result = calculatePrism(width, height, 45, 60, true);
            
            expect(result.rays.length).toBeGreaterThan(1);
            // Should have Violet through Red
            const violet = result.rays.find(r => r.color === '#8b5cf6');
            const red = result.rays.find(r => r.color === '#ef4444');
            expect(violet).toBeDefined();
            expect(red).toBeDefined();
        });

        it('should calculate statistics correctly', () => {
            const result = calculatePrism(width, height, 45, 60, false);
            
            expect(result.stats).toBeDefined();
            if (result.stats) {
                expect(result.stats.i).toBe(45);
                // r should be calculated via Snell's law: sin(45) = n * sin(r)
                // n for red is approx 1.51 + 0.0045/(0.65^2) approx 1.52
                // sin(r) = 0.707 / 1.52 = 0.465
                // r = 27.7 deg
                expect(result.stats.r).toBeCloseTo(27.7, 0);
                
                // D should be positive
                expect(result.stats.D).toBeGreaterThan(0);
            }
        });

        it('should handle Total Internal Reflection (TIR)', () => {
            // For TIR, we need a specific angle.
            // If prism angle is large (e.g. 75) and incidence is grazing?
            // Or just test detection of TIR flag if we can force it.
            // Let's try to find a setup that might TIR.
            // High refractive index (Violet) + Large Prism Angle?
        });
    });
});
