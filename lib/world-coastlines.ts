/**
 * Procedural geographic coastline polygons & dotted landmass matrix generator
 * for the holographic WebGL Earth globe (zero external asset dependencies).
 * Coordinates are [latitude, longitude] in degrees.
 */

export type LatLon = readonly [number, number];

const CONTINENT_POLYGONS: readonly (readonly LatLon[])[] = [
  // North America
  [
    [70, -162], [71, -156], [70, -141], [69, -135], [68, -120], [70, -108],
    [68, -94], [64, -82], [62, -76], [58, -64], [52, -55], [47, -53],
    [45, -60], [44, -66], [42, -70], [40, -74], [35, -75], [30, -81],
    [25, -80], [25, -82], [29, -84], [30, -89], [28, -96], [22, -97],
    [18, -94], [21, -90], [21, -87], [16, -88], [15, -83], [11, -83],
    [9, -79], [8, -77], [8, -81], [10, -85], [14, -92], [16, -98],
    [20, -105], [24, -108], [31, -114], [24, -110], [28, -114], [32, -117],
    [37, -122], [42, -124], [48, -125], [54, -131], [59, -138], [60, -148],
    [56, -158], [55, -162], [60, -166], [64, -165], [66, -166],
  ],
  // Greenland
  [
    [82, -32], [81, -18], [76, -19], [70, -22], [65, -39], [60, -44],
    [64, -52], [69, -53], [75, -58], [78, -70], [82, -52],
  ],
  // South America
  [
    [11, -74], [12, -71], [10, -64], [9, -60], [6, -55], [2, -50],
    [-1, -47], [-5, -35], [-10, -36], [-15, -39], [-22, -41], [-26, -48],
    [-33, -53], [-38, -57], [-42, -64], [-47, -66], [-52, -68], [-55, -67],
    [-54, -72], [-49, -75], [-42, -74], [-35, -72], [-27, -71], [-18, -70],
    [-13, -76], [-6, -81], [-1, -80], [4, -77], [8, -77],
  ],
  // Africa
  [
    [36, -6], [37, 10], [33, 12], [32, 20], [31, 32], [27, 34],
    [20, 38], [13, 43], [11, 51], [4, 47], [-2, 41], [-10, 40],
    [-17, 38], [-25, 34], [-34, 25], [-34, 18], [-26, 15], [-18, 12],
    [-10, 13], [-4, 11], [4, 9], [6, 3], [5, -4], [6, -11],
    [12, -16], [16, -16], [22, -17], [28, -13], [33, -8],
  ],
  // Madagascar
  [
    [-12, 49], [-16, 50], [-24, 47], [-25, 44], [-18, 44],
  ],
  // Europe (Western, Central, Scandinavia)
  [
    [36, -9], [43, -9], [43, -2], [47, -4], [49, -2], [51, 2],
    [54, 8], [57, 9], [59, 11], [63, 6], [68, 15], [71, 25],
    [69, 32], [66, 40], [60, 30], [59, 24], [55, 21], [54, 14],
    [56, 17], [60, 18], [65, 22], [62, 21], [59, 17], [55, 13],
    [53, 10], [48, 17], [45, 14], [44, 12], [40, 18], [38, 16],
    [40, 14], [43, 10], [43, 5], [41, 2], [37, -1], [36, -6],
  ],
  // Great Britain & Ireland
  [
    [58, -5], [57, -2], [53, 0], [51, 1], [50, -5], [54, -4],
  ],
  // Eurasia / Asia main landmass
  [
    [41, 29], [42, 36], [42, 42], [45, 38], [46, 32], [48, 39],
    [56, 38], [67, 42], [69, 60], [72, 72], [75, 92], [77, 105],
    [73, 125], [70, 145], [68, 172], [65, 178], [60, 165], [53, 158],
    [55, 140], [52, 141], [44, 135], [40, 128], [35, 128], [38, 125],
    [40, 120], [36, 120], [31, 122], [24, 118], [21, 110], [18, 106],
    [12, 109], [9, 105], [13, 101], [7, 101], [2, 104], [6, 99],
    [14, 98], [17, 96], [22, 91], [20, 86], [13, 80], [8, 77],
    [15, 74], [22, 70], [24, 67], [25, 60], [27, 56], [24, 52],
    [22, 59], [16, 53], [13, 44], [20, 39], [28, 35], [32, 35],
    [36, 36], [37, 27],
  ],
  // Japan
  [
    [44, 144], [41, 141], [36, 140], [33, 131], [35, 136], [40, 140],
  ],
  // Indonesia / Borneo / Sumatra
  [
    [5, 95], [-5, 105], [-7, 114], [-4, 117], [5, 118], [2, 109],
  ],
  // Australia
  [
    [-12, 131], [-12, 136], [-15, 136], [-12, 142], [-18, 146], [-26, 153],
    [-35, 151], [-38, 145], [-35, 136], [-32, 129], [-34, 115], [-26, 113],
    [-20, 119], [-15, 125],
  ],
  // New Zealand
  [
    [-35, 174], [-41, 176], [-46, 168], [-42, 171],
  ],
  // Antarctica rim
  [
    [-68, -180], [-72, -130], [-74, -85], [-65, -60], [-70, -15],
    [-69, 30], [-67, 80], [-67, 135], [-72, 170], [-68, 180],
    [-83, 180], [-83, -180],
  ],
];

/**
 * Convert geographic latitude / longitude (degrees) to 3D Cartesian coordinates.
 * Rotated so lon = 0 faces +Z when globe rotation.y = 0.
 */
export function latLonToVector3(
  latDeg: number,
  lonDeg: number,
  radius: number,
  target?: [number, number, number]
): [number, number, number] {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  const x = radius * cosLat * Math.sin(lon);
  const y = radius * Math.sin(lat);
  const z = radius * cosLat * Math.cos(lon);
  if (target) {
    target[0] = x;
    target[1] = y;
    target[2] = z;
    return target;
  }
  return [x, y, z];
}

function pointInPolygon(lat: number, lon: number, poly: readonly LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0];
    const xi = poly[i][1];
    const yj = poly[j][0];
    const xj = poly[j][1];

    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isLandPoint(lat: number, lon: number): boolean {
  for (let i = 0; i < CONTINENT_POLYGONS.length; i++) {
    if (pointInPolygon(lat, lon, CONTINENT_POLYGONS[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Builds line-segment pairs along continent coastlines for crisp holographic wireframe edges.
 */
export function buildContinentCoastlinePositions(radius: number): Float32Array {
  const coords: number[] = [];
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [0, 0, 0];

  for (const poly of CONTINENT_POLYGONS) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      // Avoid drawing horizontal wrap-around line across Antarctica ±180 seam
      if (Math.abs(p1[1] - p2[1]) > 180) continue;

      latLonToVector3(p1[0], p1[1], radius, a);
      latLonToVector3(p2[0], p2[1], radius, b);
      coords.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  return new Float32Array(coords);
}

/**
 * Generates ordered geodesic scanline stipple dots strictly inside landmass polygons,
 * recreating the finely textured holographic wireframe continent look.
 */
export function buildContinentDotData(radius: number): {
  positions: Float32Array;
  weights: Float32Array;
} {
  const positions: number[] = [];
  const weights: number[] = [];
  const tmp: [number, number, number] = [0, 0, 0];

  const latStep = 2.05;
  for (let lat = -80; lat <= 82; lat += latStep) {
    const cosLat = Math.max(0.18, Math.cos((lat * Math.PI) / 180));
    const lonStep = 2.05 / cosLat;

    for (let lon = -180; lon < 180; lon += lonStep) {
      if (isLandPoint(lat, lon)) {
        latLonToVector3(lat, lon, radius, tmp);
        positions.push(tmp[0], tmp[1], tmp[2]);

        // Deterministic intensity modulation so landmasses have rich digital texture
        const pulseWeight =
          0.55 +
          0.45 *
            Math.abs(
              Math.sin(lat * 0.37 + lon * 0.21) * Math.cos(lon * 0.14 - lat * 0.19)
            );
        weights.push(pulseWeight);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    weights: new Float32Array(weights),
  };
}
