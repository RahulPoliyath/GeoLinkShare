'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Link2 } from 'lucide-react';
import { ThemeToggle } from './ThemeProvider';

interface NavbarProps {
  activeTab: 'shorten' | 'dashboard' | 'analytics' | 'security';
  setActiveTab: (tab: 'shorten' | 'dashboard' | 'analytics' | 'security') => void;
}

const NAV_ITEMS = [
  { id: 'shorten', label: 'Shorten Link' },
  { id: 'dashboard', label: 'My Links' },
  { id: 'analytics', label: 'Real-Time Analytics' },
  { id: 'security', label: 'Security Architecture' },
] as const;

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-950/65 backdrop-blur-xl transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('shorten')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center text-white font-bold text-base shadow-sm shadow-indigo-500/25 transition-transform duration-150 group-hover:scale-105">
              L
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              LinkPulse
            </span>
          </button>
        </div>

        {/* Zone 2: Clean single-line text navigation links with animated active bar */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative whitespace-nowrap shrink-0 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-1 ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="navbar-active-indicator"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                    className="absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-sky-500 dark:from-indigo-400 dark:to-sky-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Toggle & Quick Shorten CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <ThemeToggle />

          {activeTab !== 'shorten' && (
            <button
              onClick={() => setActiveTab('shorten')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all whitespace-nowrap shrink-0 shadow-sm shadow-indigo-500/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>New Short Link</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav className="md:hidden border-t border-slate-200/70 dark:border-white/10 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600 dark:text-slate-400">
        {(
          [
            { id: 'shorten', label: 'Shorten' },
            { id: 'dashboard', label: 'My Links' },
            { id: 'analytics', label: 'Analytics' },
            { id: 'security', label: 'Security' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
              activeTab === item.id
                ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
