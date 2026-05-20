/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

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
    width?: number;
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

// --- Refractive Index ---
export const SPECTRUM = [
  { color: '#8b5cf6', lambda: 400, name: 'Violet' },
  { color: '#6366f1', lambda: 445, name: 'Indigo' },
  { color: '#3b82f6', lambda: 475, name: 'Blue' },
  { color: '#22c55e', lambda: 520, name: 'Green' },
  { color: '#eab308', lambda: 570, name: 'Yellow' },
  { color: '#f97316', lambda: 600, name: 'Orange' },
  { color: '#ef4444', lambda: 650, name: 'Red' },
];

function getRefractiveIndex(wavelengthNm: number): number {
  // Cauchy's Equation for Crown Glass
  const lambdaMicrons = wavelengthNm / 1000;
  const A = 1.51;
  const B = 0.0045;
  return A + B / (lambdaMicrons * lambdaMicrons);
}

// --- Main Calculation ---
export function calculatePrism(
  width: number,
  height: number,
  incidentAngleDeg: number,
  prismAngleDeg: number,
  showWhiteLight: boolean
): SimulationResult {
  
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Geometry: Face 1 (AB) Vertical
  // Fixed Side Length
  const side = 180; // Smaller size
  
  // A (Top Left), B (Bottom Left)
  // Centered vertically
  const A_vec = new Vector(centerX - 40, centerY - side/2); // Adjusted horizontal position
  const B_vec = new Vector(centerX - 40, centerY + side/2);
  
  // C calculated from Prism Angle
  // Angle A is at vertex A?
  // If Face AB is vertical, and A is Top-Left.
  // Angle BAC = Prism Angle?
  // Wait, in standard prism (Apex Up), A is the top vertex.
  // Here we rotated it.
  // Let's define Vertex A as the Top-Left corner.
  // Face AB is the input face.
  // Angle at A is (90 - prismAngle)? No.
  // Let's assume "Prism Angle A" is the angle between Face 1 and Face 2.
  // Face 1 is Vertical (AB).
  // Face 2 (AC) starts at A.
  // Angle between AB (Down) and AC (?) is PrismAngle.
  // AB vector: (0, 1). 
  // AC vector: Rotate AB by -PrismAngle (CCW) -> Up-Right? No.
  // Standard Prism:
  //    A
  //   / \
  //  B---C
  // We rotate so AB is Vertical.
  // B is now Bottom, A is Top.
  // AC goes Down-Right.
  // Angle BAC = Prism Angle A.
  // Vector AB is (0, 1) [Down].
  // Vector AC is Rotate (0, 1) by -A? 
  // If A=60, AC points Down-Right (30 deg from vertical?).
  // Wait. A is Top vertex. B and C are bottom vertices.
  // A(0, -h), B(-w, h), C(w, h).
  // Rotate -90.
  // A is Left-Mid?
  // Let's stick to the visual "Vertical Face" plan.
  // Face 1 is Vertical. Incident light hits it.
  // Face 2 is angled relative to Face 1 by angle A.
  // So Angle(Face1, Face2) = A.
  // Face 1 Normal: (-1, 0).
  // Face 2 Normal: Rotate Face 1 Normal by A? 
  // Yes. If A=60, Normal 2 is (-1, 0) rotated by 60? No.
  // Let's use vectors.
  // A = (X, Y_top). B = (X, Y_bot). Vector AB = (0, L).
  // AC length = L/cos(A)? No, standard prism is isosceles or equilateral. Assume Equilateral side L.
  // Vector AC. Length L. Angle from AB is A.
  // Vector AB direction is "Down" (0, 1) in canvas.
  // Vector AC direction is "Down-Right". Angle A relative to AB.
  // So AC Angle = 90 - A (relative to X axis)? No.
  // X axis is 0. Y (Down) is 90.
  // AB is 90.
  // AC is 90 - A.
  
  const radA = prismAngleDeg * Math.PI / 180;
  const angleAC = Math.PI/2 - radA; // 90 - A
  
  const C_vec = new Vector(
      A_vec.x + side * Math.cos(angleAC),
      A_vec.y + side * Math.sin(angleAC)
  );
  
  // Target Point P on Face AB (Midpoint)
  const P_vec = A_vec.add(B_vec).mul(0.5);
  
  // Incident Ray
  // Angle i relative to Normal.
  // Normal is Left (-1, 0).
  // Ray comes from Top-Left.
  // Angle i is between Ray and Normal.
  // Ray Vector: (cos(theta), sin(theta)).
  // Normal Angle = 180 deg.
  // Ray Angle = 180 - i? (Below normal). No, Top-Left source means Ray points Down-Right.
  // Normal (-1, 0).
  // We want Ray to be "Down" from the normal line extended? No.
  // Standard Diagram:
  //      \
  //       \ Ray
  // _______P_______ Normal
  // 
  // Ray Angle = i (relative to normal).
  // If Normal is Horizontal Left.
  // "Standard" i usually means angle from normal.
  // If i=0, Ray is Horizontal Right (along normal).
  // If i=45, Ray is Down-Right (45 deg).
  // So Ray Dir Angle = 0 + i? (Since Normal points Left, Incoming points Right).
  // Incoming Direction (Ideal) is (1, 0).
  // If i > 0, we rotate (1, 0) by +i (Clockwise/Down).
  // So Ray Dir = (cos i, sin i).
  
  const radI = incidentAngleDeg * Math.PI / 180;
  const rayDir = new Vector(Math.cos(radI), -Math.sin(radI));
  
  // Source Point S (for drawing)
  const srcLen = 300;
  const S_vec = P_vec.sub(rayDir.mul(srcLen));
  
  const incidentRaySeg = { start: S_vec.toPoint(), end: P_vec.toPoint() };
  
  // Process Wavelengths
  const wavelengths = showWhiteLight ? SPECTRUM : [SPECTRUM[6]]; // Red default
  
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
                  const exitLen = 400;
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
                  
                  const tirLen = 200;
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
          alpha: currentStats.tir ? 0.5 : 0.8,
          width: showWhiteLight ? 2 : 3
      });
      
      if ((showWhiteLight && wave.name === 'Yellow') || (!showWhiteLight && wave.name === 'Red')) {
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
