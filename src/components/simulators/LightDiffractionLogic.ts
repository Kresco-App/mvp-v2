// Extracted logic from LightDiffractionSimulator for testing

export const getWavelengthColor = (lambda: number): string => {
    let r, g, b;
    if (lambda >= 380 && lambda < 440) {
        r = -(lambda - 440) / (440 - 380); g = 0; b = 1;
    } else if (lambda >= 440 && lambda < 490) {
        r = 0; g = (lambda - 440) / (490 - 440); b = 1;
    } else if (lambda >= 490 && lambda < 510) {
        r = 0; g = 1; b = -(lambda - 510) / (510 - 490);
    } else if (lambda >= 510 && lambda < 580) {
        r = (lambda - 510) / (580 - 510); g = 1; b = 0;
    } else if (lambda >= 580 && lambda < 645) {
        r = 1; g = -(lambda - 645) / (645 - 580); b = 0;
    } else if (lambda >= 645 && lambda <= 780) {
        r = 1; g = 0; b = 0;
    } else {
        r = 0; g = 0; b = 0;
    }

    // Intensity correction
    let factor;
    if (lambda >= 380 && lambda < 420) factor = 0.3 + 0.7 * (lambda - 380) / (420 - 380);
    else if (lambda >= 420 && lambda < 701) factor = 1.0;
    else if (lambda >= 701 && lambda < 780) factor = 0.3 + 0.7 * (780 - lambda) / (780 - 700);
    else factor = 0;

    const R = Math.round(r * factor * 255);
    const G = Math.round(g * factor * 255);
    const B = Math.round(b * factor * 255);
    return `rgb(${R}, ${G}, ${B})`;
};

export const calculateCentralSpotWidth = (wavelengthNm: number, distanceM: number, slitWidthUm: number): number => {
    // L = 2 * lambda * D / a
    // Units: nm->m, um->m
    return (2 * (wavelengthNm * 1e-9) * distanceM) / (slitWidthUm * 1e-6);
};

export const calculateIntensity = (xM: number, wavelengthNm: number, distanceM: number, slitWidthUm: number): number => {
    // theta ~ x / D
    // beta = (pi * a * sin(theta)) / lambda
    // I = sinc^2(beta)
    
    // Small angle approx: sin(theta) ~ theta ~ x / D
    // beta = (pi * a * x) / (lambda * D)
    
    const a = slitWidthUm * 1e-6;
    const lam = wavelengthNm * 1e-9;
    const D = distanceM;
    
    if (xM === 0) return 1.0;
    
    const u = (Math.PI * a * xM) / (lam * D);
    return Math.pow(Math.sin(u) / u, 2);
};
