'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { motion } from 'motion/react';
import { ShieldAlert, RotateCcw, Lock } from 'lucide-react';
import { MaskedReveal } from './MotionPrimitives';

interface RefusedTerms3DProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

// Pre-allocated math helpers outside render loop (zero per-frame GC)
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _rayHit = new THREE.Vector3();
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();

function createEmberGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0.0, 'rgba(255, 220, 195, 0.9)');
    grad.addColorStop(0.3, 'rgba(244, 63, 94, 0.45)');
    grad.addColorStop(0.65, 'rgba(245, 158, 11, 0.14)');
    grad.addColorStop(1.0, 'rgba(10, 4, 8, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function RefusedTerms3D({ onRetry, isRetrying = false }: RefusedTerms3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [isCoreHovered, setIsCoreHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);

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

    // Detect software WebGL cleanly using renderer string
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
    const height = container.clientHeight || window.innerHeight;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x090308, 1);

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090308);
    scene.fog = new THREE.FogExp2(0x090308, 0.055);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 80);
    camera.position.set(0, 0.25, 8.6);
    camera.lookAt(0, 0.1, 0);

    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];
    const texturesToDispose: THREE.Texture[] = [];

    // Environment reflections on GPU (RoomEnvironment) + clean key/rim lights
    let pmremGenerator: THREE.PMREMGenerator | null = null;
    let envRenderTarget: THREE.WebGLRenderTarget | null = null;
    if (!isSoftwareGl) {
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
      scene.environment = envRenderTarget.texture;
      roomEnv.dispose();
    }

    const ambientLight = new THREE.AmbientLight(0x3b0a1a, 1.2);
    scene.add(ambientLight);

    const crimsonKeyLight = new THREE.PointLight(0xf43f5e, 14, 18, 1.6);
    crimsonKeyLight.position.set(2.8, 3.2, 4.2);
    scene.add(crimsonKeyLight);

    const amberRimLight = new THREE.PointLight(0xf59e0b, 10, 18, 1.6);
    amberRimLight.position.set(-3.4, -2.1, 3.2);
    scene.add(amberRimLight);

    const backCoolLight = new THREE.DirectionalLight(0x6366f1, 0.85);
    backCoolLight.position.set(0, 2, -5);
    scene.add(backCoolLight);

    // Volumetric glow backdrop sprite behind the 3D lockdown assembly
    const glowTex = createEmberGlowTexture();
    texturesToDispose.push(glowTex);

    const backdropMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    materialsToDispose.push(backdropMat);

    const backdropSprite = new THREE.Sprite(backdropMat);
    backdropSprite.position.set(0, 0.15, -1.8);
    backdropSprite.scale.set(8.2, 8.2, 1);
    scene.add(backdropSprite);

    // Composite 3D Lockdown Core Group (multi-part engineered artifact)
    const lockGroup = new THREE.Group();
    lockGroup.position.set(0, 0.25, 0);
    scene.add(lockGroup);

    // 1. Inner metallic core octahedron (dark obsidian PBR)
    const innerCoreGeo = new THREE.OctahedronGeometry(0.68, 0);
    const innerCoreMat = new THREE.MeshStandardMaterial({
      color: 0x1e0914,
      metalness: 0.88,
      roughness: 0.22,
      emissive: 0x9f1239,
      emissiveIntensity: 0.65,
    });
    geometriesToDispose.push(innerCoreGeo);
    materialsToDispose.push(innerCoreMat);
    const innerCoreMesh = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    lockGroup.add(innerCoreMesh);

    // 2. Fresnel Energy Containment Crystal Shell (Custom GLSL ShaderMaterial)
    const crystalGeo = new THREE.IcosahedronGeometry(1.02, 1);
    const crystalMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uHover: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform float uTime;
        uniform float uPulse;
        void main() {
          float breath = 1.0 + sin(uTime * 2.4) * 0.02 + uPulse * 0.14;
          vec3 displaced = position * breath;
          vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform float uTime;
        uniform float uPulse;
        uniform float uHover;
        void main() {
          float rim = 1.0 - max(0.0, dot(vViewDir, vNormal));
          float fresnel = pow(rim, 2.35);
          vec3 crimson = vec3(0.98, 0.18, 0.36);
          vec3 amber = vec3(1.0, 0.64, 0.14);
          vec3 hotCore = vec3(1.0, 0.88, 0.84);
          float shift = 0.5 + 0.5 * sin(uTime * 1.8 + vNormal.y * 3.0);
          vec3 col = mix(crimson, amber, shift * 0.55 + uHover * 0.25);
          col = mix(col, hotCore, uPulse * 0.65);
          float alpha = clamp(0.14 + fresnel * 0.82 + uPulse * 0.25, 0.0, 0.96);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    geometriesToDispose.push(crystalGeo);
    materialsToDispose.push(crystalMat);
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    lockGroup.add(crystalMesh);

    // 3. Outer Polyhedral Wireframe Barrier Cage + Instanced Vertex Nodes
    const cageBaseGeo = new THREE.IcosahedronGeometry(1.52, 1);
    const cageEdgesGeo = new THREE.EdgesGeometry(cageBaseGeo);
    const cageMat = new THREE.LineBasicMaterial({
      color: 0xfb7185,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    geometriesToDispose.push(cageBaseGeo, cageEdgesGeo);
    materialsToDispose.push(cageMat);
    const cageMesh = new THREE.LineSegments(cageEdgesGeo, cageMat);
    lockGroup.add(cageMesh);

    // Unique vertex positions on the containment cage for instanced metallic anchor nodes
    const cagePosAttr = cageBaseGeo.getAttribute('position');
    const uniqueVerts: THREE.Vector3[] = [];
    for (let i = 0; i < cagePosAttr.count; i++) {
      const vx = cagePosAttr.getX(i);
      const vy = cagePosAttr.getY(i);
      const vz = cagePosAttr.getZ(i);
      const exists = uniqueVerts.some(
        (v) => Math.abs(v.x - vx) < 0.01 && Math.abs(v.y - vy) < 0.01 && Math.abs(v.z - vz) < 0.01
      );
      if (!exists) {
        uniqueVerts.push(new THREE.Vector3(vx, vy, vz));
      }
    }

    const nodeGeo = new THREE.SphereGeometry(0.042, 10, 10);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xf43f5e,
      emissiveIntensity: 1.5,
      metalness: 0.6,
      roughness: 0.2,
    });
    geometriesToDispose.push(nodeGeo);
    materialsToDispose.push(nodeMat);

    const nodesInstanced = new THREE.InstancedMesh(nodeGeo, nodeMat, uniqueVerts.length);
    for (let i = 0; i < uniqueVerts.length; i++) {
      _dummyPos.copy(uniqueVerts[i]);
      _dummyMatrix.makeTranslation(_dummyPos.x, _dummyPos.y, _dummyPos.z);
      nodesInstanced.setMatrixAt(i, _dummyMatrix);
    }
    nodesInstanced.instanceMatrix.needsUpdate = true;
    cageMesh.add(nodesInstanced);

    // 4. Dual Counter-Rotating Metallic Gyroscopic Lock Rings
    const ringOuterGeo = new THREE.TorusGeometry(2.14, 0.038, 16, 96);
    const ringOuterMat = new THREE.MeshStandardMaterial({
      color: 0x3f1022,
      metalness: 0.92,
      roughness: 0.18,
      emissive: 0xe11d48,
      emissiveIntensity: 0.45,
    });
    geometriesToDispose.push(ringOuterGeo);
    materialsToDispose.push(ringOuterMat);
    const outerRing = new THREE.Mesh(ringOuterGeo, ringOuterMat);
    outerRing.rotation.set(Math.PI * 0.36, 0.25, 0);
    lockGroup.add(outerRing);

    const ringInnerGeo = new THREE.TorusGeometry(1.86, 0.028, 16, 84);
    const ringInnerMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.52,
    });
    geometriesToDispose.push(ringInnerGeo);
    materialsToDispose.push(ringInnerMat);
    const innerRing = new THREE.Mesh(ringInnerGeo, ringInnerMat);
    innerRing.rotation.set(-Math.PI * 0.28, -0.4, Math.PI * 0.15);
    lockGroup.add(innerRing);

    // 5. Invisible Raycast Hit Sphere around Lock Core (for hover & click pulse feedback)
    const hitSphereGeo = new THREE.SphereGeometry(2.05, 16, 16);
    const hitSphereMat = new THREE.MeshBasicMaterial({ visible: false });
    geometriesToDispose.push(hitSphereGeo);
    materialsToDispose.push(hitSphereMat);
    const hitSphereMesh = new THREE.Mesh(hitSphereGeo, hitSphereMat);
    lockGroup.add(hitSphereMesh);

    // 6. Reactive Warning Ember & Security Telemetry Particle Field (~1,400 particles)
    const EMBER_COUNT = 1400;
    const emberPositions = new Float32Array(EMBER_COUNT * 3);
    const emberParams = new Float32Array(EMBER_COUNT * 4); // [orbitRadius, angle, speed, colorMix]

    for (let i = 0; i < EMBER_COUNT; i++) {
      const t = i / EMBER_COUNT;
      const radius = 2.35 + ((i * 1973) % 100) * 0.045;
      const theta = t * Math.PI * 2 * 17.0;
      const phi = Math.acos(1 - 2 * ((i * 7919) % 1000) / 1000);

      emberPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      emberPositions[i * 3 + 1] = radius * Math.cos(phi) * 0.72;
      emberPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      emberParams[i * 4] = radius;
      emberParams[i * 4 + 1] = theta;
      emberParams[i * 4 + 2] = 0.22 + ((i * 31) % 10) * 0.04;
      emberParams[i * 4 + 3] = (i % 7) / 6;
    }

    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    emberGeo.setAttribute('aParam', new THREE.BufferAttribute(emberParams, 4));

    const emberMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uCursorWorld: { value: new THREE.Vector3(0, 0, 0) },
        uCursorStrength: { value: 0 },
        uPulse: { value: 0 },
      },
      vertexShader: `
        attribute vec4 aParam;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec3 uCursorWorld;
        uniform float uCursorStrength;
        uniform float uPulse;
        varying float vColorMix;
        varying float vAlpha;

        void main() {
          float speed = aParam.z;
          float colorBias = aParam.w;

          float rot = uTime * speed * 0.35;
          float c = cos(rot);
          float s = sin(rot);

          vec3 pos = position;
          pos.xz = vec2(pos.x * c - pos.z * s, pos.x * s + pos.z * c);
          pos.y += sin(uTime * 1.4 + aParam.y) * 0.16;

          // Shockwave expansion on click
          vec3 radialDir = normalize(pos + vec3(0.001));
          pos += radialDir * uPulse * 0.75;

          // Interactive cursor force repulsion
          vec3 dCursor = pos - uCursorWorld;
          float cDist = length(dCursor);
          float forceMask = exp(-(cDist * cDist) / 5.5) * uCursorStrength;
          pos += normalize(dCursor + vec3(0.0, 0.15, 0.2)) * forceMask * 0.95;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          float camDist = max(1.2, -mvPos.z);

          vColorMix = clamp(colorBias + forceMask * 0.5 + uPulse * 0.4, 0.0, 1.0);
          vAlpha = smoothstep(16.0, 4.0, camDist) * (0.45 + 0.45 * sin(uTime * 2.0 + aParam.y));

          gl_PointSize = (2.6 + colorBias * 2.2 + uPulse * 2.0) * uPixelRatio * (8.5 / camDist);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vColorMix;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float intensity = exp(-d * d * 12.0);
          vec3 crimson = vec3(0.96, 0.18, 0.38);
          vec3 amber = vec3(1.0, 0.66, 0.16);
          vec3 col = mix(crimson, amber, vColorMix);
          gl_FragColor = vec4(col, intensity * vAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    geometriesToDispose.push(emberGeo);
    materialsToDispose.push(emberMat);
    const emberPoints = new THREE.Points(emberGeo, emberMat);
    emberPoints.position.set(0, 0.25, 0);
    scene.add(emberPoints);

    // 7. Post-processing UnrealBloomPass on GPU devices only
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.62, 0.45, 0.32);
      composer.addPass(bloomPass);
      renderer.compile(scene, camera);
    }

    // 8. Pointer Drag, Hover Raycast, & Click Shockwave State
    const pointerNdc = { x: 0, y: 0, active: false };
    const pointerSmooth = { x: 0, y: 0 };
    const cursorWorldSmooth = new THREE.Vector3(0, 0, 0);
    let cursorStrengthSmooth = 0;

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMovedDist = 0;
    let targetRotX = 0.15;
    let targetRotY = 0;
    let currentRotX = 0.15;
    let currentRotY = 0;
    let pulseImpulse = 0;
    let hoverSmooth = 0;
    let lastHoveredState = false;

    const updatePointerFromEvent = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      pointerNdc.active = true;
    };

    const handlePointerDown = (e: PointerEvent) => {
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragMovedDist = 0;
      setIsDragging(true);
      updatePointerFromEvent(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: PointerEvent) => {
      updatePointerFromEvent(e.clientX, e.clientY);
      if (dragging) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        dragMovedDist += Math.hypot(dx, dy);
        targetRotY += dx * 0.0085;
        targetRotX = Math.max(-1.2, Math.min(1.2, targetRotX + dy * 0.0075));
        dragStartX = e.clientX;
        dragStartY = e.clientY;
      }
    };

    const handlePointerUp = () => {
      if (dragging && dragMovedDist < 8) {
        // Click/tap shockwave pulse on lockdown core
        pulseImpulse = 1.0;
        targetRotY += 0.45;
        setPulseCount((c) => c + 1);
      }
      dragging = false;
      setIsDragging(false);
    };

    const handlePointerLeave = () => {
      pointerNdc.active = false;
      dragging = false;
      setIsDragging(false);
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    domEl.addEventListener('pointerleave', handlePointerLeave);

    const handleResize = () => {
      if (!container) return;
      const nextW = container.clientWidth || window.innerWidth;
      const nextH = container.clientHeight || window.innerHeight;
      const nextPr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(nextPr);
      renderer.setSize(nextW, nextH);
      emberMat.uniforms.uPixelRatio.value = nextPr;

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
    domEl.addEventListener('webglcontextlost', handleContextLost);

    // 9. Paced Render Loop
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

      pointerSmooth.x = THREE.MathUtils.damp(
        pointerSmooth.x,
        pointerNdc.active ? pointerNdc.x : 0,
        5.0,
        delta
      );
      pointerSmooth.y = THREE.MathUtils.damp(
        pointerSmooth.y,
        pointerNdc.active ? pointerNdc.y : 0,
        5.0,
        delta
      );

      cursorStrengthSmooth = THREE.MathUtils.damp(
        cursorStrengthSmooth,
        pointerNdc.active ? 1.0 : 0.0,
        5.0,
        delta
      );

      // Raycast hover check against 3D lockdown sphere
      let hoveredNow = false;
      if (pointerNdc.active) {
        _ndc.set(pointerSmooth.x, pointerSmooth.y);
        _raycaster.setFromCamera(_ndc, camera);
        const hits = _raycaster.intersectObject(hitSphereMesh, false);
        hoveredNow = hits.length > 0;
        if (_raycaster.ray.intersectPlane(_interactionPlane, _rayHit)) {
          cursorWorldSmooth.x = THREE.MathUtils.damp(cursorWorldSmooth.x, _rayHit.x, 7.0, delta);
          cursorWorldSmooth.y = THREE.MathUtils.damp(cursorWorldSmooth.y, _rayHit.y, 7.0, delta);
          cursorWorldSmooth.z = THREE.MathUtils.damp(cursorWorldSmooth.z, _rayHit.z, 7.0, delta);
        }
      }

      if (hoveredNow !== lastHoveredState) {
        lastHoveredState = hoveredNow;
        setIsCoreHovered(hoveredNow);
      }

      hoverSmooth = THREE.MathUtils.damp(hoverSmooth, hoveredNow ? 1.0 : 0.0, 6.0, delta);
      pulseImpulse = THREE.MathUtils.damp(pulseImpulse, 0.0, 4.2, delta);

      // Gentle idle spin when not dragging
      if (!dragging) {
        targetRotY += delta * (0.26 + hoverSmooth * 0.22);
        targetRotX = THREE.MathUtils.damp(targetRotX, 0.16 - pointerSmooth.y * 0.22, 3.0, delta);
      }

      currentRotX = THREE.MathUtils.damp(currentRotX, targetRotX, 8.0, delta);
      currentRotY = THREE.MathUtils.damp(currentRotY, targetRotY, 8.0, delta);

      lockGroup.rotation.x = currentRotX;
      lockGroup.rotation.y = currentRotY;

      // Counter-rotate internal gyroscopic components
      innerCoreMesh.rotation.y -= delta * 0.65;
      innerCoreMesh.rotation.z += delta * 0.35;
      cageMesh.rotation.y -= delta * (0.18 + pulseImpulse * 1.4);
      outerRing.rotation.z += delta * (0.42 + pulseImpulse * 1.8);
      innerRing.rotation.x -= delta * (0.55 + pulseImpulse * 2.1);

      // Subtle camera parallax
      camera.position.x = THREE.MathUtils.damp(camera.position.x, pointerSmooth.x * 0.45, 3.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.25 + pointerSmooth.y * 0.28, 3.5, delta);
      camera.lookAt(0, 0.1, 0);

      // Uniform updates
      crystalMat.uniforms.uTime.value = elapsed;
      crystalMat.uniforms.uPulse.value = pulseImpulse;
      crystalMat.uniforms.uHover.value = hoverSmooth;

      emberMat.uniforms.uTime.value = elapsed;
      emberMat.uniforms.uCursorWorld.value.copy(cursorWorldSmooth);
      emberMat.uniforms.uCursorStrength.value = cursorStrengthSmooth;
      emberMat.uniforms.uPulse.value = pulseImpulse;

      backdropMat.opacity = 0.36 + pulseImpulse * 0.28 + hoverSmooth * 0.1;

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

      domEl.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      domEl.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('resize', handleResize);
      domEl.removeEventListener('webglcontextlost', handleContextLost);

      for (const geo of geometriesToDispose) geo.dispose();
      for (const mat of materialsToDispose) mat.dispose();
      for (const tex of texturesToDispose) tex.dispose();
      if (envRenderTarget) envRenderTarget.dispose();
      if (pmremGenerator) pmremGenerator.dispose();
      if (composer) composer.dispose();
      renderer.dispose();

      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
    };
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[120] min-h-screen w-full overflow-y-auto bg-[#090308] text-white select-none"
    >
      {/* Dedicated WebGL Mount Container (never mixes HUD children) */}
      {webglUnavailable ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.22),rgba(9,3,8,0.98)_68%)]"
        />
      ) : (
        <div
          ref={mountRef}
          className={`fixed inset-0 w-full h-full ${
            isDragging ? 'cursor-grabbing' : isCoreHovered ? 'cursor-pointer' : 'cursor-grab'
          }`}
        />
      )}

      {/* Subtle edge vignette without backdrop-blur */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none bg-gradient-to-b from-[#090308]/80 via-transparent to-[#090308]/92"
      />

      {/* Architectural Viewport Reticle Brackets */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-4 sm:inset-6 z-10 hidden sm:block"
      >
        <span className="absolute top-0 left-0 w-3.5 h-3.5 border-t border-l border-rose-400/35" />
        <span className="absolute top-0 right-0 w-3.5 h-3.5 border-t border-r border-rose-400/35" />
        <span className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b border-l border-rose-400/35" />
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b border-r border-rose-400/35" />
      </div>

      {/* Crisp Interactive Error Overlay (pointer-events-none wrapper lets user spin 3D lock freely) */}
      <div className="relative z-10 pointer-events-none min-h-screen w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-between">
        {/* Top Error Header */}
        <div className="text-center space-y-2.5 pt-2">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-rose-300/95"
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Error 403 · Access Locked</span>
          </motion.div>

          <MaskedReveal delay={0.08}>
            <h1 className="text-2xl sm:text-4xl lg:text-[2.65rem] font-extrabold tracking-tight text-white text-balance [text-shadow:0_4px_24px_rgba(9,3,8,0.95)]">
              Safe-Use Terms Declined
            </h1>
          </MaskedReveal>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="text-sm sm:text-base text-rose-100/85 max-w-xl mx-auto [text-shadow:0_2px_14px_rgba(9,3,8,0.95)]"
          >
            Access to LinkPulse is restricted until you accept the Safe-Use &amp; Liability
            Disclaimer.
          </motion.p>
        </div>

        {/* Open Center Window for Interactive 3D Security Core */}
        <div className="h-56 sm:h-72 lg:h-80 flex items-end justify-center pb-2" aria-hidden="true">
          {!webglUnavailable && (
            <span className="text-[11px] font-mono tabular-nums text-rose-200/70 tracking-wide [text-shadow:0_2px_10px_rgba(9,3,8,0.95)]">
              Drag to rotate 3D security lock · Click core to pulse
              {pulseCount > 0 ? ` (${pulseCount})` : ''}
            </span>
          )}
        </div>

        {/* Bottom Solid Action Panel (no backdrop-blur over WebGL) */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto max-w-lg w-full mx-auto rounded-2xl bg-[#130710]/92 border border-rose-500/35 p-5 sm:p-6 shadow-2xl space-y-4 text-center"
        >
          <div className="flex items-start gap-3 text-left text-xs sm:text-sm text-rose-100/90 leading-relaxed">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              To protect visitors and infrastructure, this platform cannot be opened without
              confirming that you will use it strictly for safe, lawful purposes and accept full
              responsibility for your links.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="group w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 active:scale-[0.98] disabled:opacity-60 text-white font-semibold text-sm transition-all shadow-lg shadow-rose-900/40 whitespace-nowrap"
            >
              <RotateCcw className={`w-4 h-4 transition-transform duration-200 group-hover:-rotate-45 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Reloading Disclaimer...' : 'Retry & Accept Terms'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
