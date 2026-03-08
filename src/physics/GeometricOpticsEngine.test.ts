import { describe, it, expect } from 'vitest';
import { GeometricOpticsEngine } from './GeometricOpticsEngine';

describe('GeometricOpticsEngine', () => {
    it('should calculate reflection correctly (i = r)', () => {
        const angle = Math.PI / 4; // 45 degrees
        expect(GeometricOpticsEngine.calculateReflection(angle)).toBeCloseTo(angle);
    });

    it('should calculate refraction correctly (Snell\'s Law)', () => {
        // Air (1.0) to Glass (1.5)
        // n1 * sin(i) = n2 * sin(r)
        // 1.0 * sin(30) = 1.5 * sin(r)
        // 0.5 = 1.5 * sin(r) => sin(r) = 1/3
        const i = Math.PI / 6; // 30 deg
        const n1 = 1.0;
        const n2 = 1.5;
        const r = GeometricOpticsEngine.calculateRefraction(i, n1, n2);
        
        expect(r).not.toBeNull();
        if (r !== null) {
            expect(Math.sin(r)).toBeCloseTo(1/3);
        }
    });

    it('should detect Total Internal Reflection (TIR)', () => {
        // Glass (1.5) to Air (1.0)
        // Critical angle: sin(c) = n2/n1 = 1/1.5 = 0.666
        // If we exceed critical angle, say 60 degrees (sin(60) = 0.866)
        
        const i = Math.PI / 3; // 60 deg
        const n1 = 1.5;
        const n2 = 1.0;
        const r = GeometricOpticsEngine.calculateRefraction(i, n1, n2);
        
        expect(r).toBeNull();
    });

    it('should pass straight through if indices are equal', () => {
        const i = Math.PI / 4;
        const n1 = 1.33;
        const n2 = 1.33;
        const r = GeometricOpticsEngine.calculateRefraction(i, n1, n2);
        expect(r).toBeCloseTo(i);
    });
});
