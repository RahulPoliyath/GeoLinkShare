'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  buildContinentCoastlinePositions,
  buildContinentDotData,
  latLonToVector3,
} from '@/lib/world-coastlines';

// Module-scope reusable math objects for zero-GC animation loop
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2(0, 0);
const _cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0.28, 0.96).normalize(), 0);
const _cursorTarget = new THREE.Vector3(0, 0.5, 0);
const _cursorCurrent = new THREE.Vector3(0, 0.5, 0);
const _invGlobeMatrix = new THREE.Matrix4();
const _curveStart = new THREE.Vector3();
const _curveEnd = new THREE.Vector3();
const _curveMid = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = String(
      gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''
    );
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
  } catch {
    return false;
  }
}

function createVolumetricGlowTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0.0, 'rgba(34, 240, 255, 0.42)');
    grad.addColorStop(0.28, 'rgba(6, 182, 212, 0.22)');
    grad.addColorStop(0.58, 'rgba(3, 105, 161, 0.09)');
    grad.addColorStop(1.0, 'rgba(2, 8, 19, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSphericalGraticulePositions(radius: number): Float32Array {
  const coords: number[] = [];
  const latLines = [-60, -40, -20, 0, 20, 40, 60];
  const segments = 72;

  for (const latDeg of latLines) {
    const lat = (latDeg * Math.PI) / 180;
    const r = radius * Math.cos(lat);
    const y = radius * Math.sin(lat);
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      coords.push(
        r * Math.sin(a1),
        y,
        r * Math.cos(a1),
        r * Math.sin(a2),
        y,
        r * Math.cos(a2)
      );
    }
  }

  for (let lonDeg = -180; lonDeg < 180; lonDeg += 24) {
    const lon = (lonDeg * Math.PI) / 180;
    for (let i = 0; i < segments; i++) {
      const p1 = -Math.PI / 2 + (i / segments) * Math.PI;
      const p2 = -Math.PI / 2 + ((i + 1) / segments) * Math.PI;
      coords.push(
        radius * Math.cos(p1) * Math.sin(lon),
        radius * Math.sin(p1),
        radius * Math.cos(p1) * Math.cos(lon),
        radius * Math.cos(p2) * Math.sin(lon),
        radius * Math.sin(p2),
        radius * Math.cos(p2) * Math.cos(lon)
      );
    }
  }

  return new Float32Array(coords);
}

function buildGlobeNetworkArcs(radius: number): {
  positions: Float32Array;
  progress: Float32Array;
} {
  const hubs: readonly [number, number][] = [
    [40.7, -74.0], // New York
    [51.5, -0.1], // London
    [35.7, 139.7], // Tokyo
    [19.07, 72.87], // Mumbai
    [-23.5, -46.6], // Sao Paulo
    [37.77, -122.4], // San Francisco
    [1.35, 103.8], // Singapore
    [48.85, 2.35], // Paris
    [-33.86, 151.2], // Sydney
    [25.2, 55.27], // Dubai
    [6.5, 3.37], // Lagos
    [-26.2, 28.0], // Johannesburg
    [64.1, -21.9], // Reykjavik
    [52.5, 13.4], // Berlin
    [31.2, 121.4], // Shanghai
    [43.65, -79.38], // Toronto
  ];

  const pairs: readonly [number, number][] = [
    [0, 1], [0, 4], [0, 5], [1, 7], [1, 9], [1, 10],
    [4, 10], [4, 11], [5, 2], [5, 8], [2, 6], [2, 14],
    [3, 9], [3, 6], [3, 1], [7, 13], [13, 14], [12, 0],
    [12, 1], [15, 7], [9, 11], [6, 8], [10, 11], [0, 13],
  ];

  const coords: number[] = [];
  const progress: number[] = [];
  const segs = 32;
  const pTmp: [number, number, number] = [0, 0, 0];

  for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
    const [aIdx, bIdx] = pairs[pIdx];
    const [latA, lonA] = hubs[aIdx];
    const [latB, lonB] = hubs[bIdx];

    latLonToVector3(latA, lonA, radius, pTmp);
    _curveStart.set(pTmp[0], pTmp[1], pTmp[2]);
    latLonToVector3(latB, lonB, radius, pTmp);
    _curveEnd.set(pTmp[0], pTmp[1], pTmp[2]);

    const chordDist = _curveStart.distanceTo(_curveEnd);
    // Alternate between subtle surface arcs and delicate internal chord filaments
    const isInternal = pIdx % 3 === 0;
    const midScale = isInternal
      ? radius * (0.48 + (pIdx % 4) * 0.08)
      : radius + chordDist * 0.14;

    _curveMid.addVectors(_curveStart, _curveEnd).multiplyScalar(0.5);
    if (_curveMid.lengthSq() < 0.001) {
      _curveMid.set(0, radius * 0.5, 0);
    } else {
      _curveMid.normalize().multiplyScalar(midScale);
    }

    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;

      const omt0 = 1 - t0;
      const x0 = omt0 * omt0 * _curveStart.x + 2 * omt0 * t0 * _curveMid.x + t0 * t0 * _curveEnd.x;
      const y0 = omt0 * omt0 * _curveStart.y + 2 * omt0 * t0 * _curveMid.y + t0 * t0 * _curveEnd.y;
      const z0 = omt0 * omt0 * _curveStart.z + 2 * omt0 * t0 * _curveMid.z + t0 * t0 * _curveEnd.z;

      const omt1 = 1 - t1;
      const x1 = omt1 * omt1 * _curveStart.x + 2 * omt1 * t1 * _curveMid.x + t1 * t1 * _curveEnd.x;
      const y1 = omt1 * omt1 * _curveStart.y + 2 * omt1 * t1 * _curveMid.y + t1 * t1 * _curveEnd.y;
      const z1 = omt1 * omt1 * _curveStart.z + 2 * omt1 * t1 * _curveMid.z + t1 * t1 * _curveEnd.z;

      coords.push(x0, y0, z0, x1, y1, z1);
      progress.push(t0 + pIdx * 0.17, t1 + pIdx * 0.17);
    }
  }

  return {
    positions: new Float32Array(coords),
    progress: new Float32Array(progress),
  };
}

export function HeroParticleGlobe() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = detectSoftwareWebGL();
    const disposables: Array<{ dispose: () => void }> = [];

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const pixelRatio = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    renderer.setClearColor(0x020813, 1);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020813);
    scene.fog = new THREE.FogExp2(0x020813, 0.032);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(0, 1.45, 11.8);
    camera.lookAt(0, 0.35, 0);

    // ================= 1. VOLUMETRIC ATMOSPHERIC BACKDROP =================
    const glowTex = createVolumetricGlowTexture();
    disposables.push(glowTex);

    const haloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(haloMat);
    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.position.set(0, 0.95, -1.6);
    haloSprite.scale.set(16.5, 10.5, 1);
    scene.add(haloSprite);

    const innerGlowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x22f0ff,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(innerGlowMat);
    const innerGlowSprite = new THREE.Sprite(innerGlowMat);
    innerGlowSprite.position.set(0, 0.92, -0.4);
    innerGlowSprite.scale.set(7.6, 7.6, 1);
    scene.add(innerGlowSprite);

    // ================= 2. CENTRAL ROTATING WIREFRAME GLOBE =================
    const GLOBE_RADIUS = 2.42;
    const globeGroup = new THREE.Group();
    globeGroup.position.set(0, 0.92, 0);
    // Orient Americas, Atlantic, Europe & West Africa prominently toward viewer on load
    globeGroup.rotation.set(0.14, 0.66, 0.04);
    scene.add(globeGroup);

    // Part A: Inner translucent holographic ocean core
    const coreGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 0.985, 48, 48);
    const coreMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uColorInner: { value: new THREE.Color(0x021326) },
        uColorRim: { value: new THREE.Color(0x0b7ea8) },
      },
      vertexShader: `
        varying vec3 vNormalDir;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormalDir = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColorInner;
        uniform vec3 uColorRim;
        varying vec3 vNormalDir;
        varying vec3 vViewDir;
        void main() {
          float ndotv = clamp(dot(normalize(vNormalDir), normalize(vViewDir)), 0.0, 1.0);
          float rim = pow(1.0 - ndotv, 2.4);
          vec3 col = mix(uColorInner, uColorRim, rim);
          float alpha = mix(0.32, 0.62, rim);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    disposables.push(coreGeo, coreMat);
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // Part B: Outer Fresnel Cyan Rim Glow Shell
    const rimGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.018, 64, 64);
    const rimMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uRimColor: { value: new THREE.Color(0x4cf7ff) },
      },
      vertexShader: `
        varying vec3 vNormalDir;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormalDir = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uRimColor;
        varying vec3 vNormalDir;
        varying vec3 vViewDir;
        void main() {
          float ndotv = clamp(dot(normalize(vNormalDir), normalize(vViewDir)), 0.0, 1.0);
          float rim = pow(1.0 - ndotv, 4.2);
          float softHalo = pow(1.0 - ndotv, 1.9) * 0.16;
          gl_FragColor = vec4(uRimColor, rim * 0.95 + softHalo);
        }
      `,
    });
    disposables.push(rimGeo, rimMat);
    globeGroup.add(new THREE.Mesh(rimGeo, rimMat));

    // Part C: Dotted Continent Matrix (geodesic stippled landmasses)
    const continentDots = buildContinentDotData(GLOBE_RADIUS);
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(continentDots.positions, 3));
    dotGeo.setAttribute('aWeight', new THREE.BufferAttribute(continentDots.weights, 1));

    const continentDotMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uCursorLocal: { value: new THREE.Vector3(0, 0, 0) },
        uCursorActive: { value: 0 },
      },
      vertexShader: `
        attribute float aWeight;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec3 uCursorLocal;
        uniform float uCursorActive;
        varying float vAlpha;
        varying float vHighlight;

        void main() {
          vec3 pos = position;
          float dCursor = distance(pos, uCursorLocal);
          float ripple = exp(-dCursor * dCursor * 1.4) * uCursorActive;
          pos += normalize(pos) * ripple * 0.14;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          vec3 viewNormal = normalize(normalMatrix * normalize(pos));
          float facing = dot(viewNormal, normalize(-mvPos.xyz));

          // Front hemisphere shines bright cyan; back hemisphere glimmers softly for 3D wireframe depth
          vAlpha = mix(0.14, 0.95, smoothstep(-0.35, 0.45, facing)) * aWeight;
          vHighlight = clamp(aWeight * 0.7 + ripple * 0.8 + sin(uTime * 1.6 + pos.y * 2.5) * 0.12, 0.0, 1.0);

          float size = mix(4.2, 6.2, aWeight) * uPixelRatio * (1.0 + ripple * 0.45);
          gl_PointSize = clamp(size * (10.5 / -mvPos.z), 1.5, 11.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vHighlight;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float core = smoothstep(0.5, 0.08, dist);
          vec3 deepBlue = vec3(0.05, 0.45, 0.85);
          vec3 brightCyan = vec3(0.32, 0.96, 1.0);
          vec3 col = mix(deepBlue, brightCyan, vHighlight);
          gl_FragColor = vec4(col, core * vAlpha);
        }
      `,
    });
    disposables.push(dotGeo, continentDotMat);
    globeGroup.add(new THREE.Points(dotGeo, continentDotMat));

    // Part D: Glowing Coastline Contour Outlines
    const coastGeo = new THREE.BufferGeometry();
    coastGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(buildContinentCoastlinePositions(GLOBE_RADIUS * 1.003), 3)
    );
    const coastMat = new THREE.LineBasicMaterial({
      color: 0x3ef4ff,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(coastGeo, coastMat);
    globeGroup.add(new THREE.LineSegments(coastGeo, coastMat));

    // Part E: Delicate Spherical Graticule Wireframe
    const gratGeo = new THREE.BufferGeometry();
    gratGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(buildSphericalGraticulePositions(GLOBE_RADIUS * 0.996), 3)
    );
    const gratMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(gratGeo, gratMat);
    globeGroup.add(new THREE.LineSegments(gratGeo, gratMat));

    // Part F: Animated Internal & Surface Network Arcs
    const arcs = buildGlobeNetworkArcs(GLOBE_RADIUS * 1.005);
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(arcs.positions, 3));
    arcGeo.setAttribute('aProgress', new THREE.BufferAttribute(arcs.progress, 1));
    const arcMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute float aProgress;
        varying float vProgress;
        void main() {
          vProgress = aProgress;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vProgress;
        void main() {
          float pulse = pow(0.5 + 0.5 * sin(vProgress * 8.0 - uTime * 2.2), 4.0);
          vec3 col = mix(vec3(0.03, 0.36, 0.72), vec3(0.45, 0.97, 1.0), pulse);
          gl_FragColor = vec4(col, 0.18 + pulse * 0.42);
        }
      `,
    });
    disposables.push(arcGeo, arcMat);
    globeGroup.add(new THREE.LineSegments(arcGeo, arcMat));

    // Part G: Converging Shoulder Halo Particles around the Globe
    const ORBIT_COUNT = 1200;
    const orbitPos = new Float32Array(ORBIT_COUNT * 3);
    const orbitData = new Float32Array(ORBIT_COUNT * 3); // [angle, elev, speed]
    for (let i = 0; i < ORBIT_COUNT; i++) {
      const angle = (i / ORBIT_COUNT) * Math.PI * 2 + (i % 7) * 0.19;
      const elev = ((i * 1.6180339) % 1) * 2.0 - 1.0;
      const r = GLOBE_RADIUS * (1.03 + ((i * 0.37) % 0.18));
      const cosE = Math.sqrt(Math.max(0.05, 1.0 - elev * elev * 0.75));
      orbitPos[i * 3] = r * cosE * Math.cos(angle);
      orbitPos[i * 3 + 1] = r * elev * 0.86;
      orbitPos[i * 3 + 2] = r * cosE * Math.sin(angle);
      orbitData[i * 3] = angle;
      orbitData[i * 3 + 1] = (i % 13) / 13;
      orbitData[i * 3 + 2] = 0.2 + (i % 5) * 0.08;
    }
    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3));
    orbitGeo.setAttribute('aMeta', new THREE.BufferAttribute(orbitData, 3));
    const orbitMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: `
        attribute vec3 aMeta;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          float spin = uTime * aMeta.z * 0.45;
          float c = cos(spin);
          float s = sin(spin);
          vec3 p = position;
          p.xz = mat2(c, -s, s, c) * p.xz;
          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          vAlpha = 0.25 + 0.45 * (0.5 + 0.5 * sin(uTime * 1.8 + aMeta.x * 3.0));
          gl_PointSize = clamp((7.5 * uPixelRatio) / -mvPos.z, 1.2, 6.5);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float glow = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vec3(0.28, 0.94, 1.0), glow * vAlpha);
        }
      `,
    });
    disposables.push(orbitGeo, orbitMat);
    globeGroup.add(new THREE.Points(orbitGeo, orbitMat));

    // ================= 3. DIGITAL RIVER PARTICLE STREAMS (FLOW + DOF + CURSOR FORCE) =================
    // Streamline Family A: 66 sweeping wave lanes moving horizontally across ridges & converging into globe
    // Streamline Family B: 30 radiating foreground fan streams sweeping out toward the bottom edge
    const LATERAL_LANES = 66;
    const LATERAL_PER_LANE = 190;
    const RADIAL_LANES = 30;
    const RADIAL_PER_LANE = 120;
    const TOTAL_STREAM_PARTICLES =
      LATERAL_LANES * LATERAL_PER_LANE + RADIAL_LANES * RADIAL_PER_LANE;

    const dummyPositions = new Float32Array(TOTAL_STREAM_PARTICLES * 3);
    // aStreamParams: x = laneU [0..1], y = flowOffset [0..1], z = speed, w = family (0 = lateral wave, 1 = radial foreground fan)
    const streamParams = new Float32Array(TOTAL_STREAM_PARTICLES * 4);
    // aParticleSeed: x = colorMix [0..1], y = sizeScale, z = jitterAmp
    const particleSeeds = new Float32Array(TOTAL_STREAM_PARTICLES * 3);

    let pCursor = 0;
    for (let lane = 0; lane < LATERAL_LANES; lane++) {
      const laneU = lane / (LATERAL_LANES - 1);
      const laneSpeed = 0.032 + ((lane * 17) % 11) * 0.0022;
      for (let i = 0; i < LATERAL_PER_LANE; i++) {
        const flowOffset = i / LATERAL_PER_LANE;
        const hash = Math.sin(lane * 12.9898 + i * 78.233) * 43758.5453;
        const rnd = hash - Math.floor(hash);

        streamParams[pCursor * 4] = laneU;
        streamParams[pCursor * 4 + 1] = flowOffset;
        streamParams[pCursor * 4 + 2] = laneSpeed;
        streamParams[pCursor * 4 + 3] = 0.0;

        particleSeeds[pCursor * 3] = 0.25 + 0.75 * rnd;
        particleSeeds[pCursor * 3 + 1] = 0.78 + rnd * 0.65;
        particleSeeds[pCursor * 3 + 2] = (rnd - 0.5) * 0.14;
        pCursor++;
      }
    }

    for (let lane = 0; lane < RADIAL_LANES; lane++) {
      const laneU = lane / (RADIAL_LANES - 1);
      const laneSpeed = 0.044 + ((lane * 13) % 9) * 0.003;
      for (let i = 0; i < RADIAL_PER_LANE; i++) {
        const flowOffset = i / RADIAL_PER_LANE;
        const hash = Math.sin((lane + 99) * 24.13 + i * 51.7) * 29431.71;
        const rnd = hash - Math.floor(hash);

        streamParams[pCursor * 4] = laneU;
        streamParams[pCursor * 4 + 1] = flowOffset;
        streamParams[pCursor * 4 + 2] = laneSpeed;
        streamParams[pCursor * 4 + 3] = 1.0;

        particleSeeds[pCursor * 3] = 0.4 + 0.6 * rnd;
        particleSeeds[pCursor * 3 + 1] = 0.95 + rnd * 0.7;
        particleSeeds[pCursor * 3 + 2] = (rnd - 0.5) * 0.09;
        pCursor++;
      }
    }

    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));
    riverGeo.setAttribute('aStream', new THREE.BufferAttribute(streamParams, 4));
    riverGeo.setAttribute('aSeed', new THREE.BufferAttribute(particleSeeds, 3));
    // Large static bounding sphere so frustum culling never clips GPU-computed stream positions
    riverGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);

    const riverMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uCursorWorld: { value: new THREE.Vector3(0, 0.5, 0) },
        uCursorActive: { value: 0 },
      },
      vertexShader: `
        attribute vec4 aStream;
        attribute vec3 aSeed;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec3 uCursorWorld;
        uniform float uCursorActive;

        varying float vAlpha;
        varying float vColorMix;
        varying float vDofBlur;

        void main() {
          float laneU = aStream.x;
          float t = fract(aStream.y + uTime * aStream.z);
          float family = aStream.w;

          // Smooth fade at stream entry & exit so flow is seamless
          float edgeFade = smoothstep(0.0, 0.09, t) * smoothstep(1.0, 0.91, t);

          vec3 pos;
          float waveCrest = 0.0;

          if (family < 0.5) {
            // Sweeping horizontal undulating digital river lanes converging toward globe center
            float s = (laneU - 0.5) * 2.0; // -1..+1 front-to-back lane spread
            float x = mix(-18.5, 18.5, t);

            // Base depth & gentle fan toward foreground
            float baseZ = mix(-8.8, 6.2, laneU);
            // Funnel lanes subtly inward & upward toward the central globe (0, 0.92, 0)
            float centerPull = exp(-x * x * 0.052);
            float z = mix(baseZ, baseZ * 0.36, centerPull * 0.72);
            z += sin(x * 0.25 + laneU * 6.2831 + uTime * 0.25) * 0.75;

            // Undulating twin ridge hills flanking the globe + subtle depression near front
            float ridge =
              sin(x * 0.31 + s * 2.4 + uTime * 0.38) * 0.92 +
              cos(x * 0.16 - s * 3.1 - uTime * 0.26) * 0.78;
            float flankLift = smoothstep(1.5, 9.5, abs(x)) * (0.65 + 0.55 * cos(s * 1.9));
            float globeShoulder = exp(-(x * x * 0.11 + z * z * 0.18)) * 1.15;

            float y = -1.65 + ridge * 0.72 + flankLift * 1.05 + globeShoulder + aSeed.z;
            // Dip deeper in front foreground so globe stays open in center
            y -= smoothstep(1.0, 6.5, z) * 1.35;

            pos = vec3(x, y, z);
            waveCrest = clamp(0.45 + ridge * 0.35 + globeShoulder * 0.4, 0.0, 1.0);
          } else {
            // Radiating foreground cascade streams sweeping from under/around globe to bottom screen edge
            float fanAngle = mix(-1.18, 1.18, laneU);
            float radius = mix(1.8, 11.4, t);
            float x = sin(fanAngle) * radius * 1.28;
            float z = -1.8 + cos(fanAngle) * radius * 0.98;

            float undulate = sin(radius * 0.65 - uTime * 0.9 + laneU * 8.0) * 0.26;
            float y = 0.28 - pow(t, 1.18) * 3.95 + undulate + aSeed.z;

            pos = vec3(x, y, z);
            waveCrest = clamp(0.65 + undulate, 0.0, 1.0);
          }

          // Invisible cursor force field: parts, lifts, and ripples nearby streams smoothly
          vec3 diff = pos - uCursorWorld;
          float cDist = length(diff);
          float cursorField = exp(-cDist * cDist * 0.16) * uCursorActive;
          vec3 pushDir = normalize(diff + vec3(0.001, 0.08, 0.001));
          pos += pushDir * cursorField * 1.25;
          pos.y += sin(cDist * 1.9 - uTime * 3.2) * cursorField * 0.38;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          float viewDist = max(0.5, -mvPos.z);

          // Shallow cinematic depth-of-field around the globe focal plane (~11.6 units)
          float focusDelta = abs(viewDist - 11.4);
          float dof = clamp(focusDelta / 6.2, 0.0, 1.0);
          vDofBlur = dof;

          // Distant horizon fade + DoF bokeh fade
          float farFade = smoothstep(23.5, 11.5, viewDist);
          vAlpha = edgeFade * farFade * mix(0.92, 0.44, dof) * mix(0.55, 1.0, waveCrest);
          vColorMix = clamp(aSeed.x * 0.55 + waveCrest * 0.45 + cursorField * 0.4, 0.0, 1.0);

          float baseSize = (18.5 + dof * 22.0) * aSeed.y * uPixelRatio;
          gl_PointSize = clamp(baseSize / viewDist, 1.4, 15.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vColorMix;
        varying float vDofBlur;

        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;

          // Sharp core in focal plane, softer bokeh disc when out of focus
          float falloffPow = mix(2.4, 1.15, vDofBlur);
          float radial = pow(clamp(1.0 - dist * 2.0, 0.0, 1.0), falloffPow);

          vec3 deepOcean = vec3(0.02, 0.32, 0.72);
          vec3 electricCyan = vec3(0.08, 0.88, 1.0);
          vec3 whiteCore = vec3(0.76, 0.98, 1.0);

          vec3 baseCol = mix(deepOcean, electricCyan, vColorMix);
          vec3 col = mix(baseCol, whiteCore, smoothstep(0.28, 0.02, dist) * (1.0 - vDofBlur * 0.7) * vColorMix);

          gl_FragColor = vec4(col, radial * vAlpha);
        }
      `,
    });
    disposables.push(riverGeo, riverMat);
    const riverPoints = new THREE.Points(riverGeo, riverMat);
    riverPoints.frustumCulled = false;
    scene.add(riverPoints);

    // ================= 4. POST-PROCESSING (BLOOM ON HARDWARE GPU) =================
    let composer: EffectComposer | null = null;
    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.52, // subtle cinematic bloom strength
        0.48, // radius
        0.34 // threshold
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ================= 5. CURSOR INTERACTION & RESIZE =================
    let cursorActiveTarget = 0;
    let cursorActiveCurrent = 0;
    let camTargetX = 0;
    let camTargetY = 1.45;

    const updatePointerFromClient = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointerNdc, camera);
      _raycaster.ray.intersectPlane(_cursorPlane, _cursorTarget);

      camTargetX = _pointerNdc.x * 0.72;
      camTargetY = 1.45 + _pointerNdc.y * 0.35;
      cursorActiveTarget = 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointerFromClient(e.clientX, e.clientY);
    };
    const onPointerLeave = () => {
      cursorActiveTarget = 0;
      camTargetX = 0;
      camTargetY = 1.45;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const onResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) {
        composer.setSize(w, h);
      }
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    const onContextRestored = () => {
      setWebglFailed(false);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // ================= 6. ANIMATION LOOP (WITH SOFTWARE-GL PACING) =================
    let frameId = 0;
    let disposed = false;
    let lastNow = performance.now();
    let elapsedTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
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

    function renderFrame() {
      if (composer && !isSoftwareGl) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const delta = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      if (!prefersReducedMotion) {
        elapsedTime += delta;
        globeGroup.rotation.y += delta * 0.11;
      }

      // Smoothly damp camera parallax and cursor force field
      const dampFactor = 1 - Math.exp(-6.5 * delta);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, camTargetX, dampFactor);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, camTargetY, dampFactor);
      camera.lookAt(0, 0.35, 0);

      _cursorCurrent.lerp(_cursorTarget, 1 - Math.exp(-9.0 * delta));
      cursorActiveCurrent = THREE.MathUtils.lerp(
        cursorActiveCurrent,
        cursorActiveTarget,
        1 - Math.exp(-5.0 * delta)
      );

      // Update globe local cursor coordinates
      _invGlobeMatrix.copy(globeGroup.matrixWorld).invert();
      continentDotMat.uniforms.uCursorLocal.value
        .copy(_cursorCurrent)
        .applyMatrix4(_invGlobeMatrix);
      continentDotMat.uniforms.uCursorActive.value = cursorActiveCurrent;
      continentDotMat.uniforms.uTime.value = elapsedTime;
      arcMat.uniforms.uTime.value = elapsedTime;
      orbitMat.uniforms.uTime.value = elapsedTime;

      riverMat.uniforms.uTime.value = elapsedTime;
      riverMat.uniforms.uCursorWorld.value.copy(_cursorCurrent);
      riverMat.uniforms.uCursorActive.value = cursorActiveCurrent;

      renderFrame();

      if (prefersReducedMotion) return;
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
      window.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      resizeObserver.disconnect();

      for (const item of disposables) {
        item.dispose();
      }
      composer?.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-[#020813] overflow-hidden">
      {/* Dedicated WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Graceful fallback backdrop if WebGL context is unavailable */}
      {webglFailed && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#020813] via-[#041830] to-[#020813]"
        />
      )}
    </div>
  );
}
