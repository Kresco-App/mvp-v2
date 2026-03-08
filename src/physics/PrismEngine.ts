import { GeometricOpticsEngine } from './GeometricOpticsEngine';

export class PrismEngine {
    // Cauchy coefficients for typical glass (BK7 approx)
    // A ~ 1.5, B ~ 0.0042 micrometers^2
    // Lambda in microns usually for Cauchy.
    
    public static getRefractiveIndex(wavelengthNm: number): number {
        // Convert nm to micrometers
        const lambdaMicrons = wavelengthNm / 1000;
        
        // Approximate values for dense flint glass (high dispersion)
        const A = 1.6;
        const B = 0.01; 
        
        return A + B / (lambdaMicrons * lambdaMicrons);
    }

    /**
     * Traces a ray through a prism.
     * Assumes prism is in air (n=1).
     * @param angleIncidence Angle relative to normal of first face
     * @param apexAngle Angle of the prism apex (radians)
     * @param wavelengthNm Wavelength in nm
     */
    public static tracePrism(angleIncidence: number, apexAngle: number, wavelengthNm: number) {
        const nGlass = this.getRefractiveIndex(wavelengthNm);
        const nAir = 1.0;
        
        // 1. Refraction at first face
        // n1 sin(i) = n2 sin(r1)
        const r1 = GeometricOpticsEngine.calculateRefraction(angleIncidence, nAir, nGlass);
        if (r1 === null) return null; // TIR at entrance (unlikely for air->glass)
        
        // 2. Geometry inside prism
        // r1 + r2 = A (Apex Angle)
        // r2 = A - r1
        const r2 = apexAngle - r1;
        
        // 3. Refraction at second face
        // n2 sin(r2) = n1 sin(i2)  (Here i2 is the exit angle relative to normal)
        // We use Snell's law: nGlass * sin(r2) = nAir * sin(exitAngle)
        const exitAngle = GeometricOpticsEngine.calculateRefraction(r2, nGlass, nAir);
        
        // If exitAngle is null, it means TIR at the second face
        
        // Deviation Angle D = i + i' - A
        let deviation = null;
        if (exitAngle !== null) {
            deviation = angleIncidence + exitAngle - apexAngle;
        }

        return {
            n: nGlass,
            r1,
            r2,
            exitAngle,
            deviation,
            tir: exitAngle === null
        };
    }
}
