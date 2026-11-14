'use client';

import React, { useState, useEffect, use } from 'react';
import { motion } from 'motion/react';
import { Lock, ArrowRight, ShieldCheck, AlertCircle, Crosshair } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeProvider';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { acquireHighAccuracyGps } from '@/lib/gps-client';
import { safeReadApiResponse } from '@/lib/client-auth';

export default function UnlockPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Verifying...');
  const [error, setError] = useState<string | null>(null);
  const [gpsPolicy, setGpsPolicy] = useState<{
    requireGps: boolean;
    gpsMaxAccuracyMeters: number;
    gpsStrictMode: boolean;
  }>({
    requireGps: false,
    gpsMaxAccuracyMeters: 1,
    gpsStrictMode: false,
  });

  useEffect(() => {
    let active = true;
    fetch(`/api/links/public/${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setGpsPolicy({
            requireGps: Boolean(data.requireGps),
            gpsMaxAccuracyMeters: data.gpsMaxAccuracyMeters ?? 1,
            gpsStrictMode: Boolean(data.gpsStrictMode),
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      let gpsPayload: Record<string, unknown> | undefined = undefined;
      if (gpsPolicy.requireGps) {
        setLoadingLabel('Locking High-Accuracy GPS...');
        const fix = await acquireHighAccuracyGps({
          targetAccuracyMeters: gpsPolicy.gpsMaxAccuracyMeters,
          maxWaitMs: 9000,
        });
        gpsPayload = {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyMeters: fix.accuracyMeters,
          altitudeMeters: fix.altitudeMeters,
          headingDeg: fix.headingDeg,
          speedMps: fix.speedMps,
          samplesCount: fix.samplesCount,
        };
      }

      setLoadingLabel('Verifying...');
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password, gps: gpsPayload }),
      });
      const { data, parseErrorMessage } = await safeReadApiResponse<{
        success?: boolean;
        error?: string;
        redirectUrl?: string;
      }>(res);

      if (!res.ok || !data?.success || !data.redirectUrl) {
        setError(data?.error || parseErrorMessage || 'Incorrect password');
        setLoading(false);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred. Please try again.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center px-4 py-12 transition-colors">
      <AmbientBackdrop />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md glass-elevated border border-slate-200/80 dark:border-white/15 rounded-2xl p-8"
      >
        <div className="flex items-center justify-center w-12 h-12 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl mx-auto mb-6">
          <Lock className="w-6 h-6" />
        </div>

        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2">
            Password Protected Link
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This shortened URL requires authorization before accessing the destination website.
          </p>
          {gpsPolicy.requireGps && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
              <Crosshair className="w-3.5 h-3.5" />
              <span>
                Precision GPS lock (&le; {gpsPolicy.gpsMaxAccuracyMeters.toFixed(1)}m target) also required
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="passcode"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5"
            >
              Enter Passcode
            </label>
            <input
              id="passcode"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
              className="w-full px-3.5 py-2.5 bg-white/75 dark:bg-slate-950/60 border border-slate-300/80 dark:border-white/15 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium text-sm transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span>{loadingLabel}</span>
            ) : (
              <>
                <span>{gpsPolicy.requireGps ? 'Unlock & Verify GPS' : 'Access Destination'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Encrypted with LinkPulse Security Engine</span>
        </div>
      </motion.div>
    </div>
  );
}
