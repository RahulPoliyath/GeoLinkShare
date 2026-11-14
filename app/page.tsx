'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Link2,
  BarChart3,
  Globe2,
  Lock,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { LinkCreator, GeneratedLink } from '@/components/LinkCreator';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { LinksTable } from '@/components/LinksTable';
import { QrModal } from '@/components/QrModal';
import { SecuritySection } from '@/components/SecuritySection';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import {
  authFetch,
  getOrInitAnonymousUserId,
  loadLinksFromLocalStorage,
  saveLinksToLocalStorage,
  safeReadApiResponse,
} from '@/lib/client-auth';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'shorten' | 'dashboard' | 'analytics' | 'security'>('shorten');
  const [anonymousUserId, setAnonymousUserId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState(false);
  const [links, setLinks] = useState<GeneratedLink[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);

  const [qrModalData, setQrModalData] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: '',
  });

  useEffect(() => {
    let isMounted = true;

    const loadWorkspace = async () => {
      await Promise.resolve();
      if (!isMounted) return;

      const uid = getOrInitAnonymousUserId();
      const cached = loadLinksFromLocalStorage<GeneratedLink>(uid);

      if (uid) {
        setAnonymousUserId(uid);
      }
      if (cached.length > 0) {
        setLinks(cached);
        setLinksLoaded(true);
      }

      try {
        const res = await authFetch('/api/links');
        const { data } = await safeReadApiResponse<{
          links?: GeneratedLink[];
          workspaceId?: string;
        }>(res);
        if (!isMounted) return;

        const resolvedUid = data?.workspaceId || uid;
        if (resolvedUid && resolvedUid !== uid) {
          setAnonymousUserId(resolvedUid);
        }
        if (res.ok && Array.isArray(data?.links)) {
          if (data.links.length > 0 || cached.length === 0) {
            setLinks(data.links);
            saveLinksToLocalStorage(resolvedUid, data.links);
          }
        }
      } catch (err) {
        console.error('Error fetching links:', err);
      } finally {
        if (isMounted) setLinksLoaded(true);
      }
    };

    loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLinkCreated = (newLink: GeneratedLink) => {
    setLinks((prev) => {
      const next = [newLink, ...prev];
      saveLinksToLocalStorage(anonymousUserId || getOrInitAnonymousUserId(), next);
      return next;
    });
  };

  const handleLinkDeleted = (id: string) => {
    setLinks((prev) => {
      const next = prev.filter((l) => l.id !== id);
      saveLinksToLocalStorage(anonymousUserId || getOrInitAnonymousUserId(), next);
      return next;
    });
  };

  const handleLinkUpdated = (updatedLink: GeneratedLink) => {
    setLinks((prev) => {
      const next = prev.map((l) => (l.id === updatedLink.id ? updatedLink : l));
      saveLinksToLocalStorage(anonymousUserId || getOrInitAnonymousUserId(), next);
      return next;
    });
  };

  const handleCopyUserId = () => {
    if (!anonymousUserId) return;
    navigator.clipboard.writeText(anonymousUserId);
    setCopiedUserId(true);
    setTimeout(() => setCopiedUserId(false), 1800);
  };

  const handleOpenQr = (url: string, title: string) => {
    setQrModalData({
      isOpen: true,
      url,
      title,
    });
  };

  const handleSelectLinkForAnalytics = (_linkId: string) => {
    setActiveTab('analytics');
  };

  return (
    <div className="min-h-screen flex flex-col relative text-slate-900 dark:text-slate-100">
      <AmbientBackdrop />

      {/* Top Bar Navigation */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        <AnimatePresence mode="wait">
          {activeTab === 'shorten' && (
            <motion.div
              key="tab-shorten"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-12"
            >
              {/* Hero Section */}
              <section className="text-center pt-4 pb-2 max-w-3xl mx-auto space-y-4">
                <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Real-Time Analytics</span>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span>Hardened Link Protection</span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance leading-tight">
                  Shorten Any Website Link with Real-Time Geographic Intelligence
                </h1>

                <p className="text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                  Create secure, collision-resistant shortened URLs in seconds with zero sign-up.
                  Track incoming traffic sources, country locations, devices, and precision GNSS
                  telemetry instantly.
                </p>
              </section>

              {/* Core Shortening Engine */}
              <LinkCreator
                userId={anonymousUserId}
                onLinkCreated={handleLinkCreated}
                onOpenQr={handleOpenQr}
              />

              {/* Interactive Feature Glass Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                <motion.div
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="p-6 glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl hover:border-indigo-500/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                    Real-Time Analytics Engine
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Monitor link performance with live-polling telemetry. Track click volume, unique
                    devices, and top referring networks in real time.
                  </p>
                </motion.div>

                <motion.div
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="p-6 glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl hover:border-emerald-500/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
                    <Globe2 className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                    Geographic & Device Intelligence
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Discover where your audience resides with city and country level resolution, paired
                    with operating system and hardware telemetry.
                  </p>
                </motion.div>

                <motion.div
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="p-6 glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl hover:border-sky-500/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-4">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                    Hardened Safety & Passcodes
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Protect confidential destinations with custom passcodes. Built-in SSRF blocklists
                    stop local subnet attacks before redirection occurs.
                  </p>
                </motion.div>
              </div>

              {/* Recent Links Preview */}
              {links.length > 0 && (
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Your Recent Shortened Links
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Manage active shortcuts and view quick click counts
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('dashboard')}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>View All ({links.length})</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <LinksTable
                    links={links.slice(0, 5)}
                    onOpenQr={handleOpenQr}
                    onLinkDeleted={handleLinkDeleted}
                    onLinkUpdated={handleLinkUpdated}
                    onSelectLinkForAnalytics={handleSelectLinkForAnalytics}
                  />
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <motion.div
              key="tab-dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Link Management Console
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>Search, pause, inspect, and manage saved links</span>
                    {anonymousUserId && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={handleCopyUserId}
                          title="Copy your AnonymousUser ID"
                          className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[260px]"
                        >
                          {copiedUserId ? 'Copied ID!' : anonymousUserId}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('shorten')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-indigo-500/25 self-start sm:self-auto whitespace-nowrap"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>+ Create New Short Link</span>
                </button>
              </div>

              {!linksLoaded ? (
                <div className="p-12 text-center glass-surface border border-slate-200/80 dark:border-white/15 rounded-3xl text-xs text-slate-500 dark:text-slate-400">
                  Loading your links...
                </div>
              ) : (
                <LinksTable
                  links={links}
                  onOpenQr={handleOpenQr}
                  onLinkDeleted={handleLinkDeleted}
                  onLinkUpdated={handleLinkUpdated}
                  onSelectLinkForAnalytics={handleSelectLinkForAnalytics}
                />
              )}
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div
              key="tab-analytics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <AnalyticsDashboard links={links} onOpenQr={handleOpenQr} />
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div
              key="tab-security"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <SecuritySection />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Glass Footer */}
      <footer className="mt-16 border-t border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-slate-950/60 backdrop-blur-xl py-8 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">LinkPulse</span>
            <span aria-hidden="true">·</span>
            <span>Enterprise-Grade URL Shortener & Analytics</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={() => setActiveTab('security')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Security Policy
            </button>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>All Systems Operational</span>
            </span>
          </div>
        </div>
      </footer>

      {/* QR Code Modal */}
      <QrModal
        isOpen={qrModalData.isOpen}
        url={qrModalData.url}
        title={qrModalData.title}
        onClose={() => setQrModalData((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
