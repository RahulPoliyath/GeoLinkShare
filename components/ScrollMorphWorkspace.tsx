'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Compass,
  Cpu,
  Globe2,
  KeyRound,
  Layers,
  Link2,
  Lock,
  MapPin,
  MousePointerClick,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { LinkCreator, GeneratedLink } from '@/components/LinkCreator';
import { LinksTable } from '@/components/LinksTable';
import {
  AnimatedNumber,
  MagneticShell,
  SpotlightCard,
} from '@/components/MotionPrimitives';
import {
  LP_SCROLL_TO_EVENT,
  ScrollStageState,
  requestSmoothScrollTo,
  triggerCosmicBurst,
} from '@/lib/scroll-stage';

gsap.registerPlugin(ScrollTrigger);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface TransitionBridgeProps {
  id: string;
  fromLabel: string;
  toLabel: string;
  nextTarget: string;
  accentClass: string;
  glowRingClass: string;
  description: string;
}

function TransitionBridge({
  id,
  fromLabel,
  toLabel,
  nextTarget,
  accentClass,
  glowRingClass,
  description,
}: TransitionBridgeProps) {
  return (
    <div
      id={id}
      data-transition-bridge
      className="relative min-h-[34vh] sm:min-h-[44vh] lg:min-h-[50vh] flex items-center justify-center py-8 sm:py-10 px-3 sm:px-4 select-none"
    >
      {/* Subtle vertical guide axis leaving center viewport wide open for the cosmic starlight & supernova burst */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-4 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-slate-400/30 dark:via-cyan-400/25 to-transparent"
      />

      <div className="relative z-10 flex flex-col items-center text-center gap-3 sm:gap-3.5 max-w-md w-full">
        <div
          className={`inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 px-3 sm:px-3.5 py-1.5 rounded-full border stage-panel text-[10px] sm:text-[11px] font-mono tracking-wide ${accentClass}`}
        >
          <span className="opacity-70">{fromLabel}</span>
          <ArrowRight className="w-3 h-3 opacity-80 shrink-0" />
          <span className="font-semibold">{toLabel}</span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300/90 max-w-xs leading-relaxed stage-panel px-4 py-2 rounded-2xl border border-slate-200/70 dark:border-white/10">
          {description}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => triggerCosmicBurst(1.25)}
            className={`group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border stage-panel text-xs font-medium text-slate-800 dark:text-slate-100 transition-all active:scale-95 hover:scale-[1.03] whitespace-nowrap ${glowRingClass}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-300 transition-transform duration-200 group-hover:rotate-12" />
            <span>Trigger Cosmic Burst</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerCosmicBurst(0.95);
              requestSmoothScrollTo(nextTarget, -104);
            }}
            className="group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-white/15 stage-panel text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-cyan-300 transition-all active:scale-95 whitespace-nowrap"
          >
            <span>Advance</span>
            <ArrowDown className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-y-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ScrollMorphWorkspaceProps {
  stageStateRef: React.MutableRefObject<ScrollStageState>;
  anonymousUserId: string | null;
  links: GeneratedLink[];
  onLinkCreated: (newLink: GeneratedLink) => void;
  onLinkDeleted: (id: string) => void;
  onLinkUpdated: (updatedLink: GeneratedLink) => void;
  onOpenQr: (url: string, title: string) => void;
  onSelectLinkForAnalytics: (linkId: string) => void;
  onNavigateTab: (tab: 'shorten' | 'dashboard' | 'analytics' | 'security') => void;
}

export function ScrollMorphWorkspace({
  stageStateRef,
  anonymousUserId,
  links,
  onLinkCreated,
  onLinkDeleted,
  onLinkUpdated,
  onOpenQr,
  onSelectLinkForAnalytics,
  onNavigateTab,
}: ScrollMorphWorkspaceProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Real metrics derived strictly from persisted workspace links (zero fabricated telemetry)
  const workspaceStats = useMemo(() => {
    const totalLinks = links.length;
    const totalClicks = links.reduce((sum, l) => sum + (Number(l.clicksCount) || 0), 0);
    const activeLinks = links.filter((l) => l.isActive !== false).length;
    const protectedLinks = links.filter((l) => Boolean(l.hasPassword)).length;
    return { totalLinks, totalClicks, activeLinks, protectedLinks };
  }, [links]);

  // Normalized bar heights built from user's top links (falls back gracefully to proportional architectural steps when workspace has <6 links)
  const spectrumBars = useMemo(() => {
    const recent = links.slice(0, 7);
    if (recent.length === 0) {
      return [
        { label: 'Mon', pct: 34, clicks: 0 },
        { label: 'Tue', pct: 52, clicks: 0 },
        { label: 'Wed', pct: 46, clicks: 0 },
        { label: 'Thu', pct: 74, clicks: 0 },
        { label: 'Fri', pct: 64, clicks: 0 },
        { label: 'Sat', pct: 88, clicks: 0 },
        { label: 'Sun', pct: 69, clicks: 0 },
      ];
    }
    const maxClicks = Math.max(1, ...recent.map((l) => Number(l.clicksCount) || 0));
    return recent.map((l) => {
      const clicks = Number(l.clicksCount) || 0;
      const pct = Math.max(18, Math.round((clicks / maxClicks) * 100));
      return {
        label: `/${l.shortCode}`,
        pct,
        clicks,
      };
    });
  }, [links]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      stageStateRef.current.stageIntensity = 0.25;
      stageStateRef.current.transitionFocus = 0;
      stageStateRef.current.morphProgress = 0;
      return;
    }

    const lenis = new Lenis({
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.35,
    });
    lenisRef.current = lenis;

    const stageState = stageStateRef.current;

    const onLenisScroll = () => {
      ScrollTrigger.update();
    };
    lenis.on('scroll', onLenisScroll);

    const tickerFn = (time: number) => {
      lenis.raf(time * 1000);
      // Smoothly damp scroll velocity into WebGL stage state
      const targetVel = Math.max(-4, Math.min(4, lenis.velocity * 0.085));
      stageState.scrollVelocity += (targetVel - stageState.scrollVelocity) * 0.16;
    };
    gsap.ticker.add(tickerFn);
    gsap.ticker.lagSmoothing(0);

    // Handle external smooth-scroll requests (e.g. Hero CTA, Bridge Advance buttons)
    const onScrollToEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ target?: string | number; offset?: number }>).detail;
      if (!detail || detail.target === undefined) return;
      lenis.scrollTo(detail.target, {
        offset: detail.offset ?? -92,
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
      stageState.transitionFocus = Math.min(1, peakBridge + momentumBoost * 0.55);
    };

    const ctx = gsap.context(() => {
      // 1. Fade 3D stage intensity up smoothly once user scrolls into workspace below Hero
      ScrollTrigger.create({
        trigger: root,
        start: 'top 95%',
        end: 'top 35%',
        scrub: true,
        onUpdate: (self) => {
          stageState.stageIntensity = smoothstep(0, 1, self.progress);
        },
        onLeave: () => {
          stageState.stageIntensity = 1;
        },
        onLeaveBack: () => {
          stageState.stageIntensity = 0;
        },
      });

      // 2. Scrub global morphProgress (0 -> 3) across the separated core sections
      const morphRangeEl = root.querySelector('[data-morph-span]');
      if (morphRangeEl) {
        ScrollTrigger.create({
          trigger: morphRangeEl,
          start: 'top 55%',
          end: 'bottom 45%',
          scrub: true,
          onUpdate: (self) => {
            const p = self.progress * 3.0;
            stageState.morphProgress = p;
            stageState.sectionIndex = Math.round(p);
          },
        });
      }

      // 3. Foreground focal-depth shift: blur & recede during transition gaps, crisp 0px plateau in focus zone
      const chapterEls = gsap.utils.toArray<HTMLElement>('[data-focus-chapter]', root);
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
            const enterEnd = isFirst ? 0.08 : 0.25;
            const exitStart = isLast ? 0.88 : 0.74;

            let clarity = 1;
            let yOffset = 0;
            if (p < enterEnd) {
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

      // 4. Transition Bridge gap focal-depth surge + momentum geometric burst
      const bridgeEls = gsap.utils.toArray<HTMLElement>('[data-transition-bridge]', root);
      bridgeEls.forEach((el) => {
        bridgeValues.set(el, 0);
        ScrollTrigger.create({
          trigger: el,
          start: 'top 88%',
          end: 'bottom 12%',
          scrub: true,
          onEnter: () => {
            stageState.burstImpulse = Math.max(stageState.burstImpulse, 0.45);
          },
          onEnterBack: () => {
            stageState.burstImpulse = Math.max(stageState.burstImpulse, 0.45);
          },
          onUpdate: (self) => {
            // Smooth sinusoidal focus peak in middle of transition gap
            const bell = Math.pow(Math.sin(self.progress * Math.PI), 1.35);
            bridgeValues.set(el, bell);
            recomputeTransitionFocus();

            // Subtle parallax + reveal on the compact bridge caption itself
            gsap.set(el, {
              opacity: 0.25 + bell * 0.75,
              scale: 0.95 + bell * 0.05,
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
  }, [stageStateRef, links.length]);

  return (
    <div ref={rootRef} className="relative z-10">
      <div data-morph-span className="space-y-4">
        {/* ==================== CHAPTER 00: CORE URL SHORTENER ==================== */}
        <section
          id="link-creator-section"
          data-focus-chapter
          data-chapter-first="true"
          className="scroll-mt-24 pt-2"
        >
          <LinkCreator
            userId={anonymousUserId}
            onLinkCreated={onLinkCreated}
            onOpenQr={onOpenQr}
          />
        </section>

        {/* ==================== TRANSITION BRIDGE 00 -> 01 ==================== */}
        <TransitionBridge
          id="bridge-00-01"
          fromLabel="00 · Link Forge"
          toLabel="01 · Analytics Engine"
          nextTarget="#chapter-analytics"
          accentClass="border-cyan-500/30 text-cyan-700 dark:text-cyan-300"
          glowRingClass="border-cyan-500/35 hover:border-cyan-400"
          description="Scroll momentum drifts through deep starlight toward live telemetry."
        />

        {/* ==================== CHAPTER 01: REAL-TIME ANALYTICS ENGINE ==================== */}
        <section
          id="chapter-analytics"
          data-focus-chapter
          className="scroll-mt-28 py-4 sm:py-8"
        >
          <SpotlightCard
            showReticles
            hoverLift={false}
            spotlightColor="rgba(99, 102, 241, 0.16)"
            borderGlowColor="rgba(99, 102, 241, 0.65)"
            className="stage-panel border border-indigo-500/20 dark:border-indigo-400/20 rounded-2xl sm:rounded-3xl p-4 sm:p-7 lg:p-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
              <div className="lg:col-span-7 space-y-4 sm:space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-indigo-500/12 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block">
                      Chapter 01 · Telemetry Core
                    </span>
                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      Real-Time Analytics Engine
                    </h2>
                  </div>
                </div>

                <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  Monitor link performance with live-polling telemetry. Track verified redirect
                  volume, unique visitor browsers, referring networks, and instant click streams in
                  real time without waiting for batch reports.
                </p>

                <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2.5 sm:gap-3 pt-1">
                  <div className="rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] p-3 sm:p-3.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Saved Links</div>
                    <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      <AnimatedNumber value={workspaceStats.totalLinks} />
                    </div>
                  </div>
                  <div className="rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] p-3 sm:p-3.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Verified Clicks</div>
                    <div className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      <AnimatedNumber value={workspaceStats.totalClicks} />
                    </div>
                  </div>
                  <div className="rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] p-3 sm:p-3.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Active Routes</div>
                    <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      <AnimatedNumber value={workspaceStats.activeLinks} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1 sm:pt-2">
                  <MagneticShell strength={5}>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('analytics')}
                      className="group inline-flex items-center gap-2 min-h-[42px] sm:min-h-[44px] px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] whitespace-nowrap"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Open Live Analytics</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </button>
                  </MagneticShell>

                  <button
                    type="button"
                    onClick={() => requestSmoothScrollTo('#link-creator-section', -92)}
                    className="inline-flex items-center gap-2 min-h-[42px] sm:min-h-[44px] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-200/90 dark:border-white/15 bg-white/80 dark:bg-white/[0.04] hover:border-indigo-500/45 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
                  >
                    <Link2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <span>Create Tracked Link</span>
                  </button>
                </div>
              </div>

              {/* Interactive Telemetry Spectrum Preview */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-indigo-500/20 dark:border-indigo-400/20 bg-slate-950/[0.03] dark:bg-[#040918] p-4 sm:p-5 space-y-3 sm:space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      <span>Route Throughput Matrix</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-indigo-600 dark:text-indigo-300">
                      {hoveredBar !== null && spectrumBars[hoveredBar]
                        ? `${spectrumBars[hoveredBar].label} · ${spectrumBars[hoveredBar].clicks} clicks`
                        : 'Hover bars to inspect'}
                    </span>
                  </div>

                  <div className="h-32 sm:h-44 flex items-end justify-between gap-1.5 sm:gap-2.5 pt-3 sm:pt-4 px-0.5 sm:px-1">
                    {spectrumBars.map((bar, idx) => {
                      const active = hoveredBar === idx;
                      return (
                        <button
                          key={`${bar.label}-${idx}`}
                          type="button"
                          onMouseEnter={() => setHoveredBar(idx)}
                          onMouseLeave={() => setHoveredBar(null)}
                          onFocus={() => setHoveredBar(idx)}
                          onBlur={() => setHoveredBar(null)}
                          onClick={() => triggerCosmicBurst(0.85)}
                          className="group flex-1 h-full flex flex-col items-center justify-end gap-2 focus:outline-none"
                          aria-label={`Inspect ${bar.label}`}
                        >
                          <div className="w-full flex-1 flex items-end">
                            <div
                              style={{ height: `${bar.pct}%` }}
                              className={`w-full rounded-t-lg transition-all duration-300 ${
                                active
                                  ? 'bg-gradient-to-t from-indigo-600 via-cyan-400 to-sky-300 shadow-[0_0_20px_rgba(99,102,241,0.5)] scale-x-105'
                                  : 'bg-gradient-to-t from-indigo-600/75 to-sky-400/75 dark:from-indigo-500/80 dark:to-cyan-400/70'
                              }`}
                            />
                          </div>
                          <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400 truncate max-w-full">
                            {bar.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-white/10 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Click any column to ignite a starlight burst</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-300">01</span>
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </section>

        {/* ==================== TRANSITION BRIDGE 01 -> 02 ==================== */}
        <TransitionBridge
          id="bridge-01-02"
          fromLabel="01 · Analytics Engine"
          toLabel="02 · Geographic & Device Intelligence"
          nextTarget="#chapter-geo"
          accentClass="border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
          glowRingClass="border-emerald-500/35 hover:border-emerald-400"
          description="Supernova starlight illuminates the spiral nebula horizon."
        />

        {/* ==================== CHAPTER 02: GEOGRAPHIC & DEVICE INTELLIGENCE ==================== */}
        <section
          id="chapter-geo"
          data-focus-chapter
          className="scroll-mt-28 py-4 sm:py-8"
        >
          <SpotlightCard
            showReticles
            hoverLift={false}
            spotlightColor="rgba(16, 185, 129, 0.16)"
            borderGlowColor="rgba(16, 185, 129, 0.65)"
            className="stage-panel border border-emerald-500/20 dark:border-emerald-400/20 rounded-2xl sm:rounded-3xl p-4 sm:p-7 lg:p-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
              {/* Interactive Spatial Capability Visual */}
              <div className="lg:col-span-5 order-2 lg:order-1">
                <div className="rounded-2xl border border-emerald-500/20 dark:border-emerald-400/20 bg-slate-950/[0.03] dark:bg-[#031312]/80 p-4 sm:p-5 space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Radar className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      <span>Multi-Layer Resolution Stack</span>
                    </span>
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-300">
                      02
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      {
                        icon: Globe2,
                        title: 'IP City & Region Mapping',
                        detail: 'Interactive Leaflet clusters pinpoint visitor hubs globally.',
                      },
                      {
                        icon: MapPin,
                        title: 'Optional 1m GNSS Precision',
                        detail: 'Browser consent gate requests high-accuracy GPS only when allowed.',
                      },
                      {
                        icon: MousePointerClick,
                        title: 'Device, OS & Browser Telemetry',
                        detail: 'Desktop vs mobile breakdown paired with user-agent parsing.',
                      },
                    ].map((row) => {
                      const RowIcon = row.icon;
                      return (
                        <div
                          key={row.title}
                          onMouseEnter={() => triggerCosmicBurst(0.55)}
                          className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] hover:border-emerald-500/40 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <RowIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-900 dark:text-white">
                              {row.title}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
                              {row.detail}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 order-1 lg:order-2 space-y-4 sm:space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 block">
                      Chapter 02 · Spatial Intelligence
                    </span>
                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      Geographic &amp; Device Intelligence
                    </h2>
                  </div>
                </div>

                <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  Discover where your audience resides with interactive map visualization, city and
                  country resolution, and optional high-precision geolocation permission flows—paired
                  with operating system and hardware telemetry.
                </p>

                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1 sm:pt-2">
                  <MagneticShell strength={5}>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('analytics')}
                      className="group inline-flex items-center gap-2 min-h-[42px] sm:min-h-[44px] px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] whitespace-nowrap"
                    >
                      <Globe2 className="w-4 h-4" />
                      <span>Explore Visitor Map</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </button>
                  </MagneticShell>

                  <button
                    type="button"
                    onClick={() => triggerCosmicBurst(1.4)}
                    className="inline-flex items-center gap-2 min-h-[42px] sm:min-h-[44px] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-200/90 dark:border-white/15 bg-white/80 dark:bg-white/[0.04] hover:border-emerald-500/45 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
                  >
                    <Layers className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                    <span>Pulse Starfield</span>
                  </button>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </section>

        {/* ==================== TRANSITION BRIDGE 02 -> 03 ==================== */}
        <TransitionBridge
          id="bridge-02-03"
          fromLabel="02 · Geographic & Device Intelligence"
          toLabel="03 · Hardened Safety & Passcodes"
          nextTarget="#chapter-security"
          accentClass="border-sky-500/30 text-sky-700 dark:text-sky-300"
          glowRingClass="border-sky-500/35 hover:border-sky-400"
          description="Cosmic nebula filaments and meteor trails converge on the security vault."
        />

        {/* ==================== CHAPTER 03: HARDENED SAFETY & PASSCODES ==================== */}
        <section
          id="chapter-security"
          data-focus-chapter
          data-chapter-last={links.length === 0 ? 'true' : 'false'}
          className="scroll-mt-28 py-4 sm:py-8"
        >
          <SpotlightCard
            showReticles
            hoverLift={false}
            spotlightColor="rgba(14, 165, 233, 0.17)"
            borderGlowColor="rgba(56, 189, 248, 0.65)"
            className="stage-panel border border-sky-500/20 dark:border-sky-400/20 rounded-2xl sm:rounded-3xl p-4 sm:p-7 lg:p-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
              <div className="lg:col-span-7 space-y-4 sm:space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-sky-500/12 border border-sky-500/25 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-widest text-sky-600 dark:text-sky-400 block">
                      Chapter 03 · Zero-Trust Perimeter
                    </span>
                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      Hardened Safety &amp; Passcodes
                    </h2>
                  </div>
                </div>

                <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  Protect confidential destinations with salted 12-round bcrypt passcodes. Built-in
                  SSRF blocklists intercept loopback and internal subnet targets before redirection
                  ever occurs, backed by HMAC-signed safe-use enforcement.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] p-3.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Passcode Locked
                    </div>
                    <div className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                      <AnimatedNumber value={workspaceStats.protectedLinks} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] p-3.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Hash Work Factor
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                      12 Rounds
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] p-3.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">SSRF Defense</div>
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Active</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <MagneticShell strength={5}>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('security')}
                      className="group inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-sky-500/25 active:scale-[0.98] whitespace-nowrap"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Inspect Security Architecture</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </button>
                  </MagneticShell>

                  <button
                    type="button"
                    onClick={() => {
                      triggerCosmicBurst(1.1);
                      requestSmoothScrollTo('#link-creator-section', -92);
                    }}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200/90 dark:border-white/15 bg-white/80 dark:bg-white/[0.04] hover:border-sky-500/45 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
                  >
                    <KeyRound className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                    <span>Create Protected Link</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-sky-500/20 dark:border-sky-400/20 bg-slate-950/[0.03] dark:bg-[#041022]/85 p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs pb-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                      <span>Perimeter Protections</span>
                    </span>
                    <span className="font-mono text-[11px] text-sky-600 dark:text-sky-300">03</span>
                  </div>

                  {[
                    {
                      title: 'Private IPv4 & Loopback Blocking',
                      desc: '127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 & cloud metadata rejected.',
                    },
                    {
                      title: 'Cryptographic Bcrypt Gate',
                      desc: 'Destination URL stays sealed server-side until passcode verification succeeds.',
                    },
                    {
                      title: 'HMAC-Signed Access Cookie',
                      desc: 'HttpOnly signed session token prevents client-side gate tampering.',
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      onMouseEnter={() => triggerCosmicBurst(0.65)}
                      className="p-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] hover:border-sky-500/40 transition-colors"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
                        {item.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SpotlightCard>
        </section>
      </div>

      {/* ==================== CHAPTER 04: RECENT SHORTENED LINKS ==================== */}
      {links.length > 0 && (
        <section
          data-focus-chapter
          data-chapter-last="true"
          className="space-y-4 pt-10 sm:pt-20 pb-6 sm:pb-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 stage-panel border border-slate-200/80 dark:border-white/15 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Your Recent Shortened Links
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage active shortcuts and view quick click counts
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('dashboard')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 whitespace-nowrap"
            >
              <span>View All ({links.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <LinksTable
            links={links.slice(0, 5)}
            onOpenQr={onOpenQr}
            onLinkDeleted={onLinkDeleted}
            onLinkUpdated={onLinkUpdated}
            onSelectLinkForAnalytics={onSelectLinkForAnalytics}
          />
        </section>
      )}
    </div>
  );
}
