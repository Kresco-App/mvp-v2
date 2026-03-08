export class DiffractionEngine {
    
    /**
     * Calculates the intensity of light at a specific angle theta for a single slit diffraction.
     * I = I0 * sinc^2(beta)
     * beta = (pi * a * sin(theta)) / lambda
     * 
     * @param theta Angle in radians
     * @param a Slit width (meters)
     * @param lambda Wavelength (meters)
     * @param I0 Max intensity
     */
    public static calculateIntensity(theta: number, a: number, lambda: number, I0: number = 1.0): number {
        if (theta === 0) return I0;
        
        const sinTheta = Math.sin(theta);
        const beta = (Math.PI * a * sinTheta) / lambda;
        
        if (beta === 0) return I0;
        
        const sinc = Math.sin(beta) / beta;
        return I0 * sinc * sinc;
    }

    /**
     * Calculates the position of the first dark fringe (minimum) on a screen.
     * y = (lambda * D) / a
     * 
     * @param a Slit width (m)
     * @param lambda Wavelength (m)
     * @param D Distance to screen (m)
     */
    public static calculateFirstMinimumPosition(a: number, lambda: number, D: number): number {
        return (lambda * D) / a;
    }
}
