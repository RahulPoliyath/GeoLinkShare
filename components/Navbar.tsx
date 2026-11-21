'use client';

import React, { useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from 'motion/react';
import { Globe2, Crosshair, Link2 } from 'lucide-react';
import { ThemeToggle } from './ThemeProvider';

interface NavbarProps {
  activeTab: 'shorten' | 'dashboard' | 'analytics' | 'security' | 'about';
  setActiveTab: (tab: 'shorten' | 'dashboard' | 'analytics' | 'security' | 'about') => void;
}

const NAV_ITEMS = [
  { id: 'shorten', label: 'Shorten Link' },
  { id: 'dashboard', label: 'My Links' },
  { id: 'analytics', label: 'Real-Time Analytics' },
  { id: 'security', label: 'Security Architecture' },
  { id: 'about', label: 'About Us' },
] as const;

const BRAND_LETTERS = [
  { char: 'X', accent: true },
  { char: 'r', accent: true },
  { char: 'G', accent: false },
  { char: 'e', accent: false },
  { char: 'o', accent: false },
  { char: 'L', accent: false },
  { char: 'i', accent: false },
  { char: 'n', accent: false },
  { char: 'k', accent: false },
] as const;

function XrHeaderBrand() {
  const [hovered, setHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className="flex items-center gap-2.5 sm:gap-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Multi-Layer Hi-Tech Gyroscopic Quantum Emblem */}
      <motion.div
        whileHover={prefersReducedMotion ? undefined : { scale: 1.08 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 440, damping: 22 }}
        className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
      >
        {/* Outer Ambient Pulse Halo on Hover */}
        {!prefersReducedMotion && (
          <motion.span
            aria-hidden="true"
            animate={
              hovered
                ? { scale: [1, 1.32], opacity: [0.55, 0] }
                : { scale: 1, opacity: 0 }
            }
            transition={{
              duration: 0.85,
              repeat: hovered ? Infinity : 0,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="pointer-events-none absolute inset-0 rounded-xl border border-cyan-400/70 dark:border-cyan-300/75"
          />
        )}

        {/* Sweeping Conic Laser Bezel */}
        <div className="relative w-full h-full rounded-xl p-[1.5px] overflow-hidden bg-slate-200/80 dark:bg-slate-800/90 shadow-md shadow-indigo-500/20 dark:shadow-cyan-500/20">
          <motion.div
            aria-hidden="true"
            animate={prefersReducedMotion ? undefined : { rotate: 360 }}
            transition={{
              duration: hovered ? 2.2 : 6,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="pointer-events-none absolute -inset-4 bg-[conic-gradient(from_0deg,transparent_0deg,transparent_210deg,#6366f1_275deg,#22d3ee_335deg,#ffffff_355deg,transparent_360deg)]"
          />

          {/* Inner Core Housing */}
          <div className="relative w-full h-full rounded-[10.5px] bg-gradient-to-br from-slate-950 via-[#071129] to-indigo-950 flex items-center justify-center overflow-hidden">
            {/* Optical Radial Core Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(34,211,238,0.34),transparent_62%)]"
            />

            {/* Counter-Rotating Precision Reticle Ring */}
            <motion.div
              aria-hidden="true"
              animate={prefersReducedMotion ? undefined : { rotate: -360 }}
              transition={{
                duration: hovered ? 4 : 10,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="pointer-events-none absolute inset-1 rounded-full border border-dashed border-cyan-300/35"
            />

            {/* Orbiting Telemetry Photon */}
            {!prefersReducedMotion && (
              <motion.div
                aria-hidden="true"
                animate={{ rotate: 360 }}
                transition={{
                  duration: hovered ? 1.8 : 4.2,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="pointer-events-none absolute inset-1"
              >
                <span className="absolute top-0 left-1/2 block w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.95)] -translate-x-1/2 -translate-y-1/2" />
              </motion.div>
            )}

            {/* Holographic Diagonal Sheen Wipe */}
            {!prefersReducedMotion && (
              <motion.div
                aria-hidden="true"
                animate={{ x: ['-150%', '220%'] }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  repeatDelay: hovered ? 0.6 : 3.2,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="pointer-events-none absolute inset-y-0 w-4 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent"
              />
            )}

            {/* Dual-Layer Globe & Precision Target Lock */}
            <motion.div
              animate={
                prefersReducedMotion
                  ? undefined
                  : hovered
                    ? { rotate: 180, scale: 1.08 }
                    : { rotate: 0, scale: 1 }
              }
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="relative z-10 flex items-center justify-center text-cyan-300"
            >
              <Globe2 className="w-4 h-4 sm:w-[18px] sm:h-[18px] stroke-[2.1] drop-shadow-[0_0_8px_rgba(34,211,238,0.55)]" />
              <Crosshair className="w-2.5 h-2.5 text-white/90 absolute opacity-85" />
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Kinetic Wordmark: Staggered 3D Rise, Periodic Light Sweep & Laser Underline */}
      <div className="relative flex flex-col">
        <span className="relative inline-flex items-baseline text-base sm:text-lg font-extrabold tracking-tight whitespace-nowrap shrink-0 overflow-hidden py-0.5">
          {BRAND_LETTERS.map((item, idx) => (
            <motion.span
              key={`${item.char}-${idx}`}
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 10, rotateX: 40 }
              }
              animate={
                hovered && !prefersReducedMotion
                  ? {
                      opacity: 1,
                      y: [0, -2.5, 0],
                      rotateX: 0,
                      transition: {
                        delay: idx * 0.025,
                        duration: 0.32,
                        ease: [0.16, 1, 0.3, 1],
                      },
                    }
                  : {
                      opacity: 1,
                      y: 0,
                      rotateX: 0,
                      transition: {
                        delay: idx * 0.032,
                        duration: 0.42,
                        ease: [0.16, 1, 0.3, 1],
                      },
                    }
              }
              className={
                item.accent
                  ? 'inline-block bg-gradient-to-br from-indigo-600 via-cyan-500 to-sky-400 dark:from-cyan-300 dark:via-sky-300 dark:to-indigo-400 bg-clip-text text-transparent'
                  : 'inline-block text-slate-900 dark:text-white'
              }
            >
              {item.char}
            </motion.span>
          ))}

          {/* High-Velocity Chromatic Light Sweep Across Wordmark */}
          {!prefersReducedMotion && (
            <motion.span
              aria-hidden="true"
              animate={{ x: ['-130%', '240%'] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                repeatDelay: hovered ? 0.9 : 4.2,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="pointer-events-none absolute inset-y-0 w-10 -skew-x-12 bg-gradient-to-r from-transparent via-cyan-300/45 dark:via-cyan-200/40 to-transparent mix-blend-screen"
            />
          )}
        </span>

        {/* Precision Laser Trace Underline on Hover */}
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{
            scaleX: hovered ? 1 : 0.28,
            opacity: hovered ? 1 : 0.55,
          }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="origin-left h-[2px] w-full rounded-full bg-gradient-to-r from-indigo-600 via-cyan-400 to-transparent shadow-[0_0_8px_rgba(34,211,238,0.6)]"
        />
      </div>
    </div>
  );
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    const next = latest > 20;
    if (next !== scrolled) {
      setScrolled(next);
    }
  });

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b transition-all duration-200 ${
        scrolled
          ? 'border-slate-200/90 dark:border-white/15 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl shadow-sm shadow-slate-900/5 dark:shadow-black/40'
          : 'border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-950/65 backdrop-blur-xl'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-5 lg:gap-8">
        {/* Zone 1: Hi-Tech Kinetic Brand Lockup */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('shorten')}
            aria-label="XrGeoLink Home"
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl group py-0.5 pr-1"
          >
            <XrHeaderBrand />
          </button>
        </div>

        {/* Zone 2: Clean single-line text navigation links with precision spring underline */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-4 xl:gap-5 text-xs xl:text-sm font-medium text-slate-600 dark:text-slate-300">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative whitespace-nowrap shrink-0 py-1.5 px-1.5 lg:px-2.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? 'text-indigo-600 dark:text-cyan-300 font-semibold'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="navbar-active-surface"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 -z-10 rounded-lg bg-indigo-500/[0.08] dark:bg-cyan-400/[0.08] border border-indigo-500/15 dark:border-cyan-400/20"
                  />
                )}
                <span>{item.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="navbar-active-indicator"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                    className="absolute left-2 right-2 -bottom-[1px] h-[2px] rounded-full bg-gradient-to-r from-indigo-600 via-cyan-400 to-sky-500"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Toggle & Animated Quick Shorten CTA */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <ThemeToggle />

          <AnimatePresence mode="popLayout">
            {activeTab !== 'shorten' && (
              <motion.button
                key="new-short-link-cta"
                initial={{ opacity: 0, scale: 0.9, x: 8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setActiveTab('shorten')}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 lg:px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all whitespace-nowrap shrink-0 shadow-sm shadow-indigo-500/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>New Short Link</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Auto-fit mobile navigation grid (zero horizontal scroll across 320px-767px screens) */}
      <nav className="md:hidden border-t border-slate-200/70 dark:border-white/10 px-1.5 py-1.5 grid grid-cols-5 gap-0.5 text-[10px] min-[380px]:text-[11px] font-medium text-slate-600 dark:text-slate-400">
        {(
          [
            { id: 'shorten', label: 'Shorten' },
            { id: 'dashboard', label: 'My Links' },
            { id: 'analytics', label: 'Analytics' },
            { id: 'security', label: 'Security' },
            { id: 'about', label: 'About Us' },
          ] as const
        ).map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex items-center justify-center whitespace-nowrap py-1.5 px-1 rounded-lg transition-colors ${
                active
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-500/[0.06] dark:bg-indigo-400/[0.08]'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{item.label}</span>
              {active && (
                <motion.span
                  layoutId="mobile-nav-indicator"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute left-2 right-2 -bottom-0.5 h-0.5 rounded-full bg-indigo-500"
                />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
