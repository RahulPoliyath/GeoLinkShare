'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import * as THREE from 'three';
import { motion } from 'motion/react';
import { ArrowRight, Compass } from 'lucide-react';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AnimatedNumber, MaskedReveal } from './MotionPrimitives';

interface HeroGlobeWebGLProps {
  onStartShortening: () => void;
  onViewAnalytics: () => void;
  linksCount: number;
}

// Pre-allocated math helpers outside the render loop (zero per-frame GC)
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0.25, 1).normalize(), 0);
const _rayHit = new THREE.Vector3();

// Compact continent polygon outlines [lon, lat] in degrees for procedural landmass wireframe & coastal particles
const CONTINENT_POLYGONS: Array<Array<[number, number]>> = [
  // North & Central America
  [
    [-168, 65], [-160, 71], [-140, 70], [-125, 72], [-100, 74], [-82, 70],
    [-76, 62], [-64, 60], [-55, 52], [-64, 44], [-74, 40], [-81, 31],
    [-81, 25], [-88, 21], [-83, 10], [-78, 8], [-85, 11], [-92, 15],
    [-105, 20], [-112, 29], [-117, 32], [-124, 40], [-125, 49], [-136, 58],
    [-152, 60], [-164, 55],
  ],
  // Greenland
  [
    [-56, 60], [-44, 60], [-36, 66], [-20, 74], [-22, 82], [-48, 83],
    [-68, 78], [-58, 69],
  ],
  // South America
  [
    [-78, 10], [-72, 12], [-62, 10], [-50, 2], [-35, -6], [-38, -14],
    [-40, -22], [-48, -28], [-54, -34], [-63, -41], [-67, -50], [-69, -55],
    [-74, -52], [-73, -40], [-71, -30], [-70, -18], [-77, -12], [-81, -5],
    [-79, 2],
  ],
  // Europe
  [
    [-9, 37], [-9, 43], [-2, 44], [-4, 48], [2, 51], [8, 54], [10, 58],
    [5, 61], [15, 69], [28, 71], [40, 67], [58, 68], [60, 55], [46, 48],
    [38, 45], [29, 41], [23, 38], [16, 38], [12, 44], [6, 43], [0, 39],
    [-5, 36],
  ],
  // UK & Ireland
  [[-6, 50], [1, 51], [1, 55], [-3, 59], [-7, 57], [-10, 52]],
  // Africa
  [
    [-17, 15], [-13, 28], [-6, 36], [10, 37], [25, 32], [33, 31], [43, 12],
    [51, 12], [47, 2], [40, -6], [40, -16], [35, -25], [28, -33], [18, -35],
    [14, -22], [12, -12], [9, 4], [2, 6], [-8, 5], [-15, 11],
  ],
  // Madagascar
  [[44, -25], [49, -24], [50, -15], [49, -12], [44, -17]],
  // Asia & Middle East
  [
    [35, 36], [45, 42], [58, 55], [75, 72], [105, 77], [138, 73], [174, 66],
    [162, 55], [142, 52], [132, 42], [126, 35], [121, 30], [116, 22], [108, 16],
    [104, 2], [98, 14], [91, 22], [80, 10], [72, 20], [66, 25], [56, 26],
    [48, 29], [43, 13], [35, 29],
  ],
  // Japan
  [[130, 31], [136, 34], [141, 38], [145, 44], [141, 45], [137, 37], [131, 34]],
  // Southeast Asia Islands (Borneo/Sumatra/Java)
  [[96, 5], [105, -6], [115, -8], [118, 4], [110, 1], [103, 1]],
  // Australia
  [
    [114, -22], [122, -16], [132, -12], [137, -15], [142, -11], [146, -18],
    [153, -27], [150, -37], [141, -38], [135, -34], [128, -32], [116, -34],
    [113, -27],
  ],
  // Antarctica crest
  [
    [-180, -72], [-120, -74], [-60, -65], [-30, -73], [30, -69], [90, -67],
    [150, -70], [180, -72], [180, -86], [-180, -86],
  ],
];

function pointInPolygon(lon: number, lat: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function minDistanceToEdges(lon: number, lat: number, poly: Array<[number, number]>): number {
  let minD = 999;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0];
    const ay = poly[j][1];
    const bx = poly[i][0];
    const by = poly[i][1];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1e-6;
    const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / lenSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(lon - px, lat - py);
    if (d < minD) minD = d;
  }
  return minD;
}

function lonLatToVec3(lonDeg: number, latDeg: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  return out;
}

function createVolumetricGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0.0, 'rgba(110, 245, 255, 0.72)');
    grad.addColorStop(0.28, 'rgba(18, 185, 255, 0.36)');
    grad.addColorStop(0.62, 'rgba(10, 75, 195, 0.12)');
    grad.addColorStop(1.0, 'rgba(2, 8, 18, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function HeroGlobeWebGL({
  onStartShortening,
  onViewAnalytics,
  linksCount,
}: HeroGlobeWebGLProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const vectorReadoutRef = useRef<HTMLSpanElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    const markWebglUnavailable = () => {
      Promise.resolve().then(() => {
        if (!disposed) setWebglUnavailable(true);
      });
    };

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      markWebglUnavailable();
      return () => {
        disposed = true;
      };
    }

    // 1. Detect software WebGL cleanly using renderer string (SKILL.md §2.1)
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) {
        markWebglUnavailable();
        return () => {
          disposed = true;
        };
      }
      const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
      const param = debugExt ? debugExt.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const rendererStr = String(gl.getParameter(param) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
    } catch {
      markWebglUnavailable();
      return () => {
        disposed = true;
      };
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      markWebglUnavailable();
      return () => {
        disposed = true;
      };
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || 560;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x020812, 1);

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020812);
    scene.fog = new THREE.FogExp2(0x020812, 0.042);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(0, 0.72, 10.6);
    camera.lookAt(0, -0.05, 0);

    // Track disposables cleanly
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];
    const texturesToDispose: THREE.Texture[] = [];

    // 2. Volumetric Atmospheric Halo Behind Globe
    const glowTex = createVolumetricGlowTexture();
    texturesToDispose.push(glowTex);

    const haloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x16b8ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    materialsToDispose.push(haloMat);

    const backHalo = new THREE.Sprite(haloMat);
    backHalo.position.set(0, 0.28, -1.6);
    backHalo.scale.set(10.5, 9.2, 1);
    scene.add(backHalo);

    const crestMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x67f2ff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    materialsToDispose.push(crestMat);

    const crestHalo = new THREE.Sprite(crestMat);
    crestHalo.position.set(0, 1.55, 0.3);
    crestHalo.scale.set(5.4, 3.1, 1);
    scene.add(crestHalo);

    // 3. Central Composite Rotating Wireframe & Continent Globe (THREE.Group)
    const globeGroup = new THREE.Group();
    globeGroup.position.set(0, 0.28, 0);
    // Initial tilt showing Americas + Europe/Africa clearly like the reference visual
    globeGroup.rotation.set(0.18, -0.95, 0.08);
    scene.add(globeGroup);

    const GLOBE_RADIUS = 2.02;

    // 3a. Dark core occlusion sphere (separates front hemisphere cleanly from back arcs)
    const coreGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 0.985, 48, 48);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x020b18,
      transparent: true,
      opacity: 0.78,
    });
    geometriesToDispose.push(coreGeo);
    materialsToDispose.push(coreMat);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    globeGroup.add(coreMesh);

    // 3b. Volumetric Fresnel Rim Atmosphere Shell
    const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.035, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform float uTime;
        void main() {
          float rim = 1.0 - max(0.0, dot(vViewDir, vNormal));
          float fresnel = pow(rim, 3.2);
          float topArc = smoothstep(-0.2, 0.95, vNormal.y);
          vec3 deepBlue = vec3(0.04, 0.36, 0.85);
          vec3 brightCyan = vec3(0.32, 0.96, 1.0);
          vec3 col = mix(deepBlue, brightCyan, clamp(fresnel * 0.9 + topArc * 0.45, 0.0, 1.0));
          float pulse = 0.92 + 0.08 * sin(uTime * 1.4);
          gl_FragColor = vec4(col * pulse, fresnel * 0.72);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    geometriesToDispose.push(atmosGeo);
    materialsToDispose.push(atmosMat);
    globeGroup.add(new THREE.Mesh(atmosGeo, atmosMat));

    // 3c. Fine Lat/Lon Wireframe Lattice
    const latticeVerts: number[] = [];
    const latStep = 15;
    const lonStep = 15;
    const segs = 64;
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();

    for (let lat = -75; lat <= 75; lat += latStep) {
      for (let i = 0; i < segs; i++) {
        const l1 = -180 + (i / segs) * 360;
        const l2 = -180 + ((i + 1) / segs) * 360;
        lonLatToVec3(l1, lat, GLOBE_RADIUS, tmpA);
        lonLatToVec3(l2, lat, GLOBE_RADIUS, tmpB);
        latticeVerts.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z);
      }
    }
    for (let lon = -180; lon < 180; lon += lonStep) {
      for (let i = 0; i < segs / 2; i++) {
        const lat1 = -90 + (i / (segs / 2)) * 180;
        const lat2 = -90 + ((i + 1) / (segs / 2)) * 180;
        lonLatToVec3(lon, lat1, GLOBE_RADIUS, tmpA);
        lonLatToVec3(lon, lat2, GLOBE_RADIUS, tmpB);
        latticeVerts.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z);
      }
    }
    const latticeGeo = new THREE.BufferGeometry();
    latticeGeo.setAttribute('position', new THREE.Float32BufferAttribute(latticeVerts, 3));
    const latticeMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    geometriesToDispose.push(latticeGeo);
    materialsToDispose.push(latticeMat);
    globeGroup.add(new THREE.LineSegments(latticeGeo, latticeMat));

    // 3d. Glowing Continent Coastline Outlines
    const coastVerts: number[] = [];
    for (const poly of CONTINENT_POLYGONS) {
      for (let i = 0; i < poly.length; i++) {
        const [lon1, lat1] = poly[i];
        const [lon2, lat2] = poly[(i + 1) % poly.length];
        // Subdivide segments so borders hug globe curvature seamlessly
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          const t1 = s / steps;
          const t2 = (s + 1) / steps;
          lonLatToVec3(lon1 + (lon2 - lon1) * t1, lat1 + (lat2 - lat1) * t1, GLOBE_RADIUS * 1.008, tmpA);
          lonLatToVec3(lon1 + (lon2 - lon1) * t2, lat1 + (lat2 - lat1) * t2, GLOBE_RADIUS * 1.008, tmpB);
          coastVerts.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z);
        }
      }
    }
    const coastGeo = new THREE.BufferGeometry();
    coastGeo.setAttribute('position', new THREE.Float32BufferAttribute(coastVerts, 3));
    const coastMat = new THREE.LineBasicMaterial({
      color: 0x4ef2ff,
      transparent: true,
      opacity: 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    geometriesToDispose.push(coastGeo);
    materialsToDispose.push(coastMat);
    globeGroup.add(new THREE.LineSegments(coastGeo, coastMat));

    // 3e. Procedural Earth Continent Dotted Particles (Fibonacci + coast density)
    const globePositions: number[] = [];
    const globeWeights: number[] = [];
    const TOTAL_TEST_POINTS = 26000;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < TOTAL_TEST_POINTS; i++) {
      const y = 1 - (i / (TOTAL_TEST_POINTS - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = (2 * Math.PI * i) / goldenRatio;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      const lat = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI);
      const lon = Math.atan2(z, -x) * (180 / Math.PI) - 180;
      const normLon = ((lon + 540) % 360) - 180;

      let inside = false;
      let minCoastDist = 99;
      for (const poly of CONTINENT_POLYGONS) {
        if (pointInPolygon(normLon, lat, poly)) {
          inside = true;
          const d = minDistanceToEdges(normLon, lat, poly);
          if (d < minCoastDist) minCoastDist = d;
        }
      }

      if (inside) {
        lonLatToVec3(normLon, lat, GLOBE_RADIUS * 1.006, tmpA);
        globePositions.push(tmpA.x, tmpA.y, tmpA.z);
        // Coastlines get higher brightness weight (~1.0), interiors subtle (~0.35 - 0.65)
        const edgeBoost = Math.max(0.28, 1.0 - minCoastDist / 5.5);
        globeWeights.push(edgeBoost);
      } else if (i % 17 === 0) {
        // Sparse faint ocean lattice dots for depth
        lonLatToVec3(normLon, lat, GLOBE_RADIUS * 0.996, tmpA);
        globePositions.push(tmpA.x, tmpA.y, tmpA.z);
        globeWeights.push(0.14);
      }
    }

    const globePtsGeo = new THREE.BufferGeometry();
    globePtsGeo.setAttribute('position', new THREE.Float32BufferAttribute(globePositions, 3));
    globePtsGeo.setAttribute('aWeight', new THREE.Float32BufferAttribute(globeWeights, 1));

    const globePtsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute float aWeight;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vWeight;
        varying float vFacing;
        void main() {
          vWeight = aWeight;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vec3 viewNormal = normalize(normalMatrix * normalize(position));
          vFacing = smoothstep(-0.35, 0.65, viewNormal.z);
          float twinkle = 0.88 + 0.12 * sin(uTime * 2.2 + position.x * 4.5 + position.y * 3.1);
          gl_PointSize = (2.2 + aWeight * 2.1) * uPixelRatio * twinkle * (10.5 / max(1.0, -mvPos.z));
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vWeight;
        varying float vFacing;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float glow = exp(-dist * dist * 13.0);
          vec3 deepBlue = vec3(0.05, 0.44, 0.96);
          vec3 neonCyan = vec3(0.36, 0.96, 1.0);
          vec3 color = mix(deepBlue, neonCyan, clamp(vWeight * 1.15, 0.0, 1.0));
          float alpha = glow * mix(0.2, 0.98, vWeight) * mix(0.14, 1.0, vFacing);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    geometriesToDispose.push(globePtsGeo);
    materialsToDispose.push(globePtsMat);
    globeGroup.add(new THREE.Points(globePtsGeo, globePtsMat));

    // 3f. Internal Sweeping Data Arcs (matching the delicate internal filaments inside the globe)
    const arcVerts: number[] = [];
    const hubCoords: Array<[number, number]> = [
      [-74, 40.7], [-122, 37.7], [-46, -23.5], [0.1, 51.5], [13.4, 52.5],
      [72.87, 19.07], [139.7, 35.6], [103.8, 1.3], [151.2, -33.8], [31.2, 30.0],
    ];
    for (let i = 0; i < hubCoords.length; i++) {
      for (let j = i + 1; j < hubCoords.length; j += 2) {
        const p1 = lonLatToVec3(hubCoords[i][0], hubCoords[i][1], GLOBE_RADIUS * 0.99, new THREE.Vector3());
        const p2 = lonLatToVec3(hubCoords[j][0], hubCoords[j][1], GLOBE_RADIUS * 0.99, new THREE.Vector3());
        const mid = p1.clone().add(p2).multiplyScalar(0.32); // chord dips inside globe like neural filaments
        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
        const pts = curve.getPoints(24);
        for (let k = 0; k < pts.length - 1; k++) {
          arcVerts.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
        }
      }
    }
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcVerts, 3));
    const arcMat = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    geometriesToDispose.push(arcGeo);
    materialsToDispose.push(arcMat);
    globeGroup.add(new THREE.LineSegments(arcGeo, arcMat));

    // 4. Dense Interactive Flowing Digital River Particle Field (~9,200 particles in 68 braided stream lanes)
    const STREAM_LANES = 68;
    const PARTICLES_PER_LANE = 136;
    const TOTAL_STREAM_PARTICLES = STREAM_LANES * PARTICLES_PER_LANE;

    const streamSeeds = new Float32Array(TOTAL_STREAM_PARTICLES * 3); // base position seed
    const streamParams = new Float32Array(TOTAL_STREAM_PARTICLES * 4); // [laneNorm, tNorm, speed, colorMix]

    for (let lane = 0; lane < STREAM_LANES; lane++) {
      const laneNorm = lane / (STREAM_LANES - 1); // 0 (back) -> 1 (front foreground)
      const zLane = THREE.MathUtils.lerp(-6.6, 5.4, Math.pow(laneNorm, 1.08));
      const speedBase = (0.36 + (lane % 5) * 0.08 + laneNorm * 0.22) * (lane % 9 === 0 ? 0.72 : 1.0);
      const laneColorBias = 0.25 + 0.75 * Math.sin(lane * 0.45) * 0.5 + 0.25;

      for (let p = 0; p < PARTICLES_PER_LANE; p++) {
        const idx = lane * PARTICLES_PER_LANE + p;
        const tNorm = p / PARTICLES_PER_LANE;
        const xSpan = THREE.MathUtils.lerp(-14.5, 14.5, tNorm);
        const jitterY = (Math.sin(idx * 12.9898) * 43758.5453) % 1;
        const jitterZ = (Math.sin(idx * 78.233) * 19341.123) % 1;

        streamSeeds[idx * 3] = xSpan;
        streamSeeds[idx * 3 + 1] = jitterY * 0.18;
        streamSeeds[idx * 3 + 2] = zLane + jitterZ * 0.26;

        streamParams[idx * 4] = laneNorm;
        streamParams[idx * 4 + 1] = tNorm;
        streamParams[idx * 4 + 2] = speedBase;
        streamParams[idx * 4 + 3] = Math.min(1, Math.max(0, laneColorBias));
      }
    }

    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute('position', new THREE.BufferAttribute(streamSeeds, 3));
    streamGeo.setAttribute('aStreamParam', new THREE.BufferAttribute(streamParams, 4));

    const streamMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uCursorWorld: { value: new THREE.Vector3(0, 0, 0) },
        uCursorStrength: { value: 0 },
        uFocusDepth: { value: 10.6 }, // matches camera-to-globe focal distance
      },
      vertexShader: `
        attribute vec4 aStreamParam;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec3 uCursorWorld;
        uniform float uCursorStrength;
        uniform float uFocusDepth;

        varying float vColorMix;
        varying float vDofBlur;
        varying float vAlpha;
        varying float vCursorGlow;

        void main() {
          float laneNorm = aStreamParam.x;
          float tNorm = aStreamParam.y;
          float speed = aStreamParam.z;
          float colorBias = aStreamParam.w;

          // Continuous river drift wrapping smoothly across [-14.5, +14.5]
          float wrappedX = mod(position.x + 14.5 + uTime * speed, 29.0) - 14.5;
          float zBase = position.z;

          // Digital river topography: sweeps up behind/around globe & drapes smoothly outward in foreground
          float centerPull = exp(-(wrappedX * wrappedX) / 14.0);
          float globeWrap = exp(-(wrappedX * wrappedX + zBase * zBase) / 11.5);
          float wingWave = sin(wrappedX * 0.42 - uTime * 0.65 + laneNorm * 6.2831) * 0.68
                         + cos(wrappedX * 0.78 + zBase * 0.55 - uTime * 0.9) * 0.28;

          // Foreground rivers cascade cleanly downward toward camera corners, matching reference image
          float foregroundSlope = -smoothstep(0.35, 1.0, laneNorm) * 2.35;
          float centralCrest = centerPull * (1.28 - abs(zBase) * 0.14);
          float yPos = foregroundSlope + centralCrest + wingWave * (0.45 + 0.55 * (1.0 - centerPull)) + position.y;

          // Fan lanes slightly outward in foreground for dramatic perspective tracks
          float spreadX = wrappedX * (1.0 + smoothstep(0.45, 1.0, laneNorm) * 0.24);
          vec3 worldPos = vec3(spreadX, yPos - 0.55, zBase);

          // Converge subtly around the central sphere hull (avoid intersecting inside solid center)
          vec3 globeCenter = vec3(0.0, 0.28, 0.0);
          vec3 toCenter = worldPos - globeCenter;
          float distGlobe = length(toCenter);
          if (distGlobe < 2.28) {
            worldPos = globeCenter + normalize(toCenter + vec3(0.001, 0.01, 0.001)) * 2.28;
          }

          // Invisible Cursor Force: smooth fluid repulsion + radial wake ripple
          vec3 dCursor = worldPos - uCursorWorld;
          float cursorDist = length(dCursor);
          float forceRadius = 3.4;
          float forceMask = exp(-(cursorDist * cursorDist) / (forceRadius * forceRadius * 0.42)) * uCursorStrength;
          vec3 pushDir = normalize(dCursor + vec3(0.0, 0.18, 0.25));
          worldPos += pushDir * forceMask * 1.15;
          worldPos.y += sin(cursorDist * 3.0 - uTime * 6.0) * forceMask * 0.22;

          vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
          float camDist = max(1.2, -mvPos.z);

          // Subtle Depth of Field: crisp around focal plane (~10.6), softer bokeh near foreground or far background
          float dofDelta = abs(camDist - uFocusDepth);
          vDofBlur = smoothstep(1.2, 6.2, dofDelta);

          // Edge & wrap-boundary fade so streams materialize and vanish seamlessly
          float edgeFade = smoothstep(14.4, 9.6, abs(wrappedX));
          float depthFade = smoothstep(19.5, 10.5, camDist);
          vAlpha = edgeFade * depthFade * (0.42 + 0.58 * globeWrap + 0.28 * laneNorm);

          vColorMix = clamp(colorBias * 0.55 + globeWrap * 0.55 + forceMask * 0.45, 0.0, 1.0);
          vCursorGlow = forceMask;

          float baseSize = mix(2.2, 4.4, laneNorm) + vDofBlur * 2.4 + globeWrap * 1.1;
          gl_PointSize = baseSize * uPixelRatio * (10.5 / camDist);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vColorMix;
        varying float vDofBlur;
        varying float vAlpha;
        varying float vCursorGlow;

        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;

          // Sharper pinpoint at focal plane, smoother bokeh halo out-of-focus
          float sharpness = mix(15.0, 5.5, vDofBlur);
          float intensity = exp(-d * d * sharpness);

          vec3 deepCobalt = vec3(0.03, 0.34, 0.86);
          vec3 brightCyan = vec3(0.14, 0.90, 1.0);
          vec3 hotCore = vec3(0.74, 0.99, 1.0);

          vec3 col = mix(deepCobalt, brightCyan, vColorMix);
          col = mix(col, hotCore, clamp(intensity * 0.45 + vCursorGlow * 0.5, 0.0, 1.0));

          float dofDim = mix(1.0, 0.58, vDofBlur);
          gl_FragColor = vec4(col, intensity * vAlpha * dofDim);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    geometriesToDispose.push(streamGeo);
    materialsToDispose.push(streamMat);
    const streamPoints = new THREE.Points(streamGeo, streamMat);
    scene.add(streamPoints);

    // 5. Post-Processing Bloom on GPU Devices Only (SKILL.md §2.1 & postprocessing.md)
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.48, 0.35);
      composer.addPass(bloomPass);
    }

    // Pre-warm shaders once on GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 6. Cursor Tracking & Smooth Exponential Damping State
    const pointerTargetNdc = { x: 0, y: 0, active: false };
    const pointerSmoothNdc = { x: 0, y: 0 };
    const cursorWorldSmooth = new THREE.Vector3(0, 0, 0);
    let cursorStrengthSmooth = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1) {
        pointerTargetNdc.x = nx;
        pointerTargetNdc.y = ny;
        pointerTargetNdc.active = true;
        if (vectorReadoutRef.current) {
          const sx = (nx >= 0 ? '+' : '') + nx.toFixed(2);
          const sy = (ny >= 0 ? '+' : '') + ny.toFixed(2);
          vectorReadoutRef.current.textContent = `Field Vector ${sx}, ${sy}`;
        }
      } else {
        pointerTargetNdc.active = false;
      }
    };

    const handlePointerLeave = () => {
      pointerTargetNdc.active = false;
      if (vectorReadoutRef.current) {
        vectorReadoutRef.current.textContent = 'Move cursor to ripple streams';
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    const handleResize = () => {
      if (!container) return;
      const nextW = container.clientWidth || window.innerWidth;
      const nextH = container.clientHeight || 560;
      const nextPr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(nextPr);
      renderer.setSize(nextW, nextH);
      streamMat.uniforms.uPixelRatio.value = nextPr;
      globePtsMat.uniforms.uPixelRatio.value = nextPr;

      if (composer && bloomPass) {
        composer.setSize(nextW, nextH);
        bloomPass.resolution.set(nextW, nextH);
      }
    };
    window.addEventListener('resize', handleResize);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    // 7. Paced Render Loop (GPU: requestAnimationFrame; Software WebGL: afterDraw(tick))
    const clock = new THREE.Clock();
    let frameId = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      // Smooth cursor damping
      pointerSmoothNdc.x = THREE.MathUtils.damp(
        pointerSmoothNdc.x,
        pointerTargetNdc.active ? pointerTargetNdc.x : 0,
        4.5,
        delta
      );
      pointerSmoothNdc.y = THREE.MathUtils.damp(
        pointerSmoothNdc.y,
        pointerTargetNdc.active ? pointerTargetNdc.y : 0,
        4.5,
        delta
      );

      cursorStrengthSmooth = THREE.MathUtils.damp(
        cursorStrengthSmooth,
        pointerTargetNdc.active ? 1.0 : 0.0,
        5.0,
        delta
      );

      if (pointerTargetNdc.active) {
        _ndc.set(pointerSmoothNdc.x, pointerSmoothNdc.y);
        _raycaster.setFromCamera(_ndc, camera);
        if (_raycaster.ray.intersectPlane(_interactionPlane, _rayHit)) {
          cursorWorldSmooth.x = THREE.MathUtils.damp(cursorWorldSmooth.x, _rayHit.x, 7.5, delta);
          cursorWorldSmooth.y = THREE.MathUtils.damp(cursorWorldSmooth.y, _rayHit.y, 7.5, delta);
          cursorWorldSmooth.z = THREE.MathUtils.damp(cursorWorldSmooth.z, _rayHit.z, 7.5, delta);
        }
      }

      // Subtle camera parallax response
      camera.position.x = THREE.MathUtils.damp(camera.position.x, pointerSmoothNdc.x * 0.55, 3.2, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.72 + pointerSmoothNdc.y * 0.32, 3.2, delta);
      camera.lookAt(0, -0.05, 0);

      // Smoothly rotate central wireframe continent globe + gentle cursor tilt
      globeGroup.rotation.y += delta * 0.14;
      globeGroup.rotation.x = THREE.MathUtils.damp(
        globeGroup.rotation.x,
        0.18 - pointerSmoothNdc.y * 0.14,
        3.5,
        delta
      );

      // Update uniforms
      streamMat.uniforms.uTime.value = elapsed;
      streamMat.uniforms.uCursorWorld.value.copy(cursorWorldSmooth);
      streamMat.uniforms.uCursorStrength.value = cursorStrengthSmooth;
      globePtsMat.uniforms.uTime.value = elapsed;
      atmosMat.uniforms.uTime.value = elapsed;

      if (isSoftwareGl || !composer) {
        renderer.render(scene, camera);
      } else {
        composer.render();
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      for (const geo of geometriesToDispose) geo.dispose();
      for (const mat of materialsToDispose) mat.dispose();
      for (const tex of texturesToDispose) tex.dispose();
      if (composer) composer.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <section
      aria-label="LinkPulse 3D Geographic Telemetry Hero"
      className="relative w-full overflow-hidden bg-[#020812] text-white border-b border-cyan-500/20"
    >
      {/* Dedicated WebGL Mount Container (never mixes React HUD children) */}
      <div className="relative w-full min-h-[540px] sm:min-h-[600px] lg:min-h-[630px] flex flex-col justify-between">
        {webglUnavailable ? (
          <Image
            src="/assets/aistudio/Screenshot_20261117_062921_Gallery_1c1c7da8.jpg"
            alt="Glowing cyan digital river particle field converging around a wireframe globe"
            fill
            priority
            referrerPolicy="no-referrer"
            className="object-cover object-center opacity-90 pointer-events-none select-none"
          />
        ) : (
          <div ref={mountRef} className="absolute inset-0 w-full h-full" />
        )}

        {/* Measured Contrast Scrims (solid alpha gradients, zero backdrop-blur over WebGL) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#020812]/80 via-transparent to-[#020812]/90"
        />

        {/* Architectural Viewport Reticle Brackets */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-4 sm:inset-6 z-10 hidden sm:block"
        >
          <span className="absolute top-0 left-0 w-3.5 h-3.5 border-t border-l border-cyan-300/35" />
          <span className="absolute top-0 right-0 w-3.5 h-3.5 border-t border-r border-cyan-300/35" />
          <span className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b border-l border-cyan-300/35" />
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b border-r border-cyan-300/35" />
        </div>

        {/* Crisp White Floating UI Overlays (pointer-events-none wrapper preserves canvas cursor force) */}
        <div className="relative z-10 pointer-events-none max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12 pb-8 sm:pb-10 flex-1 flex flex-col justify-between">
          {/* Upper Editorial Typography: masked reveal above the central globe */}
          <div className="max-w-3xl mx-auto text-center space-y-3">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center justify-center gap-2.5 text-xs font-medium text-cyan-200/90 tracking-wide"
            >
              <span>Real-Time Geographic Telemetry</span>
              <span aria-hidden="true" className="text-cyan-400/60">·</span>
              <span>Hardened Link Protection</span>
            </motion.div>

            <MaskedReveal delay={0.08}>
              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight text-white text-balance leading-[1.1] [text-shadow:0_4px_28px_rgba(2,8,18,0.92)]">
                Shorten Any Link with Live Global Intelligence
              </h1>
            </MaskedReveal>
          </div>

          {/* Open Center Viewport Window: keeps the rotating wireframe continent globe completely unobstructed */}
          <div className="h-44 sm:h-56 lg:h-64" aria-hidden="true" />

          {/* Lower Floating Action Bar: crisp white controls & live tabular telemetry */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl mx-auto text-center space-y-4"
          >
            <p className="text-sm sm:text-base text-white/90 leading-relaxed max-w-xl mx-auto [text-shadow:0_2px_18px_rgba(2,8,18,0.95)]">
              Create collision-resistant short URLs in seconds with zero sign-up. Stream incoming
              visits, browser location fixes, and device analytics on a live global map.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={onStartShortening}
                className="group pointer-events-auto min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white hover:bg-cyan-50 active:scale-[0.98] text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-cyan-500/20 whitespace-nowrap"
              >
                <span>Shorten a Link</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </button>

              <button
                type="button"
                onClick={onViewAnalytics}
                className="group pointer-events-auto min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#041022]/85 hover:bg-[#081c3a] border border-white/30 hover:border-cyan-300/60 text-white font-semibold text-sm transition-all whitespace-nowrap"
              >
                <Compass className="w-4 h-4 text-cyan-300 transition-transform duration-200 group-hover:rotate-45" />
                <span>Explore Live Map</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/75 font-mono tabular-nums pt-1">
              <span>Zero Login Workspace</span>
              <span aria-hidden="true" className="text-white/40">·</span>
              <span>
                <AnimatedNumber value={linksCount} /> Active Links Saved
              </span>
              <span aria-hidden="true" className="text-white/40">·</span>
              <span ref={vectorReadoutRef}>Move cursor to ripple streams</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
