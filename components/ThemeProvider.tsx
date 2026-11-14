'use client';

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'lp_theme';
const THEME_EVENT = 'lp-theme-change';

function getThemeSnapshot(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getServerThemeSnapshot(): ThemeMode {
  return 'light';
}

function subscribeTheme(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  const onCustom = () => callback();
  const onMedia = () => {
    if (!window.localStorage.getItem(STORAGE_KEY)) callback();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_EVENT, onCustom);
  media.addEventListener('change', onMedia);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_EVENT, onCustom);
    media.removeEventListener('change', onMedia);
  };
}

function subscribeMounted(): () => void {
  return () => {};
}

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setTheme = (next: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors in restricted contexts
    }
    document.documentElement.classList.toggle('dark', next === 'dark');
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const isDark = mounted ? theme === 'dark' : false;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200/80 dark:border-white/15 bg-white/70 dark:bg-white/5 backdrop-blur-md text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10 transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0 shadow-xs ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-slate-700" />
      )}
    </button>
  );
}
