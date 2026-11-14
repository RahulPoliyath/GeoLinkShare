'use client';

import React from 'react';

export function AmbientBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
    >
      {/* Subtle hi-tech coordinate grid with radial vignette */}
      <div
        className="absolute inset-0 tech-grid-bg opacity-80"
        style={{
          maskImage: 'radial-gradient(ellipse 80% 65% at 50% 15%, black 20%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 65% at 50% 15%, black 20%, transparent 100%)',
        }}
      />

      {/* Ambient refracted light fields for glass depth */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[460px] rounded-full bg-indigo-400/20 dark:bg-indigo-500/18 blur-[120px]" />
      <div className="absolute top-32 -left-32 w-[520px] h-[420px] rounded-full bg-sky-300/20 dark:bg-sky-500/12 blur-[110px]" />
      <div className="absolute bottom-0 -right-24 w-[520px] h-[420px] rounded-full bg-blue-400/15 dark:bg-indigo-600/12 blur-[120px]" />
    </div>
  );
}
