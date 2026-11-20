'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Globe2,
  TrendingUp,
  RotateCw,
  Smartphone,
  Monitor,
  Tablet,
  Compass,
  ArrowUpRight,
  Filter,
  Crosshair,
  Copy,
  Check,
  Satellite,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { formatNumber, getRelativeTime, getCountryFlag } from '@/lib/utils';
import { AnimatedNumber, LiveWaveformBars, SpotlightCard } from './MotionPrimitives';
import { GeneratedLink } from './LinkCreator';
import {
  authFetch,
  getOrInitAnonymousUserId,
  loadAnalyticsFromLocalStorage,
  saveAnalyticsToLocalStorage,
} from '@/lib/client-auth';
import {
  acquireHighAccuracyGps,
  GpsFixReading,
  GpsLockProgress,
} from '@/lib/gps-client';
import { ClickLocationsMap, MapClickLocation } from './ClickLocationsMap';

export interface GpsClickTelemetry {
  id: string;
  linkId: string;
  shortCode: string;
  timestamp: string;
  countryCode: string;
  countryName: string;
  city: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  altitudeMeters?: number | null;
  gpsSamplesCount?: number;
  gpsTargetMeters?: number;
  gpsTargetMet?: boolean;
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet';
}

export interface AnalyticsData {
  totalClicks: number;
  uniqueVisitors: number;
  totalLinks: number;
  activeLinks: number;
  clicksOverTime: { date: string; label: string; clicks: number }[];
  geographic: { code: string; name: string; count: number; percentage: number }[];
  referrers: { label: string; count: number; category: string; percentage: number }[];
  categories: { direct: number; search: number; social: number; website: number };
  devices: { desktop: number; mobile: number; tablet: number };
  browsers: Record<string, number>;
  recentClicks: {
    id: string;
    linkId: string;
    shortCode: string;
    timestamp: string;
    ip: string;
    countryCode: string;
    countryName: string;
    city: string;
    region?: string | null;
    referrer: string;
    referrerCategory: string;
    browser: string;
    os: string;
    device: 'desktop' | 'mobile' | 'tablet';
    geoSource?: 'ip' | 'gps';
    latitude?: number | null;
    longitude?: number | null;
    accuracyMeters?: number | null;
  }[];
  mapLocations?: MapClickLocation[];
  gpsSummary?: {
    gpsClicksCount: number;
    sub1mCount: number;
    targetMetCount: number;
    bestAccuracyMeters: number | null;
    medianAccuracyMeters: number | null;
    recentGpsClicks: GpsClickTelemetry[];
  };
}

interface AnalyticsDashboardProps {
  links: GeneratedLink[];
  onOpenQr?: (url: string, title: string) => void;
}

export function AnalyticsDashboard({ links }: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string>('all');
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [hoveredDay, setHoveredDay] = useState<{ label: string; clicks: number } | null>(null);
  const [copiedCoordId, setCopiedCoordId] = useState<string | null>(null);
  const [selectedMapClickId, setSelectedMapClickId] = useState<string | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);
  const [gnssTesting, setGnssTesting] = useState(false);
  const [gnssProgress, setGnssProgress] = useState<GpsLockProgress | null>(null);
  const [gnssResult, setGnssResult] = useState<GpsFixReading | null>(null);
  const [gnssError, setGnssError] = useState<string | null>(null);

  const [anonymousUserId, setAnonymousUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      await Promise.resolve();
      if (!isMounted) return;

      const uid = getOrInitAnonymousUserId();
      if (uid) setAnonymousUserId(uid);

      const cached = loadAnalyticsFromLocalStorage<AnalyticsData>(uid, selectedLinkId);
      if (cached) {
        setData(cached);
        setLoading(false);
      }

      try {
        const url =
          selectedLinkId && selectedLinkId !== 'all'
            ? `/api/analytics?linkId=${selectedLinkId}`
            : '/api/analytics';
        const res = await authFetch(url);
        const json = await res.json();
        const activeUid = json.workspaceId || uid;
        if (isMounted && activeUid && activeUid !== uid) {
          setAnonymousUserId(activeUid);
        }
        if (isMounted && json.success && json.data) {
          setData(json.data);
          saveAnalyticsToLocalStorage(activeUid, selectedLinkId, json.data);
          setLastRefreshed(new Date().toLocaleTimeString());
        }
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [selectedLinkId]);

  // Real-time polling when isLive is enabled
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(async () => {
      try {
        const url =
          selectedLinkId && selectedLinkId !== 'all'
            ? `/api/analytics?linkId=${selectedLinkId}`
            : '/api/analytics';
        const res = await authFetch(url);
        const json = await res.json();
        if (json.success && json.data) {
          const activeUid = json.workspaceId || getOrInitAnonymousUserId();
          setData(json.data);
          saveAnalyticsToLocalStorage(activeUid, selectedLinkId, json.data);
          setLastRefreshed(new Date().toLocaleTimeString());
        }
      } catch (err) {
        console.error('Failed to poll analytics:', err);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [isLive, selectedLinkId]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      const url =
        selectedLinkId && selectedLinkId !== 'all'
          ? `/api/analytics?linkId=${selectedLinkId}`
          : '/api/analytics';
      const res = await authFetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        const activeUid = json.workspaceId || getOrInitAnonymousUserId();
        setData(json.data);
        saveAnalyticsToLocalStorage(activeUid, selectedLinkId, json.data);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Manual refresh error:', err);
    } finally {
      setTimeout(() => setRefreshing(false), 320);
    }
  };

  const handleCopyCoords = (id: string, lat: number, lng: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(7)}, ${lng.toFixed(7)}`);
    setCopiedCoordId(id);
    setTimeout(() => setCopiedCoordId(null), 1800);
  };

  const handleFocusLocationOnMap = (clickId: string) => {
    setSelectedMapClickId(clickId);
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRunGnssTest = async () => {
    setGnssTesting(true);
    setGnssError(null);
    setGnssResult(null);
    setGnssProgress({
      samplesCount: 0,
      bestAccuracyMeters: null,
      latestAccuracyMeters: null,
      latitude: null,
      longitude: null,
      elapsedMs: 0,
      targetMet: false,
    });
    try {
      const fix = await acquireHighAccuracyGps({
        targetAccuracyMeters: 1,
        maxWaitMs: 9000,
        onProgress: (p) => setGnssProgress(p),
      });
      setGnssResult(fix);
    } catch (err) {
      setGnssError(
        err instanceof Error ? err.message : 'Unable to lock browser GPS position.'
      );
    } finally {
      setGnssTesting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="w-full max-w-7xl mx-auto py-12 px-4">
        <div className="flex flex-col items-center justify-center p-12 glass-surface border border-slate-200/80 dark:border-white/15 rounded-3xl">
          <RotateCw className="w-6 h-6 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
            Connecting to real-time analytics telemetry...
          </p>
        </div>
      </div>
    );
  }

  const analytics = data || {
    totalClicks: 0,
    uniqueVisitors: 0,
    totalLinks: 0,
    activeLinks: 0,
    clicksOverTime: [],
    geographic: [],
    referrers: [],
    categories: { direct: 0, search: 0, social: 0, website: 0 },
    devices: { desktop: 0, mobile: 0, tablet: 0 },
    browsers: {},
    recentClicks: [],
  };

  const maxDayClicks = Math.max(...analytics.clicksOverTime.map((d) => d.clicks), 1);
  const totalDeviceClicks =
    (analytics.devices.desktop || 0) +
      (analytics.devices.mobile || 0) +
      (analytics.devices.tablet || 0) || 1;

  const topCountry = analytics.geographic[0];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Traffic & Performance Telemetry
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Status:</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">
                {isLive ? 'Streaming Live' : 'Paused'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Refreshed:</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200 tabular-nums">
                {lastRefreshed || 'Just now'}
              </span>
              {anonymousUserId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 truncate max-w-[230px]">
                    {anonymousUserId}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Filter & Live Switch */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/75 dark:bg-slate-950/60 border border-slate-200/80 dark:border-white/15 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedLinkId}
              onChange={(e) => setSelectedLinkId(e.target.value)}
              className="bg-transparent text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
            >
              <option
                value="all"
                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                All Links (Aggregate)
              </option>
              {links.map((lnk) => (
                <option
                  key={lnk.id}
                  value={lnk.id}
                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  /r/{lnk.shortCode} - {lnk.title}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all active:scale-95 whitespace-nowrap ${
              isLive
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-white/70 dark:bg-white/5 border-slate-200/80 dark:border-white/15 text-slate-600 dark:text-slate-400'
            }`}
          >
            <LiveWaveformBars active={isLive} />
            <span>{isLive ? 'Live Stream Active' : 'Stream Paused'}</span>
          </button>

          <button
            onClick={handleManualRefresh}
            className="p-2 rounded-xl border border-slate-200/80 dark:border-white/15 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-all active:scale-95"
            title="Manual Refresh"
          >
            <RotateCw className={`w-4 h-4 transition-transform duration-300 ${refreshing ? 'rotate-180 text-indigo-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI 4-Card Strip with Spotlight & Animated Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SpotlightCard
          delay={0.02}
          spotlightColor="rgba(99, 102, 241, 0.16)"
          className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 hover:border-indigo-500/35 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Total Clicks</span>
            <TrendingUp className="w-4 h-4 text-indigo-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
            <AnimatedNumber value={analytics.totalClicks} formatter={formatNumber} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Across all tracked redirects
          </p>
        </SpotlightCard>

        <SpotlightCard
          delay={0.07}
          spotlightColor="rgba(16, 185, 129, 0.15)"
          className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 hover:border-emerald-500/35 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Unique Visitors</span>
            <Compass className="w-4 h-4 text-emerald-500 transition-transform duration-200 group-hover:rotate-45" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
            <AnimatedNumber value={analytics.uniqueVisitors} formatter={formatNumber} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Masked client IP hash
          </p>
        </SpotlightCard>

        <SpotlightCard
          delay={0.12}
          spotlightColor="rgba(14, 165, 233, 0.16)"
          className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 hover:border-sky-500/35 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Active Shortcuts</span>
            <ArrowUpRight className="w-4 h-4 text-sky-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
            <AnimatedNumber value={analytics.activeLinks} formatter={formatNumber} />{' '}
            <span className="text-xs font-normal text-slate-400">/ {analytics.totalLinks}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Currently accepting traffic
          </p>
        </SpotlightCard>

        <SpotlightCard
          delay={0.17}
          spotlightColor="rgba(99, 102, 241, 0.15)"
          className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 hover:border-indigo-400/35 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Top Geographic Market</span>
            <Globe2 className="w-4 h-4 text-indigo-400 transition-transform duration-200 group-hover:rotate-12" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{topCountry ? getCountryFlag(topCountry.code) : '🌐'}</span>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
              {topCountry ? topCountry.name : 'No data yet'}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {topCountry ? `${topCountry.percentage}% of overall clicks` : 'Awaiting traffic'}
          </p>
        </SpotlightCard>
      </div>

      {/* Main Grid: Clicks Over Time & Traffic Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Performance Chart */}
        <div className="lg:col-span-2 glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6 gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Clicks Velocity (Past 7 Days)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hover or focus a bar to inspect exact daily throughput
              </p>
            </div>
            <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 tabular-nums whitespace-nowrap">
              {hoveredDay
                ? `${hoveredDay.label}: ${hoveredDay.clicks} clicks`
                : `Peak: ${maxDayClicks} clicks/day`}
            </span>
          </div>

          <div className="relative h-56 w-full flex items-end gap-2 sm:gap-4 pt-6 pb-2 border-b border-slate-200/70 dark:border-white/10">
            {/* Subtle horizontal telemetry grid lines */}
            <div aria-hidden="true" className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none">
              <div className="border-t border-dashed border-slate-200/60 dark:border-white/[0.07]" />
              <div className="border-t border-dashed border-slate-200/60 dark:border-white/[0.07]" />
              <div className="border-t border-dashed border-slate-200/60 dark:border-white/[0.07]" />
            </div>

            {analytics.clicksOverTime.map((day, idx) => {
              const heightPercent = Math.max(Math.round((day.clicks / maxDayClicks) * 100), 6);
              const isSelected = hoveredDay?.label === day.label;
              return (
                <button
                  key={day.date}
                  type="button"
                  onMouseEnter={() => setHoveredDay({ label: day.label, clicks: day.clicks })}
                  onMouseLeave={() => setHoveredDay(null)}
                  onFocus={() => setHoveredDay({ label: day.label, clicks: day.clicks })}
                  onBlur={() => setHoveredDay(null)}
                  className="relative z-10 flex-1 flex flex-col items-center gap-2 group h-full justify-end focus:outline-none"
                >
                  <motion.span
                    animate={{
                      opacity: isSelected ? 1 : 0,
                      y: isSelected ? -2 : 4,
                    }}
                    transition={{ duration: 0.14 }}
                    className="text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm pointer-events-none"
                  >
                    {day.clicks}
                  </motion.span>
                  <div className="w-full max-w-[48px] flex-1 flex items-end">
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{
                        duration: 0.5,
                        delay: idx * 0.045,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full origin-bottom rounded-t-lg transition-colors duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-t from-indigo-600 to-cyan-400 shadow-lg shadow-cyan-500/25'
                          : 'bg-gradient-to-t from-indigo-600/85 to-indigo-400/85 dark:from-indigo-500/80 dark:to-sky-400/80 group-hover:from-indigo-500 group-hover:to-cyan-400'
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[11px] whitespace-nowrap mt-1 font-mono transition-colors ${
                      isSelected
                        ? 'text-indigo-600 dark:text-cyan-400 font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {day.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Traffic Sources Category Breakdown */}
        <div className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              Traffic Acquisition Channels
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Distribution of inbound redirect requests
            </p>

            <div className="space-y-4">
              {[
                { label: 'Direct / Bookmarks', count: analytics.categories.direct, color: 'bg-indigo-500' },
                { label: 'Social Networks', count: analytics.categories.social, color: 'bg-sky-500' },
                { label: 'Search Engines', count: analytics.categories.search, color: 'bg-emerald-500' },
                { label: 'External Websites', count: analytics.categories.website, color: 'bg-amber-500' },
              ].map((cat, idx) => {
                const pct =
                  analytics.totalClicks > 0
                    ? Math.round((cat.count / analytics.totalClicks) * 100)
                    : 0;
                return (
                  <div key={cat.label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-700 dark:text-slate-200 font-medium">
                        {cat.label}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {cat.count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200/70 dark:bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: 0.55,
                          delay: idx * 0.06,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className={`h-full origin-left ${cat.color} rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Device Breakdown */}
          <div className="mt-6 pt-5 border-t border-slate-200/70 dark:border-white/10">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-3">
              Client Hardware Profile
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 text-center">
                <Monitor className="w-4 h-4 mx-auto mb-1 text-slate-500 dark:text-slate-400" />
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                  {Math.round(((analytics.devices.desktop || 0) / totalDeviceClicks) * 100)}%
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Desktop</div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 text-center">
                <Smartphone className="w-4 h-4 mx-auto mb-1 text-slate-500 dark:text-slate-400" />
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                  {Math.round(((analytics.devices.mobile || 0) / totalDeviceClicks) * 100)}%
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Mobile</div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 text-center">
                <Tablet className="w-4 h-4 mx-auto mb-1 text-slate-500 dark:text-slate-400" />
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                  {Math.round(((analytics.devices.tablet || 0) / totalDeviceClicks) * 100)}%
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Tablet</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Geographic Intelligence & Interactive Visitor Map */}
      <div
        ref={mapSectionRef}
        className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-1">
              <MapPin className="w-4 h-4" />
              <span>Geographic Ingress &amp; Visitor Map</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Interactive Click Location Map
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click any pin on the map or select a visitor below to inspect exact coordinates,
              city/region, device, and network telemetry.
            </p>
          </div>
          <span className="inline-block px-3 py-1 bg-slate-100/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-mono text-slate-700 dark:text-slate-200 tabular-nums self-start sm:self-auto whitespace-nowrap">
            {analytics.geographic.length} Countries · {(analytics.mapLocations || []).length} Pins
          </span>
        </div>

        <ClickLocationsMap
          locations={analytics.mapLocations || []}
          selectedLocationId={selectedMapClickId}
          onSelectLocation={(id) => setSelectedMapClickId(id)}
        />

        <div className="pt-4 border-t border-slate-200/70 dark:border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            {analytics.geographic.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 col-span-2">
                No geographic telemetry recorded yet.
              </p>
            ) : (
              analytics.geographic.map((geo, idx) => (
                <div
                  key={geo.code}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-indigo-500/[0.05] dark:hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getCountryFlag(geo.code)}</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        {geo.name}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        ISO: {geo.code}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-24 hidden sm:block h-1.5 bg-slate-200/80 dark:bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: 0.5,
                          delay: Math.min(idx * 0.04, 0.24),
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="h-full origin-left bg-gradient-to-r from-indigo-600 to-sky-400 rounded-full"
                        style={{ width: `${geo.percentage}%` }}
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatNumber(geo.count)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {geo.percentage}%
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* High-Accuracy GPS Telemetry & 1m Diagnostic Workbench */}
      <div className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-1">
              <Crosshair className="w-4 h-4" />
              <span>Opt-In GNSS Precision Telemetry (1m Target)</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Verified GPS Coordinates &amp; Measured Accuracy Radius
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Captures live multi-sample GNSS fixes rounded to 7 decimals (~1.1cm) with authentic sensor radius in meters.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunGnssTest}
            disabled={gnssTesting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-indigo-500/20 disabled:opacity-60 self-start sm:self-auto whitespace-nowrap"
          >
            {gnssTesting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Locking GNSS ({gnssProgress?.samplesCount ?? 0} samples)...</span>
              </>
            ) : (
              <>
                <Satellite className="w-3.5 h-3.5" />
                <span>Test Device GPS Precision</span>
              </>
            )}
          </button>
        </div>

        {/* Live GNSS Diagnostic Result */}
        {(gnssTesting || gnssResult || gnssError) && (
          <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-slate-200/80 dark:border-white/10 text-xs space-y-2">
            {gnssError ? (
              <p className="text-red-600 dark:text-red-400">{gnssError}</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-mono tabular-nums space-y-0.5">
                  <div className="text-slate-900 dark:text-white font-semibold">
                    {gnssResult
                      ? `${gnssResult.latitude.toFixed(7)}, ${gnssResult.longitude.toFixed(7)}`
                      : gnssProgress?.latitude != null && gnssProgress?.longitude != null
                        ? `${gnssProgress.latitude.toFixed(7)}, ${gnssProgress.longitude.toFixed(7)}`
                        : 'Acquiring satellite fix...'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Samples: {gnssResult?.samplesCount ?? gnssProgress?.samplesCount ?? 0}
                    {gnssResult?.altitudeMeters != null
                      ? ` · Alt: ${gnssResult.altitudeMeters.toFixed(1)}m`
                      : ''}
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                      (gnssResult?.accuracyMeters ?? gnssProgress?.bestAccuracyMeters ?? 999) <= 1.0
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    Measured Radius:{' '}
                    {gnssResult
                      ? `±${gnssResult.accuracyMeters.toFixed(2)} m`
                      : gnssProgress?.bestAccuracyMeters != null
                        ? `±${gnssProgress.bestAccuracyMeters.toFixed(2)} m`
                        : '—'}
                  </span>
                  {gnssResult && !gnssResult.targetMet && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      (&gt; 1.00m RTK threshold on this device)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* GPS Summary Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">GPS-Verified Clicks</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              <AnimatedNumber value={analytics.gpsSummary?.gpsClicksCount ?? 0} formatter={formatNumber} />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Sub-1m Locks (&le;1m)</div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              <AnimatedNumber value={analytics.gpsSummary?.sub1mCount ?? 0} formatter={formatNumber} />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Tightest Radius</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {analytics.gpsSummary?.bestAccuracyMeters != null
                ? `±${analytics.gpsSummary.bestAccuracyMeters.toFixed(2)}m`
                : '—'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Median Radius</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {analytics.gpsSummary?.medianAccuracyMeters != null
                ? `±${analytics.gpsSummary.medianAccuracyMeters.toFixed(2)}m`
                : '—'}
            </div>
          </div>
        </div>

        {/* Captured Coordinates Log */}
        {analytics.gpsSummary && analytics.gpsSummary.recentGpsClicks.length > 0 ? (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {analytics.gpsSummary.recentGpsClicks.map((gClick) => (
              <div
                key={gClick.id}
                className="p-3 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      /r/{gClick.shortCode}
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-100 tabular-nums">
                      {gClick.latitude.toFixed(7)}, {gClick.longitude.toFixed(7)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCoords(gClick.id, gClick.latitude, gClick.longitude)}
                      className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
                      title="Copy Coordinates"
                    >
                      {copiedCoordId === gClick.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {gClick.city}, {gClick.countryName} · {gClick.device} ({gClick.browser} /{' '}
                    {gClick.os}) · {gClick.gpsSamplesCount ?? 1} GNSS samples
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                  <button
                    type="button"
                    onClick={() => handleFocusLocationOnMap(gClick.id)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[11px] font-sans font-medium transition-colors"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Show on Map</span>
                  </button>
                  <span
                    className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${
                      gClick.accuracyMeters <= 1.0
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-200/70 dark:bg-white/10 border-slate-300/70 dark:border-white/15 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    ±{gClick.accuracyMeters.toFixed(2)}m
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {getRelativeTime(gClick.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No GPS-verified clicks captured yet. Enable &ldquo;Require High-Accuracy GPS Verification&rdquo; under Advanced Settings when creating a link.
          </p>
        )}
      </div>

      {/* Inbound Referrers & Real-Time Event Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Top Referral Sources
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Websites, social networks, and apps driving audience visits
          </p>

          <div className="divide-y divide-slate-200/60 dark:divide-white/10">
            {analytics.referrers.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                No referrers logged yet.
              </p>
            ) : (
              analytics.referrers.map((ref) => (
                <div key={ref.label} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate max-w-[280px]">
                    <span className="text-slate-400">↳</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                      {ref.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {ref.count}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 w-9 text-right tabular-nums">
                      {ref.percentage}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Real-Time Live Activity Stream */}
        <div className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Real-Time Click Stream
            </h3>
            {isLive && (
              <span className="inline-flex items-center gap-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                <LiveWaveformBars active={isLive} />
                <span>Live Feed</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Chronological log of verified redirect events
          </p>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {analytics.recentClicks.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                No click telemetry logged yet.
              </p>
            ) : (
              <AnimatePresence initial={false}>
                {analytics.recentClicks.slice(0, 10).map((click, idx) => {
                  const hasCoords =
                    typeof click.latitude === 'number' && typeof click.longitude === 'number';
                  const isGps = click.geoSource === 'gps';
                  const coordDecimals = isGps ? 7 : 4;

                  return (
                    <motion.button
                      key={click.id}
                      type="button"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(idx * 0.025, 0.18),
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      onClick={() => handleFocusLocationOnMap(click.id)}
                      className="group w-full text-left p-3 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10 flex items-center justify-between text-xs hover:border-indigo-500/35 hover:bg-indigo-500/[0.04] dark:hover:bg-white/[0.06] transition-all"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span>{getCountryFlag(click.countryCode)}</span>
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">
                              /r/{click.shortCode}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-slate-700 dark:text-slate-200 font-medium truncate">
                              {click.city}
                              {click.region ? `, ${click.region}` : ''}, {click.countryName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            via {click.referrer} ({click.device} · {click.browser})
                          </div>
                          {hasCoords && (
                            <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 truncate">
                              {click.latitude!.toFixed(coordDecimals)},{' '}
                              {click.longitude!.toFixed(coordDecimals)}{' '}
                              <span
                                className={
                                  isGps
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-sky-600 dark:text-sky-400'
                                }
                              >
                                {isGps && click.accuracyMeters != null
                                  ? `(GPS ±${click.accuracyMeters.toFixed(1)}m)`
                                  : '(IP City)'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-2 flex items-center gap-2">
                        <div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            {getRelativeTime(click.timestamp)}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                            {click.ip}
                          </div>
                        </div>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
