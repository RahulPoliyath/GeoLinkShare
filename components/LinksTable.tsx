'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Trash2,
  Lock,
  Pause,
  Play,
  Search,
  BarChart2,
  AlertCircle,
  Crosshair,
} from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';
import { GeneratedLink } from './LinkCreator';
import { authFetch, safeReadApiResponse } from '@/lib/client-auth';

interface LinksTableProps {
  links: GeneratedLink[];
  onOpenQr: (url: string, title: string) => void;
  onLinkDeleted: (id: string) => void;
  onLinkUpdated: (link: GeneratedLink) => void;
  onSelectLinkForAnalytics: (linkId: string) => void;
}

export function LinksTable({
  links,
  onOpenQr,
  onLinkDeleted,
  onLinkUpdated,
  onSelectLinkForAnalytics,
}: LinksTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopy = (id: string, shortCode: string) => {
    const url = `${origin}/r/${shortCode}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleActive = async (link: GeneratedLink) => {
    setActionError(null);
    try {
      const res = await authFetch(`/api/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !link.isActive }),
      });
      const { data, parseErrorMessage } = await safeReadApiResponse<{
        success?: boolean;
        error?: string;
        link?: GeneratedLink;
      }>(res);
      if (res.ok && data?.success && data.link) {
        onLinkUpdated(data.link);
      } else {
        setActionError(data?.error || parseErrorMessage || 'Failed to update link status');
      }
    } catch {
      setActionError('Network error while updating link status');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    setActionError(null);
    try {
      const res = await authFetch(`/api/links/${id}`, {
        method: 'DELETE',
      });
      const { data, parseErrorMessage } = await safeReadApiResponse<{
        success?: boolean;
        error?: string;
      }>(res);
      if (res.ok && data?.success) {
        onLinkDeleted(id);
      } else {
        setActionError(data?.error || parseErrorMessage || 'Failed to delete link');
      }
    } catch {
      setActionError('Network error while deleting link');
    }
  };

  const filteredLinks = links.filter((lnk) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      lnk.shortCode.toLowerCase().includes(q) ||
      lnk.title.toLowerCase().includes(q) ||
      lnk.originalUrl.toLowerCase().includes(q) ||
      lnk.tags.some((t) => t.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (statusFilter === 'active' && !lnk.isActive) return false;
    if (statusFilter === 'paused' && lnk.isActive) return false;

    return true;
  });

  const filterTabs = [
    { id: 'all', label: `All (${links.length})` },
    { id: 'active', label: `Active (${links.filter((l) => l.isActive).length})` },
    { id: 'paused', label: `Paused (${links.filter((l) => !l.isActive).length})` },
  ] as const;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Search and Filters Glass Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-4">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by title, short code, destination URL, or tag..."
            className="w-full pl-9 pr-3 py-2 bg-white/75 dark:bg-slate-950/60 border border-slate-300/80 dark:border-white/15 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
        </div>

        {/* Status Segmented Buttons with spring pill */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 rounded-xl">
          {filterTabs.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`relative z-10 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="links-status-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-0 -z-10 rounded-lg bg-white dark:bg-slate-800/90 shadow-xs border border-slate-200/60 dark:border-white/10"
                  />
                )}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Glass Table Container */}
      <div className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl overflow-hidden">
        {filteredLinks.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              No shortened links found
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {searchTerm
                ? 'Try adjusting your search criteria.'
                : 'Create your first shortened link to get started!'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.03] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Shortened URL</th>
                  <th className="py-3 px-4">Original Destination</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Total Clicks</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-white/10 text-xs">
                {filteredLinks.map((link) => {
                  const shortUrl = `${origin}/r/${link.shortCode}`;
                  return (
                    <tr
                      key={link.id}
                      className="hover:bg-indigo-500/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                    >
                      {/* Short Link & Title */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                            /r/{link.shortCode}
                          </span>
                          {link.hasPassword && (
                            <span title="Passcode Protected" className="text-amber-500">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {link.requireGps && (
                            <span
                              title={`Precision GPS <= ${link.gpsMaxAccuracyMeters ?? 1}m${
                                link.gpsStrictMode ? ' (Strict)' : ''
                              }`}
                              className="text-indigo-500 dark:text-indigo-400"
                            >
                              <Crosshair className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 mt-0.5 truncate max-w-[200px]">
                          {link.title}
                        </div>
                        {link.tags && link.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                            {link.tags.map((tag, i) => (
                              <React.Fragment key={tag}>
                                {i > 0 && <span aria-hidden="true">·</span>}
                                <span>#{tag}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Original URL */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="truncate text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                          {link.originalUrl}
                        </div>
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono tabular-nums text-[11px]">
                        {formatDate(link.createdAt)}
                      </td>

                      {/* Total Clicks */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-sm tabular-nums">
                          {formatNumber(link.clicksCount)}
                        </span>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleActive(link)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all active:scale-95 whitespace-nowrap ${
                            link.isActive
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25'
                              : 'bg-slate-200/70 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-white/10'
                          }`}
                          title={link.isActive ? 'Click to Pause' : 'Click to Activate'}
                        >
                          {link.isActive ? (
                            <>
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <Pause className="w-2.5 h-2.5 fill-current" />
                              <span>Paused</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleCopy(link.id, link.shortCode)}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="Copy Short URL"
                          >
                            {copiedId === link.id ? (
                              <Check className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>

                          <a
                            href={shortUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="Test Redirection"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>

                          <button
                            onClick={() => onOpenQr(shortUrl, link.title)}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="Generate QR Code"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => onSelectLinkForAnalytics(link.id)}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="View Link Analytics"
                          >
                            <BarChart2 className="w-4 h-4" />
                          </button>

                          {confirmDeleteId === link.id ? (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => handleDelete(link.id)}
                                className="px-2 py-1 text-[11px] font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors whitespace-nowrap"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-[11px] font-medium bg-white/80 dark:bg-white/10 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-lg transition-colors whitespace-nowrap"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(link.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Delete Shortened Link"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
