export interface Point {
  x: number
  y: number
}

export interface Ray {
  origin: Point
  angle: number
  intensity: number
  wavelength: number
}

export interface Material {
  name: string
  refractiveIndex: number
  color: string
}

export class GeometricOpticsEngine {
  static calculateRefraction(angleIncidence: number, n1: number, n2: number): number | null {
    const sinR = (n1 / n2) * Math.sin(angleIncidence)

    if (Math.abs(sinR) > 1) {
      return null
    }

    return Math.asin(sinR)
  }

  static calculateReflection(angleIncidence: number): number {
    return angleIncidence
  }

  static getRayColor(wavelength: number): string {
    let r = 0
    let g = 0
    let b = 0
    let factor = 0

    if (wavelength >= 380 && wavelength < 440) {
      r = -(wavelength - 440) / (440 - 380)
      b = 1.0
    } else if (wavelength >= 440 && wavelength < 490) {
      g = (wavelength - 440) / (490 - 440)
      b = 1.0
    } else if (wavelength >= 490 && wavelength < 510) {
      g = 1.0
      b = -(wavelength - 510) / (510 - 490)
    } else if (wavelength >= 510 && wavelength < 580) {
      r = (wavelength - 510) / (580 - 510)
      g = 1.0
    } else if (wavelength >= 580 && wavelength < 645) {
      r = 1.0
      g = -(wavelength - 645) / (645 - 580)
    } else if (wavelength >= 645 && wavelength <= 780) {
      r = 1.0
    }

    if (wavelength >= 380 && wavelength < 420) {
      factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380)
    } else if (wavelength >= 420 && wavelength < 701) {
      factor = 1.0
    } else if (wavelength >= 701 && wavelength <= 780) {
      factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 701)
    }

    const ir = Math.round(255 * Math.pow(r * factor, 0.8))
    const ig = Math.round(255 * Math.pow(g * factor, 0.8))
    const ib = Math.round(255 * Math.pow(b * factor, 0.8))

    const toHex = (c: number) => c.toString(16).padStart(2, '0')
    return `#${toHex(ir)}${toHex(ig)}${toHex(ib)}`
  }

  static findIntersection(rayOrigin: Point, rayAngle: number, p1: Point, p2: Point): Point | null {
    const dx = Math.cos(rayAngle)
    const dy = Math.sin(rayAngle)

    const x1 = p1.x
    const y1 = p1.y
    const x2 = p2.x
    const y2 = p2.y

    const x3 = rayOrigin.x
    const y3 = rayOrigin.y
    const x4 = rayOrigin.x + dx
    const y4 = rayOrigin.y + dy

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (den === 0) return null

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den

    if (t >= 0 && t <= 1 && u > 0) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
      }
    }

    return null
  }
}
