'use client';

import React, { useEffect } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';

export function AmbientBackdrop() {
  const prefersReduced = useReducedMotion();
  const { scrollY } = useScroll();

  const parallaxSlow = useTransform(scrollY, [0, 1400], [0, -90]);
  const parallaxMid = useTransform(scrollY, [0, 1400], [0, -150]);

  const rawX = useMotionValue(-999);
  const rawY = useMotionValue(-999);
  const smoothX = useSpring(rawX, { stiffness: 120, damping: 24, mass: 0.6 });
  const smoothY = useSpring(rawY, { stiffness: 120, damping: 24, mass: 0.6 });

  const cursorAura = useMotionTemplate`radial-gradient(520px circle at ${smoothX}px ${smoothY}px, rgba(56, 189, 248, 0.095), rgba(99, 102, 241, 0.045) 42%, transparent 72%)`;

  useEffect(() => {
    if (prefersReduced) return;

    const handlePointerMove = (e: PointerEvent) => {
      rawX.set(e.clientX);
      rawY.set(e.clientY);
    };

    const handlePointerLeave = () => {
      rawX.set(-999);
      rawY.set(-999);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [prefersReduced, rawX, rawY]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
    >
      {/* Dual-scale precision coordinate matrix with soft elliptical fade */}
      <div
        className="absolute inset-0 tech-grid-bg opacity-90"
        style={{
          maskImage: 'radial-gradient(ellipse 86% 72% at 50% 18%, black 18%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 86% 72% at 50% 18%, black 18%, transparent 100%)',
        }}
      />

      {/* Pointer-coupled optical field (zero React re-renders) */}
      {!prefersReduced && (
        <motion.div
          style={{ background: cursorAura }}
          className="absolute inset-0 opacity-85 dark:opacity-100"
        />
      )}

      {/* Scroll-parallaxed volumetric atmospheric fields */}
      <motion.div
        style={prefersReduced ? undefined : { y: parallaxSlow }}
        className="absolute inset-0"
      >
        <motion.div
          animate={
            prefersReduced
              ? undefined
              : {
                  x: [-18, 22, -18],
                  y: [0, 14, 0],
                  scale: [1, 1.05, 1],
                }
          }
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-44 left-1/2 -translate-x-1/2 w-[940px] h-[480px] rounded-full bg-indigo-400/20 dark:bg-indigo-500/20 blur-[125px] will-change-transform"
        />

        <motion.div
          animate={
            prefersReduced
              ? undefined
              : {
                  x: [0, 26, 0],
                  y: [0, -18, 0],
                  scale: [1, 1.08, 1],
                }
          }
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-36 -left-36 w-[540px] h-[440px] rounded-full bg-sky-300/20 dark:bg-cyan-500/12 blur-[115px] will-change-transform"
        />

        <motion.div
          animate={
            prefersReduced
              ? undefined
              : {
                  x: [0, -24, 0],
                  y: [0, -16, 0],
                  scale: [1, 1.06, 1],
                }
          }
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-0 -right-28 w-[560px] h-[440px] rounded-full bg-blue-400/15 dark:bg-indigo-600/14 blur-[125px] will-change-transform"
        />
      </motion.div>

      {/* Architectural hairline orbital calibration rings */}
      <motion.div
        style={prefersReduced ? undefined : { y: parallaxMid }}
        className="absolute inset-x-0 -top-24 flex justify-center opacity-50 dark:opacity-45"
      >
        <div className="relative w-[1080px] h-[1080px]">
          <motion.svg
            viewBox="0 0 800 800"
            className="w-full h-full will-change-transform"
            animate={prefersReduced ? undefined : { rotate: 360 }}
            transition={{ duration: 130, repeat: Infinity, ease: 'linear' }}
          >
            <circle
              cx="400"
              cy="400"
              r="360"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeDasharray="3 11"
              className="text-indigo-500/25 dark:text-cyan-400/20"
            />
            <circle
              cx="400"
              cy="400"
              r="285"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeDasharray="1 18"
              className="text-sky-500/25 dark:text-indigo-400/25"
            />
          </motion.svg>

          <motion.svg
            viewBox="0 0 800 800"
            className="absolute inset-0 w-full h-full will-change-transform"
            animate={prefersReduced ? undefined : { rotate: -360 }}
            transition={{ duration: 95, repeat: Infinity, ease: 'linear' }}
          >
            <circle
              cx="400"
              cy="400"
              r="322"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.9"
              strokeDasharray="48 190 12 160"
              className="text-cyan-500/25 dark:text-cyan-300/20"
            />
          </motion.svg>
        </div>
      </motion.div>

      {/* Subtle compositor-only optical horizon sweep */}
      {!prefersReduced && (
        <motion.div
          initial={{ y: '-15vh', opacity: 0 }}
          animate={{
            y: ['0vh', '108vh'],
            opacity: [0, 0.45, 0.45, 0],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: 'linear',
            times: [0, 0.12, 0.88, 1],
          }}
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/35 dark:via-cyan-400/35 to-transparent will-change-transform"
        />
      )}

      {/* Fine optical film grain to eliminate dark gradient banding */}
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.032] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
