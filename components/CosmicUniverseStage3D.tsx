'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { useTheme } from './ThemeProvider';
import { LP_BURST_EVENT, ScrollStageState } from '@/lib/scroll-stage';

// Module-scope reusable math objects for zero-GC render loop
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2(0, 0);
const _cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _cursorTarget = new THREE.Vector3(0, 0, 0);
const _cursorCurrent = new THREE.Vector3(0, 0, 0);

const _tintCyan = new THREE.Color(0x38bdf8);
const _tintIndigo = new THREE.Color(0x818cf8);
const _tintEmerald = new THREE.Color(0x34d399);
const _tintSapphire = new THREE.Color(0x60a5fa);
const _activeCosmicTint = new THREE.Color(0x60a5fa);

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

function createNebulaCoreTexture(): THREE.CanvasTexture {
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
    grad.addColorStop(0.0, 'rgba(240, 249, 255, 0.58)');
    grad.addColorStop(0.18, 'rgba(125, 211, 252, 0.34)');
    grad.addColorStop(0.45, 'rgba(99, 102, 241, 0.16)');
    grad.addColorStop(0.75, 'rgba(30, 27, 75, 0.05)');
    grad.addColorStop(1.0, 'rgba(2, 6, 23, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sampleCosmicTint(progress: number, out: THREE.Color) {
  const p = Math.max(0, Math.min(3, progress));
  if (p < 1) {
    out.copy(_tintSapphire).lerp(_tintIndigo, p);
  } else if (p < 2) {
    out.copy(_tintIndigo).lerp(_tintEmerald, p - 1);
  } else {
    out.copy(_tintEmerald).lerp(_tintCyan, p - 2);
  }
}

function deterministicHash(seed: number): number {
  const x = Math.sin(seed) * 43758.5453123;
  return x - Math.floor(x);
}

interface CosmicUniverseStage3DProps {
  stageStateRef: React.MutableRefObject<ScrollStageState>;
}

export function CosmicUniverseStage3D({ stageStateRef }: CosmicUniverseStage3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const isDarkRef = useRef(theme === 'dark');
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    isDarkRef.current = theme === 'dark';
  }, [theme]);

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
        alpha: true,
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
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 140);
    camera.position.set(0, 0, 12.5);
    camera.lookAt(0, 0, 0);

    // ================= 1. VOLUMETRIC COSMIC NEBULA CORE GLOW =================
    const coreGlowTex = createNebulaCoreTexture();
    disposables.push(coreGlowTex);

    const coreGlowMat = new THREE.SpriteMaterial({
      map: coreGlowTex,
      color: 0x60a5fa,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(coreGlowMat);
    const coreGlowSprite = new THREE.Sprite(coreGlowMat);
    coreGlowSprite.position.set(0, 0, -4.5);
    coreGlowSprite.scale.set(14, 10, 1);
    scene.add(coreGlowSprite);

    const haloGlowMat = new THREE.SpriteMaterial({
      map: coreGlowTex,
      color: 0x818cf8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(haloGlowMat);
    const haloGlowSprite = new THREE.Sprite(haloGlowMat);
    haloGlowSprite.position.set(-1.5, 0.8, -6.5);
    haloGlowSprite.scale.set(22, 16, 1);
    scene.add(haloGlowSprite);

    // ================= 2. MULTI-SPECTRAL DEEP-SPACE STARFIELD (5,800 STARS) =================
    const STAR_COUNT = 5800;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    // aStarMeta: x = baseSize, y = twinklePhase, z = twinkleSpeed, w = flareWeight (bright hero stars get diffraction cross)
    const starMeta = new Float32Array(STAR_COUNT * 4);

    // Harvard spectral color palette (O/B blue-white, A white, F/G warm yellow-white, K amber, nebula cyan/violet)
    const spectralColors = [
      new THREE.Color(0x93c5fd), // Hot Blue-White Giant
      new THREE.Color(0xe0f2fe), // Crisp White-Cyan
      new THREE.Color(0xf8fafc), // Pure Starlight White
      new THREE.Color(0xfef3c7), // Solar Warm Gold
      new THREE.Color(0xfdba74), // Amber K-type
      new THREE.Color(0xc4b5fd), // Nebula Violet Star
      new THREE.Color(0x67e8f9), // Hyper-Cyan Dwarf
    ];

    for (let i = 0; i < STAR_COUNT; i++) {
      const r1 = deterministicHash(i * 12.9898 + 1.23);
      const r2 = deterministicHash(i * 78.233 + 4.56);
      const r3 = deterministicHash(i * 39.425 + 7.89);
      const r4 = deterministicHash(i * 91.113 + 2.34);

      // Deep spherical universe volume from close foreground (-2..+6) to far horizon (-48)
      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);
      const depthRadius = 3.5 + Math.pow(r3, 0.72) * 38.0;

      starPositions[i * 3] = depthRadius * Math.sin(phi) * Math.cos(theta) * 1.45;
      starPositions[i * 3 + 1] = depthRadius * Math.cos(phi) * 1.1;
      starPositions[i * 3 + 2] = -depthRadius * Math.abs(Math.sin(phi) * Math.sin(theta)) * 0.95 + 4.2;

      const cIdx = Math.min(spectralColors.length - 1, Math.floor(r4 * spectralColors.length));
      const sc = spectralColors[cIdx];
      starColors[i * 3] = sc.r;
      starColors[i * 3 + 1] = sc.g;
      starColors[i * 3 + 2] = sc.b;

      const isBrightStar = r3 > 0.89 ? 1.0 : 0.0;
      starMeta[i * 4] = isBrightStar ? 2.2 + r4 * 1.9 : 0.65 + r4 * 1.25;
      starMeta[i * 4 + 1] = r1 * Math.PI * 2;
      starMeta[i * 4 + 2] = 0.8 + r2 * 2.6;
      starMeta[i * 4 + 3] = isBrightStar;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
    starGeo.setAttribute('aMeta', new THREE.BufferAttribute(starMeta, 4));
    starGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -10), 65);

    const starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uScrollProgress: { value: 0 },
        uTransitionFocus: { value: 0 },
        uVelocity: { value: 0 },
        uBurst: { value: 0 },
        uStageIntensity: { value: 0 },
        uDarkMode: { value: isDarkRef.current ? 1 : 0 },
        uCursorWorld: { value: new THREE.Vector3(0, 0, 0) },
        uCursorActive: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute vec4 aMeta;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uScrollProgress;
        uniform float uTransitionFocus;
        uniform float uVelocity;
        uniform float uBurst;
        uniform float uStageIntensity;
        uniform vec3 uCursorWorld;
        uniform float uCursorActive;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vFlare;
        varying float vSharpness;

        void main() {
          vec3 p = position;

          // Subtle infinite universe drift & scroll-driven deep-space glide
          float drift = uTime * 0.016 + uScrollProgress * 0.24;
          float c = cos(drift);
          float s = sin(drift * 0.85);
          p.xz = mat2(c, -s, s, c) * p.xz;
          p.y += sin(uTime * 0.25 + aMeta.y) * 0.12 - uScrollProgress * 1.1;

          // Hyperspace forward parallax surge on scroll velocity & cosmic burst
          float warpZ = fract((p.z + 44.0 + uScrollProgress * 7.5) / 48.0) * 48.0 - 42.0;
          p.z = warpZ;

          // Gravitational cursor lensing ripple
          vec2 cursorDelta = p.xy - uCursorWorld.xy;
          float cDist = length(cursorDelta);
          float gravityWell = exp(-cDist * cDist * 0.14) * uCursorActive;
          p.xy += normalize(cursorDelta + vec2(0.001, 0.002)) * gravityWell * 0.72;
          p.z += gravityWell * 0.85;

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          float viewDist = max(1.2, -mvPos.z);

          // Twinkle scintillation
          float twinkle = 0.62 + 0.38 * sin(uTime * aMeta.z + aMeta.y);
          float densityBoost = mix(0.34, 1.0, uTransitionFocus);
          float farFade = smoothstep(52.0, 9.0, viewDist);
          float nearFade = smoothstep(1.2, 3.8, viewDist);

          vColor = aColor;
          vFlare = aMeta.w;
          vSharpness = mix(0.35, 1.0, clamp(uTransitionFocus * 1.15 + uBurst * 0.5, 0.0, 1.0));
          vAlpha = uStageIntensity * densityBoost * twinkle * farFade * nearFade;

          float sizeGain = 1.0 + uTransitionFocus * 0.65 + uBurst * 0.5 + gravityWell * 0.4;
          float ptSize = aMeta.x * 16.5 * sizeGain * uPixelRatio;
          gl_PointSize = clamp(ptSize / viewDist, 1.4, 24.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uDarkMode;
        uniform float uTransitionFocus;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vFlare;
        varying float vSharpness;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;

          // Crisp optical stellar core + optional 4-point telescope diffraction spikes on bright stars
          float falloff = mix(1.3, 3.1, vSharpness);
          float core = pow(clamp(1.0 - d * 2.0, 0.0, 1.0), falloff);

          float spikeH = exp(-abs(uv.y) * 26.0) * exp(-abs(uv.x) * 6.5);
          float spikeV = exp(-abs(uv.x) * 26.0) * exp(-abs(uv.y) * 6.5);
          float spikes = (spikeH + spikeV) * vFlare * vSharpness * 0.85;

          float intensity = clamp(core + spikes, 0.0, 1.0);

          // In light mode when foreground content is focused, deepen stars to royal indigo/sapphire so they remain legible; during transition bursts, glow white-hot
          vec3 lightTint = mix(vec3(0.08, 0.25, 0.68), vColor, max(uDarkMode, uTransitionFocus * 0.9));
          vec3 finalColor = mix(lightTint, vec3(1.0), core * 0.45 * max(uDarkMode, uTransitionFocus));

          float alpha = intensity * vAlpha * mix(0.55, 1.0, max(uDarkMode, uTransitionFocus));
          if (alpha < 0.01) discard;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
    });
    disposables.push(starGeo, starMat);
    const starPoints = new THREE.Points(starGeo, starMat);
    starPoints.frustumCulled = false;
    scene.add(starPoints);

    // ================= 3. LOGARITHMIC SPIRAL GALAXY & COSMIC NEBULA DUST (2,400 WISPS) =================
    const NEBULA_COUNT = 2400;
    const nebPositions = new Float32Array(NEBULA_COUNT * 3);
    const nebColors = new Float32Array(NEBULA_COUNT * 3);
    const nebMeta = new Float32Array(NEBULA_COUNT * 3); // [size, phase, radialU]

    const armColors = [
      new THREE.Color(0x38bdf8), // Ionized Cyan
      new THREE.Color(0x6366f1), // Deep Space Indigo
      new THREE.Color(0xa855f7), // Cosmic Violet
      new THREE.Color(0x2dd4bf), // Teal Nebula Gas
      new THREE.Color(0x93c5fd), // Stellar Core Blue
    ];

    for (let i = 0; i < NEBULA_COUNT; i++) {
      const u = (i + 0.5) / NEBULA_COUNT;
      const r1 = deterministicHash(i * 19.31 + 3.17);
      const r2 = deterministicHash(i * 53.71 + 8.42);
      const r3 = deterministicHash(i * 87.13 + 5.91);

      const armIndex = i % 3;
      const armOffset = (armIndex / 3) * Math.PI * 2;
      const radialDist = Math.pow(u, 0.72) * 9.6;
      const spiralTwist = radialDist * 0.78 + armOffset;
      const scatter = (r1 - 0.5) * (0.45 + radialDist * 0.22);
      const verticalSpread = (r2 - 0.5) * (0.35 + (1.0 - u) * 0.85);

      nebPositions[i * 3] = Math.cos(spiralTwist) * radialDist + scatter;
      nebPositions[i * 3 + 1] = verticalSpread;
      nebPositions[i * 3 + 2] = Math.sin(spiralTwist) * radialDist + (r3 - 0.5) * (0.45 + radialDist * 0.2);

      const colA = armColors[armIndex % armColors.length];
      const colB = armColors[(armIndex + 1) % armColors.length];
      const mixT = Math.min(1, radialDist / 9.6);
      nebColors[i * 3] = THREE.MathUtils.lerp(colA.r, colB.r, mixT);
      nebColors[i * 3 + 1] = THREE.MathUtils.lerp(colA.g, colB.g, mixT);
      nebColors[i * 3 + 2] = THREE.MathUtils.lerp(colA.b, colB.b, mixT);

      nebMeta[i * 3] = 1.6 + r3 * 2.8;
      nebMeta[i * 3 + 1] = r1 * Math.PI * 2;
      nebMeta[i * 3 + 2] = u;
    }

    const nebGeo = new THREE.BufferGeometry();
    nebGeo.setAttribute('position', new THREE.BufferAttribute(nebPositions, 3));
    nebGeo.setAttribute('aColor', new THREE.BufferAttribute(nebColors, 3));
    nebGeo.setAttribute('aMeta', new THREE.BufferAttribute(nebMeta, 3));
    nebGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 25);

    const nebMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uTransitionFocus: { value: 0 },
        uBurst: { value: 0 },
        uStageIntensity: { value: 0 },
        uAccent: { value: new THREE.Color(0x60a5fa) },
        uCursorWorld: { value: new THREE.Vector3(0, 0, 0) },
        uCursorActive: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute vec3 aMeta;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uTransitionFocus;
        uniform float uBurst;
        uniform float uStageIntensity;
        uniform vec3 uCursorWorld;
        uniform float uCursorActive;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec3 p = position;

          // Differential galactic rotation: inner core orbits faster than outer arms
          float speed = 0.085 + (1.0 - aMeta.z) * 0.14;
          float angle = uTime * speed + (uTransitionFocus * 0.35 + uBurst * 0.45) * (1.0 - aMeta.z * 0.5);
          float c = cos(angle);
          float s = sin(angle);
          p.xz = mat2(c, -s, s, c) * p.xz;

          // Expand spiral nebula arms smoothly during cosmic bursts
          p *= (1.0 + uTransitionFocus * 0.28 + uBurst * 0.35);

          // Cursor starlight swirl
          vec3 diff = p - uCursorWorld;
          float cDist = length(diff);
          float swirlField = exp(-cDist * cDist * 0.12) * uCursorActive;
          p += normalize(diff + vec3(0.01, 0.05, 0.01)) * swirlField * 0.95;

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          float viewDist = max(1.5, -mvPos.z);

          vColor = aColor;
          float glow = mix(0.22, 0.72, uTransitionFocus) * (0.65 + 0.35 * sin(uTime * 1.1 + aMeta.y));
          vAlpha = uStageIntensity * glow * smoothstep(26.0, 8.0, viewDist);

          float ptSize = aMeta.x * (24.0 + uTransitionFocus * 14.0) * uPixelRatio;
          gl_PointSize = clamp(ptSize / viewDist, 2.0, 42.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uAccent;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float soft = pow(clamp(1.0 - d * 2.0, 0.0, 1.0), 2.1);
          vec3 col = mix(vColor, uAccent, 0.32);
          gl_FragColor = vec4(col, soft * vAlpha * 0.58);
        }
      `,
    });
    disposables.push(nebGeo, nebMat);
    const galaxyGroup = new THREE.Group();
    galaxyGroup.rotation.set(0.46, 0.18, -0.22);
    galaxyGroup.position.set(0, -0.2, -2.5);
    galaxyGroup.add(new THREE.Points(nebGeo, nebMat));
    scene.add(galaxyGroup);

    // ================= 4. SUPERNOVA COSMIC BURST SHELL & STARLIGHT STREAKS =================
    const BURST_COUNT = 2600;
    const burstDirs = new Float32Array(BURST_COUNT * 3);
    const burstSeeds = new Float32Array(BURST_COUNT * 3); // [speedScale, size, colorMix]
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < BURST_COUNT; i++) {
      const u = (i + 0.5) / BURST_COUNT;
      const r1 = deterministicHash(i * 29.11 + 6.32);
      const r2 = deterministicHash(i * 64.97 + 1.84);
      const phi = Math.acos(1 - 2 * u);
      const theta = goldenAngle * i + r1 * 0.35;

      burstDirs[i * 3] = Math.sin(phi) * Math.cos(theta);
      burstDirs[i * 3 + 1] = Math.cos(phi) * 0.85;
      burstDirs[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);

      burstSeeds[i * 3] = 0.45 + r1 * 1.45;
      burstSeeds[i * 3 + 1] = 0.75 + r2 * 1.25;
      burstSeeds[i * 3 + 2] = r2;
    }

    const burstGeo = new THREE.BufferGeometry();
    burstGeo.setAttribute('position', new THREE.BufferAttribute(burstDirs, 3));
    burstGeo.setAttribute('aSeed', new THREE.BufferAttribute(burstSeeds, 3));
    burstGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 30);

    const burstMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uBurstEnergy: { value: 0 },
        uStageIntensity: { value: 0 },
        uAccent: { value: new THREE.Color(0x38bdf8) },
        uCursorWorld: { value: new THREE.Vector3(0, 0, 0) },
        uCursorActive: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aSeed;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uBurstEnergy;
        uniform float uStageIntensity;
        uniform vec3 uAccent;
        uniform vec3 uCursorWorld;
        uniform float uCursorActive;

        varying float vAlpha;
        varying float vHeat;

        void main() {
          vec3 dir = normalize(position);

          // Erupt outward cleanly in cosmic supernova waves when transitionFocus or cosmic burst peaks
          float shockRadius = 1.15 + uBurstEnergy * 6.8 * aSeed.x;
          float swirlAngle = uBurstEnergy * 1.35 * (aSeed.z - 0.5) + uTime * 0.22;
          float cs = cos(swirlAngle);
          float sn = sin(swirlAngle);
          dir.xz = mat2(cs, -sn, sn, cs) * dir.xz;

          vec3 p = dir * shockRadius;
          p.z -= 1.2;

          // Cursor repulsion inside shockwave
          vec3 diff = p - uCursorWorld;
          float cDist = length(diff);
          float cField = exp(-cDist * cDist * 0.22) * uCursorActive;
          p += normalize(diff + vec3(0.01)) * cField * 0.85;

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          float viewDist = max(1.0, -mvPos.z);

          vHeat = clamp(aSeed.z * 0.65 + uBurstEnergy * 0.55, 0.0, 1.0);
          vAlpha = uStageIntensity * clamp(uBurstEnergy * 1.15, 0.0, 1.0) * smoothstep(24.0, 6.5, viewDist);

          float ptSize = (11.0 + uBurstEnergy * 14.0) * aSeed.y * uPixelRatio;
          gl_PointSize = clamp(ptSize / viewDist, 1.2, 18.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uAccent;
        varying float vAlpha;
        varying float vHeat;

        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float core = pow(clamp(1.0 - d * 2.0, 0.0, 1.0), 2.4);
          vec3 hotWhite = vec3(0.95, 0.99, 1.0);
          vec3 col = mix(uAccent, hotWhite, vHeat * core);
          gl_FragColor = vec4(col, core * vAlpha);
        }
      `,
    });
    disposables.push(burstGeo, burstMat);
    const burstPoints = new THREE.Points(burstGeo, burstMat);
    burstPoints.frustumCulled = false;
    scene.add(burstPoints);

    // ================= 5. SHOOTING-STAR / WARP METEOR STREAKS (140 TRACERS) =================
    const STREAK_COUNT = 140;
    const streakPos = new Float32Array(STREAK_COUNT * 6); // 2 vertices per streak segment
    const streakMeta = new Float32Array(STREAK_COUNT * 6); // [radiusOffset, speed, phase] repeated for head & tail

    for (let i = 0; i < STREAK_COUNT; i++) {
      const r1 = deterministicHash(i * 41.7 + 2.1);
      const r2 = deterministicHash(i * 17.3 + 9.4);
      const r3 = deterministicHash(i * 73.9 + 5.2);

      const angle = r1 * Math.PI * 2;
      const spreadR = 0.85 + r2 * 6.4;
      const x = Math.cos(angle) * spreadR * 1.35;
      const y = Math.sin(angle) * spreadR * 0.92;

      streakPos[i * 6] = x;
      streakPos[i * 6 + 1] = y;
      streakPos[i * 6 + 2] = 0.0; // tail flag (0 = head)

      streakPos[i * 6 + 3] = x;
      streakPos[i * 6 + 4] = y;
      streakPos[i * 6 + 5] = 1.0; // head/tail indicator (1 = trailing tail)

      const speed = 0.35 + r3 * 0.85;
      const phase = r1;
      for (let v = 0; v < 2; v++) {
        streakMeta[i * 6 + v * 3] = spreadR;
        streakMeta[i * 6 + v * 3 + 1] = speed;
        streakMeta[i * 6 + v * 3 + 2] = phase;
      }
    }

    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    streakGeo.setAttribute('aStreak', new THREE.BufferAttribute(streakMeta, 3));
    streakGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -5), 35);

    const streakMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBurstEnergy: { value: 0 },
        uStageIntensity: { value: 0 },
        uAccent: { value: new THREE.Color(0x7dd3fc) },
      },
      vertexShader: `
        attribute vec3 aStreak;

        uniform float uTime;
        uniform float uBurstEnergy;
        uniform float uStageIntensity;

        varying float vTailFade;
        varying float vEnergyAlpha;

        void main() {
          float isTail = position.z;
          float t = fract(aStreak.z + uTime * aStreak.y * (0.45 + uBurstEnergy * 1.4));

          // Travel radially outward + toward viewer like cosmic starlight warp trails
          float travelZ = mix(-28.0, 8.5, t);
          float radialExpand = 1.0 + t * (0.45 + uBurstEnergy * 0.75);
          float trailLen = (0.65 + uBurstEnergy * 2.4) * aStreak.y;

          vec3 p = vec3(
            position.x * radialExpand,
            position.y * radialExpand,
            travelZ - isTail * trailLen
          );

          vTailFade = 1.0 - isTail * 0.85;
          vEnergyAlpha =
            uStageIntensity *
            smoothstep(0.0, 0.14, t) *
            smoothstep(1.0, 0.82, t) *
            (0.14 + uBurstEnergy * 0.86);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uAccent;
        varying float vTailFade;
        varying float vEnergyAlpha;

        void main() {
          vec3 col = mix(uAccent, vec3(0.95, 0.99, 1.0), vTailFade * 0.65);
          gl_FragColor = vec4(col, vTailFade * vEnergyAlpha);
        }
      `,
    });
    disposables.push(streakGeo, streakMat);
    const streakLines = new THREE.LineSegments(streakGeo, streakMat);
    streakLines.frustumCulled = false;
    scene.add(streakLines);

    // ================= 6. POSTPROCESSING (GPU ONLY) =================
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.52,
        0.52,
        0.34
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      renderer.compile(scene, camera);
    }

    // ================= 7. POINTER INTERACTION & BURST EVENTS =================
    let cursorActiveTarget = 0;
    let cursorActiveCurrent = 0;
    let camTargetX = 0;
    let camTargetY = 0;
    let localBurstImpulse = 0;
    let darkBlend = isDarkRef.current ? 1 : 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointerNdc, camera);
      _raycaster.ray.intersectPlane(_cursorPlane, _cursorTarget);

      camTargetX = _pointerNdc.x * 0.72;
      camTargetY = _pointerNdc.y * 0.42;
      cursorActiveTarget = 1;
    };

    const onPointerLeave = () => {
      cursorActiveTarget = 0;
      camTargetX = 0;
      camTargetY = 0;
    };

    const onBurstEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ strength?: number }>).detail;
      localBurstImpulse = Math.min(1.8, Math.max(localBurstImpulse, detail?.strength ?? 1.0));
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener(LP_BURST_EVENT, onBurstEvent);

    const onResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
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

    // ================= 8. ANIMATION LOOP =================
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

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const delta = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const state = stageStateRef.current;

      state.burstImpulse = Math.max(0, state.burstImpulse - delta * 1.4);
      localBurstImpulse = Math.max(0, localBurstImpulse - delta * 1.4);
      const totalBurst = Math.min(1.6, state.burstImpulse + localBurstImpulse);

      if (!prefersReducedMotion) {
        elapsedTime += delta;
      }

      const targetDark = isDarkRef.current ? 1 : 0;
      darkBlend = THREE.MathUtils.lerp(darkBlend, targetDark, 1 - Math.exp(-6.0 * delta));

      const focus = Math.max(0, Math.min(1, state.transitionFocus));
      const stageInt = Math.max(0, Math.min(1, state.stageIntensity));
      const progress = state.morphProgress;
      const vel = THREE.MathUtils.clamp(state.scrollVelocity, -4, 4);
      const burstEnergy = Math.min(1.8, focus * 0.95 + totalBurst * 0.85 + Math.abs(vel) * 0.14);

      sampleCosmicTint(progress, _activeCosmicTint);

      // Deep-space atmospheric sky backdrop fades in seamlessly during transitions & dark mode
      if (scrimRef.current) {
        const scrimOpacity =
          stageInt *
          (isDarkRef.current
            ? 0.28 + focus * 0.62
            : focus * 0.78);
        scrimRef.current.style.opacity = scrimOpacity.toFixed(3);
      }

      // Smooth camera parallax + subtle cosmic warp FOV pulse
      const damp = 1 - Math.exp(-6.2 * delta);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, camTargetX, damp);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, camTargetY, damp);
      const targetZ = 12.5 - focus * 1.8 - totalBurst * 0.65;
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, damp);
      camera.lookAt(0, 0, -2.0);

      // Gentle galactic tilt shift across chapters
      galaxyGroup.rotation.x = 0.44 + Math.sin(progress * 0.7) * 0.18;
      galaxyGroup.rotation.z = -0.22 + progress * 0.14;
      galaxyGroup.rotation.y = 0.18 + elapsedTime * 0.028;

      _cursorCurrent.lerp(_cursorTarget, 1 - Math.exp(-9.0 * delta));
      cursorActiveCurrent = THREE.MathUtils.lerp(
        cursorActiveCurrent,
        cursorActiveTarget,
        1 - Math.exp(-5.0 * delta)
      );

      // Volumetric core nebula glow
      coreGlowMat.color.copy(_activeCosmicTint);
      coreGlowMat.opacity = stageInt * (0.14 + burstEnergy * 0.46) * Math.max(darkBlend, focus);
      const coreScale = 12.5 + burstEnergy * 5.2;
      coreGlowSprite.scale.set(coreScale, coreScale * 0.72, 1);

      haloGlowMat.opacity = stageInt * (0.1 + burstEnergy * 0.34) * Math.max(darkBlend, focus);

      // Starfield uniforms
      starMat.uniforms.uTime.value = elapsedTime;
      starMat.uniforms.uScrollProgress.value = progress;
      starMat.uniforms.uTransitionFocus.value = focus;
      starMat.uniforms.uVelocity.value = vel;
      starMat.uniforms.uBurst.value = totalBurst;
      starMat.uniforms.uStageIntensity.value = stageInt;
      starMat.uniforms.uDarkMode.value = darkBlend;
      starMat.uniforms.uCursorWorld.value.copy(_cursorCurrent);
      starMat.uniforms.uCursorActive.value = cursorActiveCurrent;

      // Spiral galaxy & cosmic nebula uniforms
      nebMat.uniforms.uTime.value = elapsedTime;
      nebMat.uniforms.uTransitionFocus.value = focus;
      nebMat.uniforms.uBurst.value = totalBurst;
      nebMat.uniforms.uStageIntensity.value = stageInt;
      nebMat.uniforms.uAccent.value.copy(_activeCosmicTint);
      nebMat.uniforms.uCursorWorld.value.copy(_cursorCurrent);
      nebMat.uniforms.uCursorActive.value = cursorActiveCurrent;

      // Supernova burst shockwave uniforms
      burstMat.uniforms.uTime.value = elapsedTime;
      burstMat.uniforms.uBurstEnergy.value = burstEnergy;
      burstMat.uniforms.uStageIntensity.value = stageInt;
      burstMat.uniforms.uAccent.value.copy(_activeCosmicTint);
      burstMat.uniforms.uCursorWorld.value.copy(_cursorCurrent);
      burstMat.uniforms.uCursorActive.value = cursorActiveCurrent;

      // Shooting-star meteor streaks uniforms
      streakMat.uniforms.uTime.value = elapsedTime;
      streakMat.uniforms.uBurstEnergy.value = burstEnergy;
      streakMat.uniforms.uStageIntensity.value = stageInt;
      streakMat.uniforms.uAccent.value.copy(_activeCosmicTint);

      if (bloomPass) {
        bloomPass.strength = 0.34 + burstEnergy * 0.42;
      }

      if (composer && !isSoftwareGl) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

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
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener(LP_BURST_EVENT, onBurstEvent);
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
  }, [stageStateRef]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden"
    >
      {/* Deep-space cosmic horizon veil intensifying smoothly during scroll transitions */}
      <div
        ref={scrimRef}
        style={{
          opacity: 0,
          background:
            'radial-gradient(ellipse 92% 84% at 50% 48%, rgba(4, 9, 28, 0.94) 0%, rgba(2, 6, 20, 0.92) 55%, rgba(1, 3, 12, 0.98) 100%)',
        }}
        className="absolute inset-0 transition-none"
      />

      {/* Three.js Universe, Starfield, Spiral Nebula & Cosmic Burst Canvas */}
      <div ref={mountRef} className="w-full h-full" />

      {webglFailed && (
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/20 to-transparent" />
      )}
    </div>
  );
}
