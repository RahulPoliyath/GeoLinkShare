'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Link2, ShieldCheck, Crosshair, BarChart3 } from 'lucide-react';

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
          key="linkpulse-splash"
          role="status"
          aria-live="polite"
          aria-label="Loading LinkPulse"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: prefersReducedMotion ? 1 : 1.015,
            transition: { duration: EXIT_FADE_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 bg-slate-50 dark:bg-[#060913] text-slate-900 dark:text-slate-100 select-none overflow-hidden"
        >
          {/* Ambient Grid & Refracted Glow matching main workspace */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none overflow-hidden"
          >
            <div
              className="absolute inset-0 tech-grid-bg opacity-85"
              style={{
                maskImage:
                  'radial-gradient(ellipse 75% 65% at 50% 45%, black 25%, transparent 100%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 75% 65% at 50% 45%, black 25%, transparent 100%)',
              }}
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[380px] rounded-full bg-indigo-400/20 dark:bg-indigo-500/20 blur-[120px]" />
            <div className="absolute top-1/3 left-1/3 w-[360px] h-[280px] rounded-full bg-sky-300/20 dark:bg-sky-500/15 blur-[100px]" />
          </div>

          {/* Centerpiece Brand Reveal Card */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md glass-surface border border-slate-200/80 dark:border-white/15 rounded-3xl p-8 sm:p-10 text-center"
          >
            {/* Brand Mark with Dual Counter-Rotating Orbital Rings */}
            <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
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
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30"
              >
                <Link2 className="w-7 h-7" />
              </motion.div>
            </div>

            {/* Wordmark & Positioning */}
            <div className="overflow-hidden">
              <motion.h1
                initial={prefersReducedMotion ? false : { y: '100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white"
              >
                LinkPulse
              </motion.h1>
            </div>
            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 text-sm text-slate-600 dark:text-slate-300 text-balance"
            >
              Secure URL Shortening &amp; Real-Time Geographic Telemetry
            </motion.p>

            {/* Three Capability Indicators (clean unboxed text) */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.3 }}
              className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400"
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
