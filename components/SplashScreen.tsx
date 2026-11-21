'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Globe2, ShieldCheck, Crosshair, BarChart3 } from 'lucide-react';
import { AmbientBackdrop } from './AmbientBackdrop';

const SPLASH_DURATION_MS = 6000;
const EXIT_FADE_MS = 380;

const STAGE_MESSAGES = [
  'Initializing isolated workspace',
  'Verifying security & SSRF shields',
  'Preparing real-time analytics',
] as const;

interface SplashScreenProps {
  onComplete?: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps = {}) {
  const pathname = usePathname();
  const isVisitorGateRoute =
    Boolean(pathname?.startsWith('/verify-location')) ||
    Boolean(pathname?.startsWith('/unlock')) ||
    Boolean(pathname?.startsWith('/link-status'));

  const [phase, setPhase] = useState<'active' | 'exiting' | 'done'>('active');
  const [elapsedMs, setElapsedMs] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isVisitorGateRoute) return;

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    const startTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(SPLASH_DURATION_MS, now - startTime);
      setElapsedMs(elapsed);
      if (elapsed < SPLASH_DURATION_MS) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    const exitTimer = window.setTimeout(() => {
      setElapsedMs(SPLASH_DURATION_MS);
      setPhase('exiting');
      document.documentElement.style.overflow = prevOverflow;
    }, SPLASH_DURATION_MS);

    const doneTimer = window.setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, SPLASH_DURATION_MS + EXIT_FADE_MS);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [isVisitorGateRoute, onComplete]);

  if (isVisitorGateRoute || phase === 'done') {
    return null;
  }

  const progressRatio = Math.min(1, Math.max(0, elapsedMs / SPLASH_DURATION_MS));
  const secondsRemaining = Math.max(
    0,
    Math.ceil((SPLASH_DURATION_MS - elapsedMs) / 1000)
  );
  const stageIndex =
    progressRatio < 0.34 ? 0 : progressRatio < 0.72 ? 1 : 2;

  return (
    <AnimatePresence>
      {phase === 'active' && (
        <motion.div
          key="xrgeolink-splash"
          role="status"
          aria-live="polite"
          aria-label="Loading XrGeoLink"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: prefersReducedMotion ? 1 : 1.015,
            transition: { duration: EXIT_FADE_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-3 sm:px-6 bg-slate-50 dark:bg-[#060913] text-slate-900 dark:text-slate-100 select-none overflow-hidden"
        >
          {/* Living Hi-Tech Ambient Backdrop */}
          <AmbientBackdrop />

          {/* Centerpiece Brand Reveal Card */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl sm:rounded-3xl p-5 sm:p-10 text-center overflow-hidden"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-3.5">
              <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-indigo-400/50 dark:border-cyan-400/45" />
              <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-indigo-400/50 dark:border-cyan-400/45" />
              <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-indigo-400/50 dark:border-cyan-400/45" />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-indigo-400/50 dark:border-cyan-400/45" />
            </div>
            {/* Brand Mark with Dual Counter-Rotating Orbital Rings */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-5 sm:mb-6 flex items-center justify-center">
              {!prefersReducedMotion && (
                <>
                  <motion.div
                    aria-hidden="true"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border border-dashed border-indigo-500/45 dark:border-cyan-400/40"
                  />
                  <motion.div
                    aria-hidden="true"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-2 rounded-full border border-indigo-400/25 dark:border-indigo-300/25 border-t-cyan-400/75"
                  />
                </>
              )}
              <motion.div
                initial={prefersReducedMotion ? {} : { scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-slate-950 via-[#071129] to-indigo-950 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-lg shadow-indigo-500/30"
              >
                <Globe2 className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2]" />
                <Crosshair className="w-3.5 h-3.5 text-white/90 absolute" />
              </motion.div>
            </div>

            {/* Wordmark & Positioning */}
            <div className="overflow-hidden">
              <motion.h1
                initial={prefersReducedMotion ? false : { y: '100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white"
              >
                <span className="bg-gradient-to-br from-indigo-600 via-cyan-500 to-sky-400 dark:from-cyan-300 dark:via-sky-300 dark:to-indigo-400 bg-clip-text text-transparent">
                  Xr
                </span>
                GeoLink
              </motion.h1>
            </div>
            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-balance"
            >
              Secure URL Shortening &amp; Real-Time Geographic Telemetry
            </motion.p>

            {/* Three Capability Indicators (clean unboxed text) */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.3 }}
              className="mt-5 sm:mt-6 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>SSRF Guard</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Stats</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-sky-500" />
                <span>1m GNSS</span>
              </span>
            </motion.div>

            {/* Compositor-Only Progress Track + Animated Stage Message Crossfade */}
            <div className="mt-8 space-y-2.5">
              <div className="w-full h-1.5 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full w-full origin-left rounded-full bg-gradient-to-r from-indigo-600 via-cyan-400 to-indigo-500 will-change-transform"
                  style={{
                    transform: `scaleX(${progressRatio})`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 min-h-[18px]">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={stageIndex}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="truncate"
                  >
                    {STAGE_MESSAGES[stageIndex]}
                  </motion.span>
                </AnimatePresence>
                <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 shrink-0 ml-3">
                  {secondsRemaining}s
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
