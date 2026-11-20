'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'motion/react';

/**
 * Ultra-thin compositor-only scroll progress indicator anchored at top of viewport.
 */
export function ScrollProgressLine() {
  const prefersReduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 32,
    restDelta: 0.001,
  });

  if (prefersReduced) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[2px] z-50 origin-left pointer-events-none bg-gradient-to-r from-indigo-500 via-cyan-400 to-sky-500 shadow-[0_0_12px_rgba(34,211,238,0.45)]"
    />
  );
}

/**
 * Smooth spring-eased tabular numeric counter that animates gracefully on live updates.
 */
interface AnimatedNumberProps {
  value: number;
  formatter?: (n: number) => string;
  className?: string;
}

export function AnimatedNumber({
  value,
  formatter = (n) => Math.round(n).toLocaleString(),
  className = '',
}: AnimatedNumberProps) {
  const prefersReduced = useReducedMotion();
  const [display, setDisplay] = useState<string>(() => formatter(value));
  const prevValueRef = useRef<number>(value);

  useEffect(() => {
    if (prefersReduced) {
      Promise.resolve().then(() => {
        setDisplay(formatter(value));
      });
      prevValueRef.current = value;
      return;
    }

    const from = prevValueRef.current;
    prevValueRef.current = value;

    if (from === value) {
      Promise.resolve().then(() => {
        setDisplay(formatter(value));
      });
      return;
    }

    const controls = animate(from, value, {
      duration: 0.65,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setDisplay(formatter(latest));
      },
      onComplete: () => {
        setDisplay(formatter(value));
      },
    });

    return () => {
      controls.stop();
    };
  }, [value, formatter, prefersReduced]);

  return <span className={`tabular-nums ${className}`}>{display}</span>;
}

/**
 * Dual-layer optical spotlight card with pointer-tracked specular surface + border edge refraction.
 * Uses MotionValues directly so cursor movement triggers zero React re-renders.
 */
interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  borderGlowColor?: string;
  delay?: number;
  hoverLift?: boolean;
  showReticles?: boolean;
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(56, 189, 248, 0.14)',
  borderGlowColor = 'rgba(99, 102, 241, 0.55)',
  delay = 0,
  hoverLift = true,
  showReticles = false,
}: SpotlightCardProps) {
  const prefersReduced = useReducedMotion();
  const mouseX = useMotionValue(-400);
  const mouseY = useMotionValue(-400);

  const surfaceGlow = useMotionTemplate`radial-gradient(360px circle at ${mouseX}px ${mouseY}px, ${spotlightColor}, transparent 74%)`;
  const borderGlow = useMotionTemplate`radial-gradient(240px circle at ${mouseX}px ${mouseY}px, ${borderGlowColor}, transparent 70%)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const handlePointerLeave = () => {
    mouseX.set(-400);
    mouseY.set(-400);
  };

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      whileHover={hoverLift && !prefersReduced ? { y: -3 } : undefined}
      transition={{ duration: 0.38, delay, ease: [0.16, 1, 0.3, 1] }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`group relative overflow-hidden ${className}`}
    >
      {/* Pointer-tracked surface illumination */}
      {!prefersReduced && (
        <motion.div
          aria-hidden="true"
          style={{ background: surfaceGlow }}
          className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        />
      )}

      {/* Pointer-tracked crisp 1px edge refraction ring */}
      {!prefersReduced && (
        <motion.div
          aria-hidden="true"
          style={{
            background: borderGlow,
            WebkitMask:
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
          className="pointer-events-none absolute inset-0 rounded-[inherit] p-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        />
      )}

      {/* Optional architectural corner reticle ticks */}
      {showReticles && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 z-10 opacity-40 group-hover:opacity-90 transition-opacity duration-200"
        >
          <span className="absolute top-0 left-0 w-2 h-2 border-t border-l border-indigo-400/60 dark:border-cyan-400/55" />
          <span className="absolute top-0 right-0 w-2 h-2 border-t border-r border-indigo-400/60 dark:border-cyan-400/55" />
          <span className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-indigo-400/60 dark:border-cyan-400/55" />
          <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-indigo-400/60 dark:border-cyan-400/55" />
        </div>
      )}

      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
  );
}

/**
 * Editorial masked headline reveal sliding cleanly out of an overflow boundary.
 */
interface MaskedRevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function MaskedReveal({ children, delay = 0, className = '' }: MaskedRevealProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      <motion.div
        initial={{ y: '105%', opacity: 0 }}
        animate={{ y: '0%', opacity: 1 }}
        transition={{ duration: 0.62, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Tactile spring-coupled magnetic wrapper for primary interactive buttons.
 */
interface MagneticShellProps {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}

export function MagneticShell({
  children,
  className = '',
  strength = 6,
}: MagneticShellProps) {
  const prefersReduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 320, damping: 22, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 320, damping: 22, mass: 0.4 });

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      style={{ x: springX, y: springY }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        x.set(relX * strength * 2);
        y.set(relY * strength * 2);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}

/**
 * Minimal animated streaming waveform bars for active real-time telemetry feeds.
 */
export function LiveWaveformBars({ active }: { active: boolean }) {
  const prefersReduced = useReducedMotion();

  if (!active) return null;

  return (
    <span aria-hidden="true" className="inline-flex items-end gap-[2px] h-3">
      {[0, 1, 2].map((bar) => (
        <motion.span
          key={bar}
          animate={
            prefersReduced
              ? { scaleY: 0.7 }
              : {
                  scaleY: [0.35, 1, 0.45, 0.85, 0.35],
                }
          }
          transition={{
            duration: 1.15,
            repeat: Infinity,
            delay: bar * 0.18,
            ease: 'easeInOut',
          }}
          className="w-[2px] h-full origin-bottom rounded-full bg-emerald-500"
        />
      ))}
    </span>
  );
}

/**
 * Bespoke spring-animated toggle switch replacing bare checkboxes.
 */
interface SpringToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}

export function SpringToggle({ checked, onChange, ariaLabel }: SpringToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        checked
          ? 'bg-indigo-600 border-indigo-500'
          : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-white/15'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
