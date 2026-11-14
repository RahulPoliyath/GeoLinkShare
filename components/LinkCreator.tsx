'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Shield,
  Clock,
  Sparkles,
  AlertCircle,
  Tag,
  Lock,
  ChevronDown,
  Crosshair,
} from 'lucide-react';
import { authFetch, safeReadApiResponse } from '@/lib/client-auth';

const LINK_CONSTRAINTS = {
  shortCodePattern: /^[a-zA-Z0-9_-]+$/,
  shortCodeMinLength: 3,
  shortCodeMaxLength: 32,
  titleMaxLength: 120,
  tagsMaxCount: 10,
  tagMaxLength: 32,
};

export interface GeneratedLink {
  id: string;
  userId: string;
  originalUrl: string;
  shortCode: string;
  title: string;
  tags: string[];
  isActive: boolean;
  hasPassword?: boolean;
  requireGps?: boolean;
  gpsMaxAccuracyMeters?: number;
  gpsStrictMode?: boolean;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  clicksCount: number;
}

interface LinkCreatorProps {
  userId?: string | null;
  onLinkCreated: (link: GeneratedLink) => void;
  onOpenQr: (url: string, title: string) => void;
}

export function LinkCreator({ userId, onLinkCreated, onOpenQr }: LinkCreatorProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [originalUrl, setOriginalUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [useCustomSlug, setUseCustomSlug] = useState(false);
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [requireGps, setRequireGps] = useState(false);
  const [gpsMaxAccuracyMeters, setGpsMaxAccuracyMeters] = useState<number>(1);
  const [gpsStrictMode, setGpsStrictMode] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<'never' | '1' | '7' | '30'>('never');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<GeneratedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalUrl.trim()) return;

    setLoading(true);
    setError(null);

    let expiresAt: string | undefined = undefined;
    if (expiresInDays !== 'never') {
      const days = parseInt(expiresInDays, 10);
      expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().slice(0, LINK_CONSTRAINTS.tagMaxLength))
      .filter(Boolean)
      .slice(0, LINK_CONSTRAINTS.tagsMaxCount);

    if (useCustomSlug && customSlug.trim()) {
      const slug = customSlug.trim();
      if (
        slug.length < LINK_CONSTRAINTS.shortCodeMinLength ||
        slug.length > LINK_CONSTRAINTS.shortCodeMaxLength ||
        !LINK_CONSTRAINTS.shortCodePattern.test(slug)
      ) {
        setError('Custom alias must be 3-32 characters (letters, numbers, hyphens, underscores).');
        setLoading(false);
        return;
      }
    }

    try {
      const res = await authFetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalUrl: originalUrl.trim(),
          customSlug: useCustomSlug && customSlug.trim() ? customSlug.trim() : undefined,
          title: title.trim() ? title.trim().slice(0, LINK_CONSTRAINTS.titleMaxLength) : undefined,
          tags: tags.length > 0 ? tags : undefined,
          password: hasPassword && password.trim() ? password.trim() : undefined,
          requireGps,
          gpsMaxAccuracyMeters: requireGps ? gpsMaxAccuracyMeters : undefined,
          gpsStrictMode: requireGps ? gpsStrictMode : undefined,
          expiresAt,
        }),
      });

      const { data, parseErrorMessage } = await safeReadApiResponse<{
        success?: boolean;
        error?: string;
        link?: GeneratedLink;
      }>(res);
      if (!res.ok || !data?.success || !data.link) {
        setError(data?.error || parseErrorMessage || 'Failed to shorten link');
        setLoading(false);
        return;
      }

      setCreatedLink(data.link);
      onLinkCreated(data.link);
      setLoading(false);
    } catch {
      setError('Network error while creating shortened URL');
      setLoading(false);
    }
  };

  const shortUrl = createdLink ? `${origin}/r/${createdLink.shortCode}` : '';

  const handleCopy = () => {
    if (!shortUrl) return;
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setCreatedLink(null);
    setOriginalUrl('');
    setCustomSlug('');
    setUseCustomSlug(false);
    setTitle('');
    setTagsInput('');
    setPassword('');
    setHasPassword(false);
    setRequireGps(false);
    setGpsMaxAccuracyMeters(1);
    setGpsStrictMode(false);
    setExpiresInDays('never');
    setError(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        {/* Title & Description */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-xs font-semibold tracking-wide">
              High-Entropy URL Shortener
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Shorten, Protect, and Share Any Link
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 max-w-2xl">
            Generate tamper-proof shortened URLs with real-time click telemetry, country geographic
            intelligence, and automated QR codes.
          </p>
        </div>

        {/* Error notification */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="mb-6 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success View vs Form Input View */}
        <AnimatePresence mode="wait">
          {createdLink ? (
            <motion.div
              key="success-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="p-5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/10 border border-emerald-500/25">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm mb-3">
                  <Check className="w-4 h-4" />
                  <span>Link shortened successfully!</span>
                </div>

                {/* Short URL Box */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 px-4 py-3 bg-white/80 dark:bg-slate-950/70 border border-slate-200/80 dark:border-white/15 rounded-xl font-mono text-sm text-indigo-600 dark:text-indigo-400 font-medium truncate select-all">
                    {shortUrl}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-all active:scale-[0.98] shadow-md shadow-indigo-500/25 whitespace-nowrap"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    <a
                      href={shortUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-white/75 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/15 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
                      title="Test Redirection in New Tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    <button
                      onClick={() => onOpenQr(shortUrl, createdLink.title)}
                      className="p-3 bg-white/75 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/15 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
                      title="View QR Code"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Metadata summary */}
                <div className="mt-4 pt-4 border-t border-emerald-500/20 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                  <span className="truncate max-w-md">
                    <strong className="text-slate-800 dark:text-white">Destination:</strong>{' '}
                    {createdLink.originalUrl}
                  </span>
                  {createdLink.hasPassword && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Passcode Protected</span>
                    </span>
                  )}
                  {createdLink.requireGps && (
                    <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>
                        GPS &le; {(createdLink.gpsMaxAccuracyMeters ?? 1).toFixed(1)}m
                        {createdLink.gpsStrictMode ? ' (Strict)' : ' (Best-Fix Fallback)'}
                      </span>
                    </span>
                  )}
                  {createdLink.expiresAt && (
                    <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Expires {new Date(createdLink.expiresAt).toLocaleDateString()}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  + Shorten Another URL
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="form-view"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {/* Main Long URL Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  Destination Website URL <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={originalUrl}
                    onChange={(e) => setOriginalUrl(e.target.value)}
                    placeholder="https://example.com/very-long-article-or-resource-page?ref=share..."
                    required
                    className="w-full pl-10 pr-4 py-3 bg-white/75 dark:bg-slate-950/60 border border-slate-300/80 dark:border-white/15 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Protected against SSRF, credential phishing (@), and invalid script protocols.
                </p>
              </div>

              {/* Custom Slug or Random */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Short Link Slug
                    </label>
                    <button
                      type="button"
                      onClick={() => setUseCustomSlug(!useCustomSlug)}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                    >
                      {useCustomSlug ? 'Use Random (Default)' : 'Customize Alias'}
                    </button>
                  </div>

                  {useCustomSlug ? (
                    <div className="relative flex items-center">
                      <span className="px-3 py-2.5 bg-slate-100/80 dark:bg-white/5 border border-r-0 border-slate-300/80 dark:border-white/15 rounded-l-xl text-xs font-mono text-slate-500 dark:text-slate-400">
                        /r/
                      </span>
                      <input
                        type="text"
                        value={customSlug}
                        onChange={(e) => setCustomSlug(e.target.value)}
                        placeholder="my-custom-name"
                        className="w-full px-3 py-2.5 bg-white/75 dark:bg-slate-950/60 border border-slate-300/80 dark:border-white/15 rounded-r-xl text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  ) : (
                    <div className="px-3.5 py-2.5 bg-slate-100/70 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>/r/[random-6-chars]</span>
                      <span className="text-[10px] text-slate-400">Collision-Resistant</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Link Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Project Proposal Docs"
                    className="w-full px-3.5 py-2.5 bg-white/75 dark:bg-slate-950/60 border border-slate-300/80 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {/* Advanced Security & Tagging Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>
                    {showAdvanced
                      ? 'Hide Security & Expiration Settings'
                      : 'Advanced Security & Expiration Controls'}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      showAdvanced ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="mt-3 p-4 rounded-2xl bg-white/55 dark:bg-slate-950/55 border border-slate-200/80 dark:border-white/10 space-y-4"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Password Protection */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>Passcode Protection</span>
                            </label>
                            <input
                              type="checkbox"
                              checked={hasPassword}
                              onChange={(e) => setHasPassword(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </div>
                          {hasPassword && (
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Set link passcode"
                              className="w-full px-3 py-1.5 bg-white/80 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                            />
                          )}
                        </div>

                        {/* Expiration Timer */}
                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span>Link Lifespan</span>
                          </label>
                          <select
                            value={expiresInDays}
                            onChange={(e) =>
                              setExpiresInDays(e.target.value as 'never' | '1' | '7' | '30')
                            }
                            className="w-full px-3 py-1.5 bg-white/80 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          >
                            <option
                              value="never"
                              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            >
                              Never Expire (Permanent)
                            </option>
                            <option
                              value="1"
                              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            >
                              Expire in 24 Hours
                            </option>
                            <option
                              value="7"
                              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            >
                              Expire in 7 Days
                            </option>
                            <option
                              value="30"
                              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            >
                              Expire in 30 Days
                            </option>
                          </select>
                        </div>
                      </div>

                      {/* Precision GPS Verification (1m Target) */}
                      <div className="pt-2 border-t border-slate-200/70 dark:border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <Crosshair className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Require High-Accuracy GPS Verification (1m Target)</span>
                          </label>
                          <input
                            type="checkbox"
                            checked={requireGps}
                            onChange={(e) => setRequireGps(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </div>

                        {requireGps && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                Target Accuracy Radius
                              </label>
                              <select
                                value={String(gpsMaxAccuracyMeters)}
                                onChange={(e) => setGpsMaxAccuracyMeters(Number(e.target.value))}
                                className="w-full px-3 py-1.5 bg-white/80 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                              >
                                <option value="1" className="bg-white dark:bg-slate-900">
                                  1.0 m (RTK / Max GNSS Precision)
                                </option>
                                <option value="3" className="bg-white dark:bg-slate-900">
                                  3.0 m (Dual-Band Mobile GNSS)
                                </option>
                                <option value="5" className="bg-white dark:bg-slate-900">
                                  5.0 m (Outdoor Standard)
                                </option>
                                <option value="15" className="bg-white dark:bg-slate-900">
                                  15.0 m (Fast Consumer Lock)
                                </option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                Enforcement Policy
                              </label>
                              <select
                                value={gpsStrictMode ? 'strict' : 'best-available'}
                                onChange={(e) => setGpsStrictMode(e.target.value === 'strict')}
                                className="w-full px-3 py-1.5 bg-white/80 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                              >
                                <option value="best-available" className="bg-white dark:bg-slate-900">
                                  Target {gpsMaxAccuracyMeters}m + Best-Available Fallback
                                </option>
                                <option value="strict" className="bg-white dark:bg-slate-900">
                                  Strict &le; {gpsMaxAccuracyMeters}m Gate (Block coarser fixes)
                                </option>
                              </select>
                            </div>

                            <p className="sm:col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
                              Visitors grant explicit browser location permission. Multi-sample live GNSS locking always logs exact device-reported accuracy without spoofing; consumer phones typically reach 3m–15m outdoors while &le; 1m requires RTK hardware.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Tags */}
                      <div>
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-1.5">
                          <Tag className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Categorization Tags (comma separated)</span>
                        </label>
                        <input
                          type="text"
                          value={tagsInput}
                          onChange={(e) => setTagsInput(e.target.value)}
                          placeholder="e.g. social, campaign, dev, secret"
                          className="w-full px-3 py-1.5 bg-white/80 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action Bar */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0 max-w-full">
                  {userId ? (
                    <>
                      <span className="shrink-0">User ID:</span>
                      <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate max-w-[230px] sm:max-w-[290px]">
                        {userId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(userId);
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 1800);
                        }}
                        className="p-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 shrink-0"
                        title="Copy User ID"
                      >
                        {copiedId ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  ) : (
                    <span>Saved locally in browser · No login required</span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {loading ? 'Creating Short Link...' : 'Shorten URL & Track'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
