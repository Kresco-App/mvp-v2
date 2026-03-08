export type Point = { x: number; y: number };

export class Vector {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  add(v: Vector): Vector {
    return new Vector(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector): Vector {
    return new Vector(this.x - v.x, this.y - v.y);
  }

  mul(s: number): Vector {
    return new Vector(this.x * s, this.y * s);
  }

  dot(v: Vector): number {
    return this.x * v.x + this.y * v.y;
  }

  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Vector {
    const m = this.mag();
    if (m === 0) return new Vector(0, 0);
    return new Vector(this.x / m, this.y / m);
  }
  
  static fromPoint(p: Point): Vector {
      return new Vector(p.x, p.y);
  }
  
  toPoint(): Point {
      return { x: this.x, y: this.y };
  }
}

export interface RaySegment {
  start: Point;
  end: Point;
}

export interface SimulationResult {
  geometry: {
    A: Point;
    B: Point;
    C: Point;
    P: Point; // First impact
  };
  rays: {
    color: string;
    segments: RaySegment[];
    alpha: number;
  }[];
  incidentRay: RaySegment;
  stats: {
    i: number; // Incidence
    r: number; // Refraction 1
    r_prime: number; // Incidence 2 (Internal)
    i_prime: number; // Emergence
    D: number; // Deviation
    tir: boolean;
  } | null;
}

// --- Physics Functions ---

function solveIntersection(
  rayOrigin: Vector,
  rayDir: Vector,
  segStart: Vector,
  segEnd: Vector
): Vector | null {
  const v1 = rayOrigin.sub(segStart);
  const v2 = segEnd.sub(segStart);
  
  // Ray: P + t*R
  // Seg: A + u*(B-A) -> A + u*S
  
  // Standard 2D Line-Line Intersection
  // Px + tRx = Ax + uSx
  // Py + tRy = Ay + uSy
  // tRx - uSx = Ax - Px
  // tRy - uSy = Ay - Py
  
  // det = Rx(-Sy) - (-Sx)Ry = -RxSy + SxRy
  const Sx = v2.x;
  const Sy = v2.y;
  const Rx = rayDir.x;
  const Ry = rayDir.y;
  
  const det = Rx * (-Sy) - (-Sx) * Ry;
  
  if (Math.abs(det) < 1e-8) return null;
  
  const dx = segStart.x - rayOrigin.x;
  const dy = segStart.y - rayOrigin.y;
  
  // Cramer's Rule
  // t = (dx(-Sy) - (-Sx)dy) / det
  // u = (Rx(dy) - dx(Ry)) / det
  
  const t = (dx * (-Sy) - (-Sx) * dy) / det;
  const u = (Rx * dy - dx * Ry) / det;
  
  // u must be between 0 and 1 (Segment)
  // t must be > epsilon (Ray moves forward)
  if (t > 1e-4 && u >= 0 && u <= 1) {
      return rayOrigin.add(rayDir.mul(t));
  }
  
  return null;
}

function snellsLaw(
  incidentDir: Vector,
  normal: Vector,
  n1: number,
  n2: number
): Vector | null {
  // Ensure normalized
  const I = incidentDir.normalize();
  let N = normal.normalize();
  
  // Check orientation: I.N should be negative (opposing)
  let dot = I.dot(N);
  if (dot > 0) {
      N = N.mul(-1);
      dot = -dot;
  }
  
  const ratio = n1 / n2;
  const sin2Theta1 = 1 - dot * dot;
  const sin2Theta2 = ratio * ratio * sin2Theta1;
  
  if (sin2Theta2 > 1.0) return null; // TIR
  
  const cosTheta2 = Math.sqrt(1 - sin2Theta2);
  
  // R = r*I + (r*cos1 - cos2)*N
  // dot is -cosTheta1
  const cosTheta1 = -dot;
  
  return I.mul(ratio).add(N.mul(ratio * cosTheta1 - cosTheta2));
}

// Helper to get RGB from Wavelength
function getWavelengthColor(lambda: number): string {
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

    let factor;
    if (lambda >= 380 && lambda < 420) factor = 0.3 + 0.7 * (lambda - 380) / (420 - 380);
    else if (lambda >= 420 && lambda < 701) factor = 1.0;
    else if (lambda >= 701 && lambda < 780) factor = 0.3 + 0.7 * (780 - lambda) / (780 - 700);
    else factor = 0;

    const R = Math.round(r * factor * 255);
    const G = Math.round(g * factor * 255);
    const B = Math.round(b * factor * 255);
    
    // Convert to Hex
    const toHex = (c: number) => c.toString(16).padStart(2, '0');
    return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
}

// Generate a dense spectrum
const generateDenseSpectrum = () => {
    const rays = [];
    // From 380 to 750 nm (full visible spectrum), step 2 nm -> 186 rays for extreme smoothness
    for (let lambda = 380; lambda <= 750; lambda += 2) {
        let name = 'Spectral';
        if (lambda < 450) name = 'Violet';
        else if (lambda < 480) name = 'Blue';
        else if (lambda < 550) name = 'Green';
        else if (lambda < 600) name = 'Yellow';
        else if (lambda < 650) name = 'Orange';
        else name = 'Red';
        
        rays.push({
            color: getWavelengthColor(lambda),
            lambda: lambda,
            name: name
        });
    }
    return rays;
};

export const SPECTRUM = generateDenseSpectrum();

function getRefractiveIndex(wavelengthNm: number): number {
  // Cauchy's Equation for Crown Glass
  const lambdaMicrons = wavelengthNm / 1000;
  const A = 1.51;
  const B = 0.0045;
  return A + B / (lambdaMicrons * lambdaMicrons);
}

export function calculateMinDeviationAngle(prismAngleDeg: number, wavelengthNm: number): number {
    const n = getRefractiveIndex(wavelengthNm);
    const A = prismAngleDeg * Math.PI / 180;
    // Condition for min deviation: i = i', r = r' = A/2
    // n = sin(i) / sin(r) -> sin(i) = n * sin(A/2)
    const sinI = n * Math.sin(A / 2);
    if (sinI > 1) return 45; // Fallback
    return Math.asin(sinI) * 180 / Math.PI;
}

// --- Main Calculation ---
export function calculatePrism(
  width: number,
  height: number,
  incidentAngleDeg: number,
  prismAngleDeg: number,
  showWhiteLight: boolean,
  laserWavelength: number = 650
): SimulationResult {
  
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Geometry: Face 1 (AB) Vertical
  // Fixed Side Length
  const side = 280; 
  
  const A_vec = new Vector(centerX - 40, centerY - side/2); 
  const B_vec = new Vector(centerX - 40, centerY + side/2);
  
  const radA = prismAngleDeg * Math.PI / 180;
  const angleAC = Math.PI/2 - radA; 
  
  const C_vec = new Vector(
      A_vec.x + side * Math.cos(angleAC),
      A_vec.y + side * Math.sin(angleAC)
  );
  
  const P_vec = A_vec.add(B_vec).mul(0.5);
  
  const radI = incidentAngleDeg * Math.PI / 180;
  const rayDir = new Vector(Math.cos(radI), -Math.sin(radI));
  
  const srcLen = 300;
  const S_vec = P_vec.sub(rayDir.mul(srcLen));
  
  const incidentRaySeg = { start: S_vec.toPoint(), end: P_vec.toPoint() };
  
  // Process Wavelengths
  const wavelengths = showWhiteLight ? SPECTRUM : [{
      color: getWavelengthColor(laserWavelength),
      lambda: laserWavelength,
      name: 'Laser'
  }]; 
  
  let stats = null;
  const rayPaths = [];
  
  for (const wave of wavelengths) {
      const n1 = 1.0;
      const n2 = getRefractiveIndex(wave.lambda);
      
      // Face 1 Normal: (-1, 0)
      const nAB = new Vector(-1, 0);
      
      // Refract 1
      const ref1 = snellsLaw(rayDir, nAB, n1, n2);
      
      const segments = [];
      let currentStats = { i: incidentAngleDeg, r: 0, r_prime: 0, i_prime: 0, D: 0, tir: false };
      
      // R1 (Angle of refraction)
      // Angle between Refracted Ray and Normal Inward (1, 0).
      // ref1 angle.
      if (ref1) {
          const r_rad = Math.asin(ref1.y); // Since x is approx 1? No.
          // Angle between (1, 0) and ref1.
          // dot = ref1.x * 1.
          // angle = acos(ref1.x). Check sign of y.
          const angleR1 = Math.atan2(ref1.y, ref1.x);
          currentStats.r = angleR1 * 180 / Math.PI;
          
          // Intersect with AC or BC
          // Primary target is AC
          let hit2 = solveIntersection(P_vec, ref1, A_vec, C_vec);
          let face2Normal = null;
          let hitBC = false;
          
          if (!hit2) {
              // Try BC (Base) - Just in case
               hit2 = solveIntersection(P_vec, ref1, B_vec, C_vec);
               hitBC = true;
          }
          
          if (hit2) {
              segments.push({ start: P_vec.toPoint(), end: hit2.toPoint() });
              
              // Normal at Face 2
              // AC Vector
              let faceVec = C_vec.sub(A_vec); 
              if (hitBC) faceVec = C_vec.sub(B_vec);
              
              // Outward Normal: Rotate -90 (Up-Right)
              // AC is Down-Right. Normal should be Up-Right.
              // (dx, dy) -> (dy, -dx).
              // If AC=(1, 1), Normal=(1, -1).
              // Wait. A=(0,0), C=(1,1). Vector (1,1).
              // Normal (1, -1) is Down-Right? No.
              // (1, -1) x is +, y is -.
              // Let's trust the logic:
              // Rotate -90 deg: x' = y, y' = -x.
              face2Normal = new Vector(faceVec.y, -faceVec.x).normalize();
              
              // Calculate r' (Internal Incidence)
              // Angle between RayInside and Normal2 (Inward).
              // Normal2 Outward is face2Normal.
              // Normal2 Inward is -face2Normal.
              // cos(r') = ref1 . (-face2Normal)
              const cosRPrime = ref1.dot(face2Normal.mul(-1));
              currentStats.r_prime = Math.acos(cosRPrime) * 180 / Math.PI;
              
              // Refract 2
              const ref2 = snellsLaw(ref1, face2Normal, n2, n1);
              
              if (ref2) {
                  // Success
                  const exitLen = 2000;
                  const E_vec = hit2.add(ref2.mul(exitLen));
                  segments.push({ start: hit2.toPoint(), end: E_vec.toPoint() });
                  
                  // Deviation
                  // Angle between RayIn and RayOut
                  const cosD = rayDir.dot(ref2);
                  const D_rad = Math.acos(cosD);
                  currentStats.D = D_rad * 180 / Math.PI;
                  
                  // i' (Emergence)
                  // Angle between Ref2 and Normal2 (Outward)
                  const cosIPrime = ref2.dot(face2Normal);
                  currentStats.i_prime = Math.acos(cosIPrime) * 180 / Math.PI;
                  
              } else {
                  // TIR
                  currentStats.tir = true;
                  // Reflect
                  // R = I - 2(I.N)N
                  // Normal is face2Normal (Inward? No, Surface Normal).
                  // I is ref1.
                  // We reflect off the surface.
                  // N must be consistent.
                  // dot = I.N
                  const dotRef = ref1.dot(face2Normal); // Usually > 0 if N is outward and I is outward-bound
                  const reflected = ref1.sub(face2Normal.mul(2 * dotRef));
                  
                  const tirLen = 2000;
                  const TIR_vec = hit2.add(reflected.mul(tirLen));
                  segments.push({ start: hit2.toPoint(), end: TIR_vec.toPoint() });
              }
              
          } else {
              // Missed prism (shouldn't happen with fixed geometry)
          }
      }
      
      rayPaths.push({
          segments,
          color: wave.color,
          alpha: currentStats.tir ? 0.3 : (showWhiteLight ? 0.4 : 0.8),
          width: showWhiteLight ? 1.5 : 4
      });
      
      // Correctly assign stats for the active ray
      if (showWhiteLight) {
          if (wave.name === 'Yellow') stats = currentStats;
      } else {
          // In laser mode, we take the stats from the laser ray
          stats = currentStats;
      }
  }
  
  return {
      geometry: { A: A_vec.toPoint(), B: B_vec.toPoint(), C: C_vec.toPoint(), P: P_vec.toPoint() },
      rays: rayPaths,
      incidentRay: incidentRaySeg,
      stats
  };
}
