'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  MapPin,
  Crosshair,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Satellite,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeProvider';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import {
  acquireBrowserLocation,
  acquireHighAccuracyGps,
  BrowserLocationError,
  GpsFixReading,
  GpsLockProgress,
} from '@/lib/gps-client';
import { safeReadApiResponse } from '@/lib/client-auth';

interface PublicLinkPolicy {
  shortCode: string;
  title: string;
  isActive: boolean;
  isExpired: boolean;
  hasPassword: boolean;
  requireGps: boolean;
  gpsMaxAccuracyMeters: number;
  gpsStrictMode: boolean;
}

export default function VerifyLocationClient({ code }: { code: string }) {
  const [policy, setPolicy] = useState<PublicLinkPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [status, setStatus] = useState<
    'idle' | 'acquiring' | 'verifying' | 'redirecting' | 'error'
  >('idle');
  const [progress, setProgress] = useState<GpsLockProgress | null>(null);
  const [reading, setReading] = useState<GpsFixReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [strictBlocked, setStrictBlocked] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);

  const submitLocationAndRedirect = useCallback(
    async (fix: GpsFixReading, runId: number) => {
      if (activeRunIdRef.current !== runId) return;
      setReading(fix);
      setStatus('verifying');

      const res = await fetch('/api/gps-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          gps: {
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracyMeters: fix.accuracyMeters,
            altitudeMeters: fix.altitudeMeters,
            headingDeg: fix.headingDeg,
            speedMps: fix.speedMps,
            samplesCount: fix.samplesCount,
          },
        }),
      });

      if (activeRunIdRef.current !== runId) return;

      const { data, parseErrorMessage } = await safeReadApiResponse<{
        success?: boolean;
        error?: string;
        errorCode?: string;
        redirectUrl?: string;
      }>(res);

      if (!res.ok || !data?.success || !data.redirectUrl) {
        if (data?.errorCode === 'GPS_ACCURACY_NOT_MET') {
          setStrictBlocked(true);
        }
        setError(data?.error || parseErrorMessage || 'Location verification failed.');
        setStatus('error');
        return;
      }

      setStatus('redirecting');
      window.location.replace(data.redirectUrl);
    },
    [code]
  );

  const handleNormalBrowserLocation = useCallback(async () => {
    const runId = ++activeRunIdRef.current;
    setStatus('acquiring');
    setError(null);
    setPermissionDenied(false);

    try {
      const fix = await acquireBrowserLocation();
      await submitLocationAndRedirect(fix, runId);
    } catch (err) {
      if (activeRunIdRef.current !== runId) return;
      if (err instanceof BrowserLocationError && err.code === 'PERMISSION_DENIED') {
        setPermissionDenied(true);
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Enable location access in your browser to view content.'
      );
      setStatus('error');
    }
  }, [submitLocationAndRedirect]);

  useEffect(() => {
    let active = true;
    fetch(`/api/links/public/${encodeURIComponent(code)}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, data: d })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          setError(data.error || 'Short link unavailable.');
          setStatus('error');
          return;
        }

        setPolicy(data);

        if (data.hasPassword) {
          window.location.replace(`/unlock/${encodeURIComponent(code)}`);
          return;
        }
        if (!data.isActive) {
          setError('This shortened link has been paused by its owner.');
          setStatus('error');
          return;
        }
        if (data.isExpired) {
          setError('This shortened link has expired.');
          setStatus('error');
          return;
        }

        // For normal links, immediately trigger the native browser location permission prompt
        if (!data.requireGps) {
          void handleNormalBrowserLocation();
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load link details. Please refresh and try again.');
          setStatus('error');
        }
      })
      .finally(() => {
        if (active) setPolicyLoading(false);
      });

    return () => {
      active = false;
      activeRunIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, [code, handleNormalBrowserLocation]);

  const handleAcquireAndVerifyPrecision = async (extendedWindowMs = 9000) => {
    if (!policy || !policy.isActive || policy.isExpired) return;

    const runId = ++activeRunIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('acquiring');
    setError(null);
    setPermissionDenied(false);
    setStrictBlocked(false);
    setReading(null);
    setProgress({
      samplesCount: 0,
      bestAccuracyMeters: null,
      latestAccuracyMeters: null,
      latitude: null,
      longitude: null,
      elapsedMs: 0,
      targetMet: false,
    });

    try {
      const targetMeters = policy.gpsMaxAccuracyMeters ?? 1;
      const fix = await acquireHighAccuracyGps({
        targetAccuracyMeters: targetMeters,
        maxWaitMs: extendedWindowMs,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });

      await submitLocationAndRedirect(fix, runId);
    } catch (err) {
      if (activeRunIdRef.current !== runId) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to capture high-accuracy GPS position.'
      );
      setStatus('error');
    }
  };

  const isPrecisionMode = Boolean(policy?.requireGps);
  const targetMeters = policy?.gpsMaxAccuracyMeters ?? 1;
  const linkUnavailable = Boolean(policy && (!policy.isActive || policy.isExpired));

  return (
    <div className="min-h-screen relative text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center px-4 py-12 transition-colors">
      <AmbientBackdrop />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md glass-elevated border border-slate-200/80 dark:border-white/15 rounded-2xl p-8"
      >
        <div className="flex items-center justify-center w-12 h-12 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl mx-auto mb-5">
          {isPrecisionMode ? <Crosshair className="w-6 h-6" /> : <MapPin className="w-6 h-6" />}
        </div>

        {/* Normal Link View: Clean Disclaimer Background while Browser Location Popup Prompts */}
        {!isPrecisionMode ? (
          <>
            <div className="text-center mb-6">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white text-balance mb-2">
                Enable location to view content
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {linkUnavailable
                  ? 'This link is currently unavailable.'
                  : 'Please allow the location permission prompt in your browser to continue to the destination.'}
              </p>
              <div className="mt-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                /r/{policy?.shortCode ?? code}
              </div>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
                <div className="space-y-1">
                  <p>{error}</p>
                  {permissionDenied && (
                    <p className="text-[11px] text-red-600/90 dark:text-red-300/80">
                      Open site permissions in your browser address bar, set Location to Allow,
                      then tap retry below.
                    </p>
                  )}
                </div>
              </div>
            )}

            {status === 'redirecting' ? (
              <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Location confirmed. Opening content...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={
                    policyLoading ||
                    linkUnavailable ||
                    status === 'acquiring' ||
                    status === 'verifying'
                  }
                  onClick={() => void handleNormalBrowserLocation()}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium text-sm transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {policyLoading || status === 'acquiring' || status === 'verifying' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {status === 'verifying'
                          ? 'Opening content...'
                          : 'Waiting for location permission...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>Enable Location &amp; View Content</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
                  Enabled location to view content · Location is requested by your browser before
                  redirecting.
                </p>
              </div>
            )}
          </>
        ) : (
          /* Precision GNSS Gate View (when link explicitly enables high-accuracy GPS target) */
          <>
            <div className="text-center mb-6">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-1.5">
                Precision GPS Verification
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {policy ? (
                  <>
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      /r/{policy.shortCode}
                    </span>{' '}
                    requests live browser GNSS coordinates targeting{' '}
                    <span className="font-mono font-semibold">
                      &le; {targetMeters.toFixed(1)}m
                    </span>{' '}
                    accuracy before redirecting.
                  </>
                ) : (
                  'Checking link verification policy...'
                )}
              </p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {(status === 'acquiring' ||
              status === 'verifying' ||
              status === 'redirecting' ||
              reading) && (
              <div className="mb-5 p-4 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-slate-200/80 dark:border-white/10 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                    <Satellite
                      className={`w-3.5 h-3.5 ${
                        status === 'acquiring' ? 'animate-pulse text-indigo-500' : 'text-emerald-500'
                      }`}
                    />
                    <span>
                      {status === 'acquiring'
                        ? 'Acquiring multi-sample GNSS lock...'
                        : status === 'verifying'
                          ? 'Validating coordinates...'
                          : status === 'redirecting'
                            ? 'Verified — Redirecting...'
                            : 'Latest Measured Fix'}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {reading?.samplesCount ?? progress?.samplesCount ?? 0} samples
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] tabular-nums">
                  <div className="p-2 rounded-lg bg-slate-100/80 dark:bg-white/5">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Measured Radius
                    </div>
                    <div
                      className={`font-bold ${
                        (reading?.accuracyMeters ?? progress?.bestAccuracyMeters ?? 999) <=
                        targetMeters
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {reading
                        ? `±${reading.accuracyMeters.toFixed(2)} m`
                        : progress?.bestAccuracyMeters != null
                          ? `±${progress.bestAccuracyMeters.toFixed(2)} m`
                          : 'Waiting...'}
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-100/80 dark:bg-white/5">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Target Policy
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      &le; {targetMeters.toFixed(1)} m ({policy?.gpsStrictMode ? 'Strict' : 'Best Fix'})
                    </div>
                  </div>
                </div>

                {(reading || (progress?.latitude != null && progress?.longitude != null)) && (
                  <div className="pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 tabular-nums truncate">
                    {(reading?.latitude ?? progress?.latitude)?.toFixed(7)},{' '}
                    {(reading?.longitude ?? progress?.longitude)?.toFixed(7)}
                  </div>
                )}
              </div>
            )}

            {status === 'redirecting' ? (
              <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Location verified. Opening destination...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={
                    policyLoading ||
                    !policy ||
                    !policy.isActive ||
                    policy.isExpired ||
                    status === 'acquiring' ||
                    status === 'verifying'
                  }
                  onClick={() => handleAcquireAndVerifyPrecision(strictBlocked ? 15000 : 9000)}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium text-sm transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {status === 'acquiring' || status === 'verifying' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {status === 'acquiring' ? 'Locking GNSS Signal...' : 'Verifying Fix...'}
                      </span>
                    </>
                  ) : strictBlocked ? (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Retry Extended GNSS Lock (15s)</span>
                    </>
                  ) : (
                    <>
                      <span>Share Location &amp; Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
                  Enable location to view content. Your browser prompts for location consent before
                  redirecting.
                </p>
              </div>
            )}
          </>
        )}

        <div className="mt-7 pt-5 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Protected by XrGeoLink Location Gate</span>
        </div>
      </motion.div>
    </div>
  );
}
