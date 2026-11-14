'use client';

import React, { use, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
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
  acquireHighAccuracyGps,
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

export default function VerifyLocationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [policy, setPolicy] = useState<PublicLinkPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [status, setStatus] = useState<
    'idle' | 'acquiring' | 'verifying' | 'redirecting' | 'error'
  >('idle');
  const [progress, setProgress] = useState<GpsLockProgress | null>(null);
  const [reading, setReading] = useState<GpsFixReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [strictBlocked, setStrictBlocked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/links/public/${encodeURIComponent(code)}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, data: d })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          setError(data.error || 'Short link unavailable.');
          setStatus('error');
        } else {
          setPolicy(data);
          if (data.hasPassword) {
            window.location.href = `/unlock/${encodeURIComponent(code)}`;
            return;
          }
          if (!data.isActive) {
            setError('This shortened link has been paused by its owner.');
            setStatus('error');
          } else if (data.isExpired) {
            setError('This shortened link has expired.');
            setStatus('error');
          }
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load link verification policy.');
          setStatus('error');
        }
      })
      .finally(() => {
        if (active) setPolicyLoading(false);
      });

    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [code]);

  const handleAcquireAndVerify = async (extendedWindowMs = 9000) => {
    if (!policy || !policy.isActive || policy.isExpired) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('acquiring');
    setError(null);
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
        setError(data?.error || parseErrorMessage || 'GPS verification failed.');
        setStatus('error');
        return;
      }

      setStatus('redirecting');
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to capture high-accuracy GPS position.'
      );
      setStatus('error');
    }
  };

  const targetMeters = policy?.gpsMaxAccuracyMeters ?? 1;

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
        <div className="flex items-center justify-center w-12 h-12 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl mx-auto mb-5">
          <Crosshair className="w-6 h-6" />
        </div>

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

        {/* Live Telemetry Acquisition Readout */}
        {(status === 'acquiring' || status === 'verifying' || status === 'redirecting' || reading) && (
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
                    (reading?.accuracyMeters ?? progress?.bestAccuracyMeters ?? 999) <= targetMeters
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
              onClick={() => handleAcquireAndVerify(strictBlocked ? 15000 : 9000)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium text-sm transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
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
              Your browser prompts for location consent. Standard phone GPS averages 3m–15m
              outdoors; sub-1m accuracy requires RTK / external GNSS hardware.
            </p>
          </div>
        )}

        <div className="mt-7 pt-5 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Protected by LinkPulse Precision Location Gate</span>
        </div>
      </motion.div>
    </div>
  );
}
