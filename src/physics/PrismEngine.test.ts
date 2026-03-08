import { describe, it, expect } from 'vitest';
import { PrismEngine } from './PrismEngine';

describe('PrismEngine', () => {
    it('should have higher refractive index for blue light than red light', () => {
        const nBlue = PrismEngine.getRefractiveIndex(450);
        const nRed = PrismEngine.getRefractiveIndex(650);
        
        expect(nBlue).toBeGreaterThan(nRed);
    });

    it('should calculate deviation angle', () => {
        const i = Math.PI / 4; // 45 deg
        const A = Math.PI / 3; // 60 deg equilateral
        const wavelength = 550; // Green
        
        const result = PrismEngine.tracePrism(i, A, wavelength);
        
        expect(result).not.toBeNull();
        expect(result?.exitAngle).not.toBeNull();
        expect(result?.deviation).toBeGreaterThan(0);
    });
    
    it('should detect TIR inside prism', () => {
        // If angle of incidence is such that r2 > critical angle
        // Critical angle for n=1.6 is ~38 degrees.
        // A = 60. r2 = 60 - r1.
        // If r1 is small (normal incidence), r2 = 60 > 38 => TIR.
        
        const i = 0; // Normal incidence
        const A = Math.PI / 3; // 60 deg
        const wavelength = 550; 
        
        const result = PrismEngine.tracePrism(i, A, wavelength);
        
        // Should TIR at the second face
        expect(result?.exitAngle).toBeNull();
        expect(result?.tir).toBe(true);
    });
});
