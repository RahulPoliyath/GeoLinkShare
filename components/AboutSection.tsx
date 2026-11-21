'use client';

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Cpu,
  Crosshair,
  FileText,
  Gavel,
  Globe2,
  Info,
  KeyRound,
  Layers,
  Link2,
  Lock,
  Orbit,
  QrCode,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { MagneticShell, MaskedReveal, SpotlightCard } from './MotionPrimitives';
import {
  LP_SCROLL_TO_EVENT,
  ScrollStageState,
  createInitialScrollStageState,
  requestSmoothScrollTo,
  triggerCosmicBurst,
} from '@/lib/scroll-stage';

gsap.registerPlugin(ScrollTrigger);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type WorkspaceTab = 'shorten' | 'dashboard' | 'analytics' | 'security' | 'about';

interface AboutSectionProps {
  stageStateRef?: React.MutableRefObject<ScrollStageState>;
  onNavigateTab?: (tab: WorkspaceTab) => void;
}

const ARCHITECTURE_STAGES = [
  {
    step: '01',
    title: 'High-Entropy Forge',
    metric: '6-Char CSPRNG / Alias',
    summary:
      'Generates collision-resistant short slugs or validated custom aliases with real-time domain and URL scheme verification.',
    icon: Link2,
    accent: 'text-indigo-600 dark:text-cyan-300 bg-indigo-500/12 border-indigo-500/25',
  },
  {
    step: '02',
    title: 'Edge SSRF & XSS Scan',
    metric: 'Zero-Trust Perimeter',
    summary:
      'Blocks private RFC 1918 subnets, loopback hosts, cloud metadata IPs, credential phishing, and injected script payloads.',
    icon: ShieldCheck,
    accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/12 border-emerald-500/25',
  },
  {
    step: '03',
    title: 'Access & GNSS Gate',
    metric: '12-Round Bcrypt + GPS',
    summary:
      'Optional server-sealed passcodes and opt-in multi-sample browser GPS precision down to a 1.0m verification target.',
    icon: Crosshair,
    accent: 'text-sky-600 dark:text-sky-400 bg-sky-500/12 border-sky-500/25',
  },
  {
    step: '04',
    title: 'Live Telemetry Core',
    metric: '3.5s Live Stream',
    summary:
      'Streams masked visitor analytics, device fingerprints, referral channels, and interactive Leaflet geographic pins.',
    icon: BarChart3,
    accent: 'text-amber-600 dark:text-amber-400 bg-amber-500/12 border-amber-500/25',
  },
] as const;

const HOW_TO_STEPS = [
  {
    step: '01',
    title: 'Enter Safe-Use Workspace',
    description:
      'Accept the Safe-Use Disclaimer once per session. XrGeoLink issues an isolated cryptographic workspace ID automatically—no sign-up, email, or password required.',
    icon: KeyRound,
  },
  {
    step: '02',
    title: 'Configure URL & Security Controls',
    description:
      'Paste any public http/https destination URL. Expand Advanced Controls to attach a custom alias, title, tags, expiry timer, 12-round bcrypt passcode, or High-Accuracy GPS Gate.',
    icon: Sliders,
  },
  {
    step: '03',
    title: 'Distribute Short Link or QR Code',
    description:
      'Copy your /r/[code] URL with one click, verify redirection in a fresh tab, or export a crisp scannable QR code directly from the creation panel or My Links table.',
    icon: QrCode,
  },
  {
    step: '04',
    title: 'Inspect Live Analytics & Manage Routes',
    description:
      'Open Real-Time Analytics to track 7-day click velocity, country clusters, hardware breakdown, and interactive map pins, or pause, edit, and delete links in My Links.',
    icon: Compass,
  },
] as const;

const PLATFORM_FUNCTIONS = [
  {
    title: 'Shorten & Custom Alias Engine',
    badge: 'Core Routing',
    icon: Link2,
    details:
      'Validates public destination domains in real time, supports custom 3–32 character slugs (/r/alias), link titles, categorization tags, and automatic 24h / 7d / 30d expiration.',
  },
  {
    title: 'Passcode Encryption Vault',
    badge: 'Access Control',
    icon: Lock,
    details:
      'Protects sensitive destinations behind /unlock/[code]. Passcodes are salted and hashed with 12 bcrypt rounds server-side so destination URLs remain sealed until verified.',
  },
  {
    title: 'Opt-In High-Accuracy GNSS Gate',
    badge: 'Precision Geo',
    icon: Crosshair,
    details:
      'Routes visitors through /verify-location/[code] requesting explicit browser GPS permission. Supports 1m–15m accuracy targets in Strict Gate or Best-Available Fallback mode.',
  },
  {
    title: 'Interactive Visitor Map & Live Telemetry',
    badge: 'Analytics',
    icon: Globe2,
    details:
      'Interactive Leaflet map displays pin coordinates, city/country resolution, browser/OS/device classification, referral acquisition channels, and on-device GNSS calibration.',
  },
  {
    title: 'Link Management Console & QR Modal',
    badge: 'Operations',
    icon: Layers,
    details:
      'Search across titles, short codes, tags, or destinations; filter All / Active / Paused states; toggle route availability instantaneously; or download scannable QR codes.',
  },
  {
    title: 'Hardened SSRF, Loop & Abuse Defense',
    badge: 'Perimeter',
    icon: ShieldCheck,
    details:
      'Intercepts loopback/RFC 1918/cloud metadata targets, blocks self-redirect loops and unsafe URI schemes (javascript:/data:/file:), masks visitor IPs, and enforces rate limits.',
  },
] as const;

const TERMS_CLAUSES = [
  {
    index: '01',
    title: 'Strictly Safe & Lawful Use',
    text: 'XrGeoLink is engineered exclusively for legitimate link shortening, telemetry diagnostics, and authorized traffic routing. Using this platform for phishing, credential harvesting, harassment, stalking, covert tracking without consent, malware distribution, or any unlawful act is strictly prohibited.',
  },
  {
    index: '02',
    title: 'Zero Developer Liability',
    text: 'The developer and operators of XrGeoLink provide the software on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind. Users assume sole legal, civil, and criminal responsibility for every URL shortened, shared, or accessed through their workspace.',
  },
  {
    index: '03',
    title: 'Visitor Privacy & Explicit Consent',
    text: 'When precision GNSS verification is enabled on a route, visitors are presented with an explicit consent prompt and browser permission dialog. Misrepresenting location checks or circumventing visitor privacy disclosures is a material breach of these terms.',
  },
  {
    index: '04',
    title: 'Security Gate Enforcement & Termination',
    text: 'Access requires valid server-verified consent tokens issued via cryptographic challenge. Any attempt to tamper with session cookies, bypass SSRF blocklists, automate abuse, or flood API endpoints results in immediate revocation and server-side blocking.',
  },
  {
    index: '05',
    title: 'Intellectual Property & Code Ownership',
    text: 'All platform architecture, source code, UI designs, shaders, algorithms, and brand assets remain the exclusive intellectual property of XrGeoLink. Acceptance grants limited runtime usage rights only—never a license to copy, clone, or redistribute source code.',
  },
] as const;

const COPYRIGHT_STATUTES = [
  {
    code: 'Statute 01',
    statute: '17 U.S.C. § 506 & 18 U.S.C. § 2319 (DMCA / U.S. Federal Law)',
    penalty: 'Up to 5–10 Years Jail + $150,000/Work Damages',
    summary:
      'Willful copyright infringement, unauthorized source reproduction, or commercial distribution of proprietary website code and assets is a federal felony carrying prison sentences and severe statutory fines.',
  },
  {
    code: 'Statute 02',
    statute: 'Copyright Act Section 63 / UK CDPA Section 107 / Berne Convention',
    penalty: '6 Months to 3–10 Years Imprisonment (Jail) & Asset Seizure',
    summary:
      'International copyright treaties protect original software and UI design across 180+ jurisdictions. Cloning source code, stripping attribution, or deploying copied modules triggers criminal prosecution.',
  },
  {
    code: 'Statute 03',
    statute: 'Computer Fraud & Cybercrime Laws (18 U.S.C. § 1030 / IT Act § 66)',
    penalty: 'Criminal Prosecution, Heavy Fines & Custodial Jail Sentences',
    summary:
      'Unauthorized source extraction, automated scraping of protected logic, security-gate tampering, or reverse-engineering cryptographic routines constitutes unlawful cyber intrusion.',
  },
] as const;

interface AboutTransitionBridgeProps {
  id: string;
  stageCode: string;
  fromLabel: string;
  toLabel: string;
  nextTarget: string;
  description: string;
  ringAccent: string;
  badgeAccent: string;
  buttonAccent: string;
}

function AboutTransitionBridge({
  id,
  stageCode,
  fromLabel,
  toLabel,
  nextTarget,
  description,
  ringAccent,
  badgeAccent,
  buttonAccent,
}: AboutTransitionBridgeProps) {
  const prefersReducedMotion = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const smoothRotateX = useSpring(rotateX, { stiffness: 180, damping: 20 });
  const smoothRotateY = useSpring(rotateY, { stiffness: 180, damping: 20 });
  const [pulseCount, setPulseCount] = useState(0);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(nx * 22);
    rotateX.set(-ny * 18);
  };

  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      id={id}
      data-about-bridge
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative min-h-[44vh] sm:min-h-[54vh] lg:min-h-[60vh] flex items-center justify-center py-12 sm:py-16 px-3 sm:px-6 select-none"
    >
      {/* Open vertical cosmic conduit */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-4 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-cyan-400/35 to-transparent"
      />

      {/* Interactive 3D Perspective Orbital Portal Assembly */}
      <motion.div
        style={
          prefersReducedMotion
            ? undefined
            : {
                rotateX: smoothRotateX,
                rotateY: smoothRotateY,
                transformStyle: 'preserve-3d',
                perspective: 960,
              }
        }
        className="relative z-10 flex flex-col items-center text-center gap-4 sm:gap-5 max-w-lg w-full"
      >
        {/* 3D Orbital Astrolabe Rings framing the cosmic burst gap */}
        <div
          aria-hidden="true"
          style={{ transform: 'translateZ(-18px)' }}
          className="pointer-events-none absolute -inset-10 sm:-inset-16 flex items-center justify-center"
        >
          <motion.div
            animate={prefersReducedMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
            className={`w-56 h-56 sm:w-72 sm:h-72 rounded-full border border-dashed opacity-45 ${ringAccent}`}
          />
          <motion.div
            animate={prefersReducedMotion ? undefined : { rotate: -360 }}
            transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
            className={`absolute w-40 h-40 sm:w-52 sm:h-52 rounded-full border opacity-35 ${ringAccent}`}
          />
        </div>

        {/* Floating Depth-Layered Route Telemetry Header */}
        <div
          style={{ transform: 'translateZ(26px)' }}
          className={`inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 px-3.5 sm:px-4 py-1.5 rounded-full border stage-panel text-[10px] sm:text-xs font-mono tracking-wide ${badgeAccent}`}
        >
          <span className="font-bold tabular-nums opacity-75">{stageCode}</span>
          <span aria-hidden="true">·</span>
          <span className="opacity-85">{fromLabel}</span>
          <ArrowRight className="w-3 h-3 opacity-80 shrink-0" />
          <span className="font-semibold">{toLabel}</span>
        </div>

        {/* Center 3D Core Orbit Emblem */}
        <motion.button
          type="button"
          style={{ transform: 'translateZ(38px)' }}
          whileHover={prefersReducedMotion ? undefined : { scale: 1.08 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
          onClick={() => {
            setPulseCount((c) => c + 1);
            triggerCosmicBurst(1.55);
          }}
          aria-label={`Ignite 3D cosmic burst transitioning to ${toLabel}`}
          className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border stage-panel flex items-center justify-center transition-colors ${buttonAccent}`}
        >
          <motion.div
            key={pulseCount}
            initial={{ scale: 0.9, opacity: 0.8 }}
            animate={{ scale: 1.65, opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-none absolute inset-0 rounded-2xl border ${ringAccent}`}
          />
          <Orbit className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-cyan-300" />
        </motion.button>

        {/* Description Capsule */}
        <p
          style={{ transform: 'translateZ(20px)' }}
          className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 max-w-sm leading-relaxed stage-panel px-4 sm:px-5 py-2.5 rounded-2xl border border-slate-200/75 dark:border-white/10"
        >
          {description}
        </p>

        {/* Interactive Transition Controls */}
        <div
          style={{ transform: 'translateZ(30px)' }}
          className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 pt-1"
        >
          <button
            type="button"
            onClick={() => {
              setPulseCount((c) => c + 1);
              triggerCosmicBurst(1.45);
            }}
            className={`group inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl border stage-panel text-xs font-medium text-slate-800 dark:text-slate-100 transition-all active:scale-95 hover:scale-[1.03] whitespace-nowrap ${buttonAccent}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-300 transition-transform duration-200 group-hover:rotate-12" />
            <span>Trigger Cosmic Burst</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerCosmicBurst(1.0);
              requestSmoothScrollTo(nextTarget, -104);
            }}
            className="group inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl border border-slate-200/80 dark:border-white/15 stage-panel text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-cyan-300 transition-all active:scale-95 whitespace-nowrap"
          >
            <span>Advance Section</span>
            <ArrowDown className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-y-0.5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function SectionDivider({
  index,
  label,
  tone = 'indigo',
}: {
  index: string;
  label: string;
  tone?: 'indigo' | 'rose';
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-3 sm:gap-4" aria-hidden="true">
      <span
        className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
          tone === 'rose'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-indigo-600 dark:text-cyan-300'
        }`}
      >
        {index}
      </span>
      <span className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
        {label}
      </span>
      <motion.div
        initial={prefersReducedMotion ? false : { scaleX: 0, opacity: 0 }}
        whileInView={{ scaleX: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`origin-left h-px flex-1 ${
          tone === 'rose'
            ? 'bg-gradient-to-r from-rose-500/45 via-rose-400/20 to-transparent'
            : 'bg-gradient-to-r from-indigo-500/45 via-cyan-400/25 to-transparent'
        }`}
      />
    </div>
  );
}

export function AboutSection({ stageStateRef, onNavigateTab }: AboutSectionProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const fallbackStageRef = useRef<ScrollStageState>(createInitialScrollStageState());
  const activeStageRef = stageStateRef ?? fallbackStageRef;

  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [guideTab, setGuideTab] = useState<'howto' | 'functions'>('howto');
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Synchronize Lenis smooth scroll + GSAP ScrollTrigger focal-depth blur & 3D cosmic burst transitions
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const stageState = activeStageRef.current;

    if (prefersReducedMotion) {
      stageState.stageIntensity = 0.45;
      stageState.transitionFocus = 0;
      stageState.morphProgress = 0;
      return;
    }

    stageState.stageIntensity = 0.72;
    stageState.transitionFocus = 0;

    const lenis = new Lenis({
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.35,
    });
    lenisRef.current = lenis;

    const onLenisScroll = () => {
      ScrollTrigger.update();
    };
    lenis.on('scroll', onLenisScroll);

    const tickerFn = (time: number) => {
      lenis.raf(time * 1000);
      const targetVel = Math.max(-4, Math.min(4, lenis.velocity * 0.085));
      stageState.scrollVelocity += (targetVel - stageState.scrollVelocity) * 0.16;
    };
    gsap.ticker.add(tickerFn);
    gsap.ticker.lagSmoothing(0);

    const onScrollToEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ target?: string | number; offset?: number }>).detail;
      if (!detail || detail.target === undefined) return;
      lenis.scrollTo(detail.target, {
        offset: detail.offset ?? -96,
        duration: 1.25,
        easing: (t) => 1 - Math.pow(1 - t, 4),
      });
    };
    window.addEventListener(LP_SCROLL_TO_EVENT, onScrollToEvent);

    const bridgeValues = new Map<Element, number>();

    const recomputeTransitionFocus = () => {
      let peakBridge = 0;
      bridgeValues.forEach((v) => {
        if (v > peakBridge) peakBridge = v;
      });
      const momentumBoost = Math.min(0.28, Math.abs(stageState.scrollVelocity) * 0.11);
      const nextFocus = Math.min(1, peakBridge + momentumBoost * 0.55);
      stageState.transitionFocus = nextFocus;
      stageState.stageIntensity = 0.72 + nextFocus * 0.28;
    };

    const ctx = gsap.context(() => {
      // 1. Scrub global cosmic universe progress (0 -> 3) across About Us chapters
      const morphSpanEl = root.querySelector('[data-about-morph-span]');
      if (morphSpanEl) {
        ScrollTrigger.create({
          trigger: morphSpanEl,
          start: 'top 30%',
          end: 'bottom 65%',
          scrub: true,
          onUpdate: (self) => {
            const p = self.progress * 3.0;
            stageState.morphProgress = p;
            stageState.sectionIndex = Math.round(p);
          },
        });
      }

      // 2. Foreground focal-depth shift: blur & recede between sections, crystal sharp inside focus plateau
      const chapterEls = gsap.utils.toArray<HTMLElement>('[data-about-chapter]', root);
      chapterEls.forEach((el) => {
        const isFirst = el.dataset.chapterFirst === 'true';
        const isLast = el.dataset.chapterLast === 'true';

        ScrollTrigger.create({
          trigger: el,
          start: 'top 96%',
          end: 'bottom 4%',
          scrub: true,
          onUpdate: (self) => {
            const p = self.progress;
            const enterEnd = isFirst ? 0.04 : 0.24;
            const exitStart = isLast ? 0.88 : 0.74;

            let clarity = 1;
            let yOffset = 0;
            if (p < enterEnd && enterEnd > 0) {
              const e = smoothstep(0, enterEnd, p);
              clarity = e;
              yOffset = (1 - e) * 38;
            } else if (p > exitStart) {
              const ex = smoothstep(exitStart, 1, p);
              clarity = 1 - ex;
              yOffset = -ex * 34;
            }

            const blurPx = (1 - clarity) * 14;
            const scaleVal = 0.92 + clarity * 0.08;
            const opacityVal = 0.12 + clarity * 0.88;

            gsap.set(el, {
              opacity: opacityVal,
              scale: scaleVal,
              y: yOffset,
              filter: blurPx > 0.25 ? `blur(${blurPx.toFixed(1)}px)` : 'blur(0px)',
              transformOrigin: 'center center',
            });
          },
        });
      });

      // 3. Inter-section 3D Cosmic Bridge surge + particle focus peak
      const bridgeEls = gsap.utils.toArray<HTMLElement>('[data-about-bridge]', root);
      bridgeEls.forEach((el) => {
        bridgeValues.set(el, 0);
        ScrollTrigger.create({
          trigger: el,
          start: 'top 90%',
          end: 'bottom 10%',
          scrub: true,
          onEnter: () => {
            stageState.burstImpulse = Math.max(stageState.burstImpulse, 0.55);
          },
          onEnterBack: () => {
            stageState.burstImpulse = Math.max(stageState.burstImpulse, 0.55);
          },
          onUpdate: (self) => {
            const bell = Math.pow(Math.sin(self.progress * Math.PI), 1.25);
            bridgeValues.set(el, bell);
            recomputeTransitionFocus();

            gsap.set(el, {
              opacity: 0.22 + bell * 0.78,
              scale: 0.94 + bell * 0.06,
            });
          },
          onLeave: () => {
            bridgeValues.set(el, 0);
            recomputeTransitionFocus();
          },
          onLeaveBack: () => {
            bridgeValues.set(el, 0);
            recomputeTransitionFocus();
          },
        });
      });
    }, root);

    const refreshRaf = window.requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });

    return () => {
      window.cancelAnimationFrame(refreshRaf);
      window.removeEventListener(LP_SCROLL_TO_EVENT, onScrollToEvent);
      gsap.ticker.remove(tickerFn);
      lenis.off('scroll', onLenisScroll);
      lenis.destroy();
      lenisRef.current = null;
      ctx.revert();
    };
  }, [activeStageRef, prefersReducedMotion]);

  // Refresh ScrollTrigger boundaries cleanly whenever guide tab height changes
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [guideTab]);

  // Pause Lenis and lock body scroll while Terms & Conditions modal dialog is open
  useEffect(() => {
    if (!isTermsModalOpen) return;

    lenisRef.current?.stop();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTermsModalOpen(false);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      lenisRef.current?.start();
    };
  }, [isTermsModalOpen]);

  const activeStage = ARCHITECTURE_STAGES[activeStageIdx] || ARCHITECTURE_STAGES[0];
  const ActiveStageIcon = activeStage.icon;
  const stageProgress = (activeStageIdx + 1) / ARCHITECTURE_STAGES.length;

  return (
    <div ref={rootRef} className="relative z-10 w-full max-w-7xl mx-auto py-2 sm:py-4">
      <div data-about-morph-span className="space-y-2 sm:space-y-4">
        {/* ==================== SECTION 01: PLATFORM BRIEFING ==================== */}
        <section
          id="about-briefing"
          data-about-chapter
          data-chapter-first="true"
          aria-label="Platform briefing and pipeline"
          className="scroll-mt-24 space-y-5 sm:space-y-6"
        >
          <SectionDivider index="01." label="Platform Briefing" />

          <SpotlightCard
            showReticles
            hoverLift={false}
            spotlightColor="rgba(56, 189, 248, 0.16)"
            borderGlowColor="rgba(99, 102, 241, 0.55)"
            className="stage-panel border border-slate-200/80 dark:border-white/15 rounded-2xl sm:rounded-3xl p-5 sm:p-8 lg:p-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 sm:gap-9 lg:gap-12 items-center">
              {/* Left: Concise Short-Form Explanation */}
              <div className="lg:col-span-7 space-y-5">
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-flex items-center gap-2 text-indigo-600 dark:text-cyan-300 text-xs font-semibold tracking-wide"
                >
                  <Info className="w-4 h-4 shrink-0" />
                  <span>About XrGeoLink</span>
                </motion.div>

                <MaskedReveal>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance leading-[1.15]">
                    High-Security URL Routing &amp; Real-Time Geographic Telemetry
                  </h1>
                </MaskedReveal>

                <motion.p
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.42, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl"
                >
                  <strong className="text-slate-900 dark:text-white">XrGeoLink</strong> is an
                  enterprise-grade URL shortener and spatial intelligence platform built for instant,
                  zero-signup productivity. Every link operates inside an isolated cryptographic
                  workspace protected by SSRF firewalls, optional 12-round bcrypt passcodes, live
                  visitor maps, and opt-in precision GNSS telemetry.
                </motion.p>

                {/* Clean unboxed typographic metadata strip */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400 pt-1">
                  <span className="text-indigo-600 dark:text-cyan-300 font-semibold">
                    Zero Sign-Up Isolation
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>12-Round Bcrypt Vault</span>
                  <span aria-hidden="true">·</span>
                  <span>1m GNSS Consent Gate</span>
                  <span aria-hidden="true">·</span>
                  <span>HMAC Safe-Use Enforcement</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {onNavigateTab && (
                    <MagneticShell strength={4}>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('shorten')}
                        className="group inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] whitespace-nowrap"
                      >
                        <Link2 className="w-4 h-4 shrink-0" />
                        <span>Start Shortening</span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </button>
                    </MagneticShell>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                    className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300/80 dark:border-white/15 bg-white/80 dark:bg-white/[0.04] hover:border-indigo-500/50 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-medium transition-all active:scale-[0.98] whitespace-nowrap"
                  >
                    <FileText className="w-4 h-4 text-indigo-500 dark:text-cyan-300 shrink-0" />
                    <span>View Terms &amp; Conditions</span>
                  </button>
                </div>
              </div>

              {/* Right: Interactive Hi-Tech Telemetry Pipeline Instrument */}
              <div className="lg:col-span-5">
                <div className="relative rounded-2xl border border-slate-200/85 dark:border-cyan-400/20 bg-slate-950/[0.03] dark:bg-[#040918]/95 p-5 sm:p-6 space-y-5 overflow-hidden">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-35 dark:opacity-50 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.14),transparent_55%)]"
                  />

                  <div className="relative z-10 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-500 dark:text-cyan-300 shrink-0" />
                      <span>Execution Pipeline</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] tabular-nums text-indigo-600 dark:text-cyan-300">
                        Stage {activeStage.step} / 04
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Previous pipeline stage"
                          onClick={() =>
                            setActiveStageIdx(
                              (prev) =>
                                (prev - 1 + ARCHITECTURE_STAGES.length) %
                                ARCHITECTURE_STAGES.length
                            )
                          }
                          className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:border-indigo-400/60 text-slate-600 dark:text-slate-300 transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Next pipeline stage"
                          onClick={() =>
                            setActiveStageIdx((prev) => (prev + 1) % ARCHITECTURE_STAGES.length)
                          }
                          className="p-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:border-indigo-400/60 text-slate-600 dark:text-slate-300 transition-colors"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Spring-Animated Stage Selector Rail */}
                  <div className="relative z-10 space-y-2.5">
                    <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-200/60 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10">
                      {ARCHITECTURE_STAGES.map((stage, idx) => {
                        const selected = activeStageIdx === idx;
                        return (
                          <button
                            key={stage.step}
                            type="button"
                            onClick={() => setActiveStageIdx(idx)}
                            className={`relative py-2 px-1.5 rounded-lg text-center font-mono text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                              selected
                                ? 'text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {selected && (
                              <motion.span
                                layoutId="about-pipeline-pill"
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                className="absolute inset-0 rounded-lg bg-indigo-600 shadow-sm shadow-indigo-500/35"
                              />
                            )}
                            <span className="relative z-10 tabular-nums">{stage.step}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Compositor-Only Laser Progress Track */}
                    <div className="h-[2px] w-full rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                      <motion.div
                        animate={{ scaleX: stageProgress }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full w-full origin-left bg-gradient-to-r from-indigo-500 via-cyan-400 to-sky-400"
                      />
                    </div>
                  </div>

                  <div className="relative z-10 pt-2 border-t border-slate-200/75 dark:border-white/10">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeStage.step}
                        initial={
                          prefersReducedMotion ? false : { opacity: 0, y: 8, filter: 'blur(4px)' }
                        }
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={
                          prefersReducedMotion
                            ? undefined
                            : { opacity: 0, y: -6, filter: 'blur(3px)' }
                        }
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${activeStage.accent}`}
                          >
                            <ActiveStageIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                              {activeStage.title}
                            </h2>
                            <div className="text-[11px] font-mono text-indigo-600 dark:text-cyan-300">
                              {activeStage.metric}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
                          {activeStage.summary}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </section>

        {/* ==================== 3D INTERACTIVE BRIDGE 01 -> 02 ==================== */}
        <AboutTransitionBridge
          id="about-bridge-01-02"
          stageCode="01 -> 02"
          fromLabel="Platform Briefing"
          toLabel="Operational Manual & Feature Reference"
          nextTarget="#about-manual"
          description="Deep-space starlight sharpens across the cosmic horizon as workflow telemetry comes into focus."
          ringAccent="border-indigo-400/50 dark:border-cyan-400/45"
          badgeAccent="border-cyan-500/30 text-indigo-700 dark:text-cyan-300"
          buttonAccent="border-cyan-500/35 hover:border-cyan-400"
        />

        {/* ==================== SECTION 02: OPERATIONAL MANUAL & FEATURE REFERENCE ==================== */}
        <section
          id="about-manual"
          data-about-chapter
          aria-label="Operational manual and feature reference"
          className="scroll-mt-24 space-y-6 sm:space-y-7 py-2 sm:py-4"
        >
          <SectionDivider index="02." label="Operational Manual & Feature Reference" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 stage-panel border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 sm:p-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-cyan-300">
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>Interactive Documentation</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                How to Use XrGeoLink &amp; Full Function Guide
              </h2>
            </div>

            {/* Spring-Animated Segmented Mode Toggle */}
            <div
              role="tablist"
              aria-label="Guide view mode"
              className="grid grid-cols-2 sm:flex items-center gap-1 p-1 rounded-xl bg-slate-200/75 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/10 self-stretch sm:self-auto"
            >
              {(
                [
                  { id: 'howto', label: 'How to Use (4 Steps)' },
                  { id: 'functions', label: 'All 6 Core Functions' },
                ] as const
              ).map((tab) => {
                const selected = guideTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      setGuideTab(tab.id);
                      triggerCosmicBurst(0.65);
                    }}
                    className={`relative min-h-[40px] px-3.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      selected
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="about-guide-tab"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {guideTab === 'howto' ? (
              <motion.div
                key="guide-howto"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
              >
                {HOW_TO_STEPS.map((item, idx) => {
                  const StepIcon = item.icon;
                  return (
                    <SpotlightCard
                      key={item.step}
                      delay={idx * 0.05}
                      showReticles
                      spotlightColor="rgba(99, 102, 241, 0.14)"
                      borderGlowColor="rgba(56, 189, 248, 0.5)"
                      className="stage-panel border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 sm:p-7 space-y-3.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/12 border border-indigo-500/25 text-indigo-600 dark:text-cyan-300 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3">
                            <StepIcon className="w-4 h-4" />
                          </div>
                          <span className="font-mono text-xs font-bold tabular-nums text-indigo-600 dark:text-cyan-300">
                            Step {item.step}
                          </span>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500/80 shrink-0" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {item.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {item.description}
                      </p>
                    </SpotlightCard>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="guide-functions"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
              >
                {PLATFORM_FUNCTIONS.map((fn, idx) => {
                  const FnIcon = fn.icon;
                  return (
                    <SpotlightCard
                      key={fn.title}
                      delay={idx * 0.04}
                      showReticles
                      spotlightColor="rgba(56, 189, 248, 0.14)"
                      borderGlowColor="rgba(99, 102, 241, 0.5)"
                      className="stage-panel border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 sm:p-6 space-y-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/12 border border-sky-500/25 text-sky-600 dark:text-cyan-300 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover:rotate-3">
                          <FnIcon className="w-4 h-4" />
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {fn.badge}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        {fn.title}
                      </h3>
                      <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {fn.details}
                      </p>
                    </SpotlightCard>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ==================== 3D INTERACTIVE BRIDGE 02 -> 03 ==================== */}
        <AboutTransitionBridge
          id="about-bridge-02-03"
          stageCode="02 -> 03"
          fromLabel="Operational Manual & Feature Reference"
          toLabel="Governance & Safe-Use Policy"
          nextTarget="#about-governance"
          description="Spiral nebula filaments drift forward while safe-use compliance covenants align."
          ringAccent="border-emerald-400/50 dark:border-emerald-400/45"
          badgeAccent="border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
          buttonAccent="border-emerald-500/35 hover:border-emerald-400"
        />

        {/* ==================== SECTION 03: GOVERNANCE & SAFE-USE POLICY ==================== */}
        <section
          id="about-governance"
          data-about-chapter
          aria-label="Governance and safe-use policy"
          className="scroll-mt-24 space-y-5 sm:space-y-6 py-2 sm:py-4"
        >
          <SectionDivider index="03." label="Governance & Safe-Use Policy" />

          <SpotlightCard
            showReticles
            hoverLift={false}
            spotlightColor="rgba(99, 102, 241, 0.14)"
            borderGlowColor="rgba(99, 102, 241, 0.5)"
            className="stage-panel border border-slate-200/80 dark:border-white/15 rounded-2xl sm:rounded-3xl p-5 sm:p-8 lg:p-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/12 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                      Policy Overview
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                      Terms &amp; Conditions
                    </h2>
                  </div>
                </div>

                <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  XrGeoLink is built strictly for safe, lawful routing and analytics and must never
                  be used to harm anyone, phish credentials, or track visitors covertly. Every user
                  bears full legal responsibility for links created in their workspace, while the
                  website developer holds zero liability for misuse.
                </p>
              </div>

              <div className="lg:col-span-5 pt-4 lg:pt-0 lg:pl-8 border-t lg:border-t-0 lg:border-l border-slate-200/75 dark:border-white/10 space-y-4">
                <div className="space-y-2.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Mandatory server-signed safe-use acceptance before workspace entry</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Explicit browser consent disclosure for optional GNSS checks</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Zero tolerance for malicious redirects, scraping, or gate tampering</span>
                  </div>
                </div>

                <MagneticShell strength={4} className="w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                    className="group w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold transition-all shadow-md shadow-indigo-500/25 whitespace-nowrap"
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>View Terms &amp; Conditions</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </button>
                </MagneticShell>
              </div>
            </div>
          </SpotlightCard>
        </section>

        {/* ==================== 3D INTERACTIVE BRIDGE 03 -> 04 ==================== */}
        <AboutTransitionBridge
          id="about-bridge-03-04"
          stageCode="03 -> 04"
          fromLabel="Governance & Safe-Use Policy"
          toLabel="Intellectual Property & Criminal Liability"
          nextTarget="#about-copyright"
          description="Supernova shockwaves and meteor trails converge on statutory copyright protection."
          ringAccent="border-rose-400/50 dark:border-rose-400/45"
          badgeAccent="border-rose-500/30 text-rose-700 dark:text-rose-300"
          buttonAccent="border-rose-500/35 hover:border-rose-400"
        />

        {/* ==================== SECTION 04: INTELLECTUAL PROPERTY & CRIMINAL LIABILITY ==================== */}
        <section
          id="about-copyright"
          data-about-chapter
          data-chapter-last="true"
          aria-label="Copyright infringement and criminal liability"
          className="scroll-mt-24 space-y-5 sm:space-y-6 pt-2 pb-10 sm:pb-14"
        >
          <SectionDivider index="04." label="Intellectual Property & Criminal Liability" tone="rose" />

          <SpotlightCard
            showReticles
            hoverLift={false}
            spotlightColor="rgba(244, 63, 94, 0.14)"
            borderGlowColor="rgba(244, 63, 94, 0.5)"
            className="stage-panel border border-rose-500/25 dark:border-rose-400/25 rounded-2xl sm:rounded-3xl p-5 sm:p-8 lg:p-10 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/12 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Gavel className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-mono text-rose-600 dark:text-rose-400">
                    Zero-Tolerance Anti-Copying Enforcement
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    Strict Copyright Protection Notice
                  </h2>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                Serious Criminal Offense · Imprisonment Applicable
              </span>
            </div>

            <div className="rounded-2xl border border-rose-500/25 bg-rose-50/85 dark:bg-rose-950/40 p-4 sm:p-5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-slate-800 dark:text-rose-100 leading-relaxed font-medium">
                All source code, UI architecture, 3D WebGL shaders, cryptographic gates, and design
                systems powering <strong className="font-bold">XrGeoLink</strong> are protected by
                copyright. Copying, cloning, redistributing, or reusing any code from this website
                without explicit written authorization is a{' '}
                <strong className="font-bold">serious criminal offense</strong> punishable by arrest,
                heavy statutory damages, and imprisonment (jail).
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 pt-2">
              {COPYRIGHT_STATUTES.map((law, idx) => (
                <motion.div
                  key={law.statute}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] p-4 sm:p-5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="text-slate-500 dark:text-slate-400">{law.code}</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold text-right">
                        Criminal Liability
                      </span>
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                      {law.statute}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {law.summary}
                    </p>
                  </div>
                  <div className="pt-2.5 border-t border-slate-200/70 dark:border-white/10 text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400">
                    {law.penalty}
                  </div>
                </motion.div>
              ))}
            </div>
          </SpotlightCard>
        </section>
      </div>

      {/* ==================== POP-UP TERMS & CONDITIONS DIALOG ==================== */}
      <AnimatePresence>
        {isTermsModalOpen && (
          <motion.div
            key="terms-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setIsTermsModalOpen(false)}
            className="fixed inset-0 z-[110] bg-slate-950/80 flex items-center justify-center p-3 sm:p-6"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="about-terms-modal-title"
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl max-h-[88dvh] flex flex-col stage-panel border border-slate-200/85 dark:border-white/15 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200/75 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-indigo-600 dark:text-cyan-300">
                      Legal &amp; Safe-Use Agreement
                    </div>
                    <h2
                      id="about-terms-modal-title"
                      className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
                    >
                      XrGeoLink Terms &amp; Conditions
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTermsModalOpen(false)}
                  aria-label="Close Terms & Conditions dialog"
                  className="p-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/75 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Modal Body */}
              <div
                data-lenis-prevent
                className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4"
              >
                <div className="rounded-xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-300/75 dark:border-amber-500/30 p-4 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-amber-100 leading-relaxed">
                    Mandatory Safe-Use Notice: XrGeoLink is strictly for safe use and must not be
                    used to harm anyone. The website developer is not responsible for any misuse.
                  </p>
                </div>

                <div className="divide-y divide-slate-200/75 dark:divide-white/10 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.03]">
                  {TERMS_CLAUSES.map((clause) => (
                    <div key={clause.index} className="p-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold tabular-nums text-indigo-600 dark:text-cyan-300">
                          {clause.index}.
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {clause.title}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {clause.text}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-rose-500/25 bg-rose-50/85 dark:bg-rose-950/35 p-4 text-xs text-slate-700 dark:text-rose-100 leading-relaxed">
                  <strong className="text-rose-700 dark:text-rose-300">
                    Copyright &amp; Anti-Copying Warning:
                  </strong>{' '}
                  Unauthorized reproduction, scraping, or commercial reuse of any XrGeoLink source
                  code violates federal and international copyright statutes (including 17 U.S.C. §
                  506, DMCA, and Copyright Act § 63) and carries criminal liability including jail
                  sentences and statutory damages.
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200/75 dark:border-white/10 flex items-center justify-between gap-3 shrink-0 bg-white/60 dark:bg-slate-950/60">
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  © {new Date().getFullYear()} XrGeoLink · All Rights Reserved
                </span>
                <button
                  type="button"
                  onClick={() => setIsTermsModalOpen(false)}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
