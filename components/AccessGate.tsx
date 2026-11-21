'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Scale,
  AlertTriangle,
  ArrowRight,
  Lock,
  Eye,
  Check,
} from 'lucide-react';
import { SplashScreen } from './SplashScreen';
import { RefusedTerms3D } from './RefusedTerms3D';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MagneticShell, MaskedReveal, SpotlightCard } from './MotionPrimitives';
import {
  ANONYMOUS_USER_ID_REGEX,
  TERMS_REQUIRED_EVENT,
  clearTermsToken,
  getOrInitAnonymousUserId,
  setStoredWorkspaceId,
  setTermsToken,
} from '@/lib/client-auth';

type GatePhase = 'splash' | 'disclaimer' | 'refused' | 'accepted';

interface TermsGetResponse {
  challengeToken?: string;
  accepted?: boolean;
  workspaceId?: string;
  error?: string;
}

interface TermsPostResponse {
  success?: boolean;
  accepted?: boolean;
  termsToken?: string;
  workspaceId?: string;
  error?: string;
  code?: string;
}

const SAFE_USE_CLAUSES = [
  {
    id: 'ethical-use',
    index: '01',
    shortLabel: 'Safe Use',
    title: 'Safe & Ethical Usage',
    summary: 'Never create links intended for phishing, harassment, stalking, malware, or harming others.',
    details:
      'Every destination must serve a legitimate, non-harmful purpose. Deceptive redirects or abusive tracking render access void.',
    icon: CheckCircle2,
    accentIcon: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/12 border-emerald-500/25',
    accentBorder: 'border-emerald-500/45',
  },
  {
    id: 'user-responsibility',
    index: '02',
    shortLabel: 'Liability',
    title: 'Full User Accountability',
    summary: 'You bear sole legal and ethical responsibility for every link you shorten and share.',
    details:
      'Verify destinations comply with applicable laws and policies. The developer assumes zero responsibility for user misuse.',
    icon: Scale,
    accentIcon: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/12 border-indigo-500/25',
    accentBorder: 'border-indigo-500/45',
  },
  {
    id: 'privacy-consent',
    index: '03',
    shortLabel: 'Privacy',
    title: 'Privacy & Consent Transparency',
    summary: 'Respect visitor privacy and explicit location consent whenever enabling route telemetry.',
    details:
      'Optional GPS telemetry requests explicit browser permission with disclosure. Never misrepresent consent flows.',
    icon: Eye,
    accentIcon: 'text-sky-600 dark:text-sky-400 bg-sky-500/12 border-sky-500/25',
    accentBorder: 'border-sky-500/45',
  },
] as const;

export function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isVisitorGateRoute =
    Boolean(pathname?.startsWith('/verify-location')) ||
    Boolean(pathname?.startsWith('/unlock')) ||
    Boolean(pathname?.startsWith('/link-status'));

  const [gatePhase, setGatePhase] = useState<GatePhase>('splash');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [agreedToSafeUse, setAgreedToSafeUse] = useState(false);
  const [activeClauseId, setActiveClauseId] = useState<string>('ethical-use');
  const [acknowledgedClauses, setAcknowledgedClauses] = useState<Record<string, boolean>>({
    'ethical-use': true,
    'user-responsibility': false,
    'privacy-consent': false,
  });
  const [submittingAction, setSubmittingAction] = useState<'accept' | 'decline' | 'retry' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchFreshChallenge = useCallback(async (resetCookie = true): Promise<string | null> => {
    const uid = getOrInitAnonymousUserId();
    const headers: Record<string, string> = {};
    if (uid) {
      headers['X-Workspace-Id'] = uid;
    }

    const res = await fetch(`/api/terms${resetCookie ? '?reset=1' : ''}`, {
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => null)) as TermsGetResponse | null;
    if (data?.workspaceId && ANONYMOUS_USER_ID_REGEX.test(data.workspaceId)) {
      setStoredWorkspaceId(data.workspaceId);
    }

    if (!res.ok || !data?.challengeToken) {
      throw new Error(data?.error || 'Unable to initialize security challenge.');
    }

    setChallengeToken(data.challengeToken);
    return data.challengeToken;
  }, []);

  // Initialize isolated session challenge and clear any prior consent on fresh page load
  useEffect(() => {
    if (isVisitorGateRoute) return;

    let cancelled = false;

    const initChallenge = async () => {
      await Promise.resolve();
      if (cancelled) return;
      clearTermsToken();
      try {
        await fetchFreshChallenge(true);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to pre-fetch terms challenge:', err);
        }
      }
    };

    void initChallenge();

    return () => {
      cancelled = true;
    };
  }, [isVisitorGateRoute, fetchFreshChallenge]);

  // Listen for server 403 TERMS_REQUIRED responses at runtime and re-lock immediately
  useEffect(() => {
    if (isVisitorGateRoute) return;

    const handleTermsRequired = () => {
      clearTermsToken();
      setAgreedToSafeUse(false);
      setErrorMessage('Your safety agreement expired or is invalid. Please review and accept to continue.');
      setGatePhase('disclaimer');
      fetchFreshChallenge(true).catch(() => {});
    };

    window.addEventListener(TERMS_REQUIRED_EVENT, handleTermsRequired);
    return () => {
      window.removeEventListener(TERMS_REQUIRED_EVENT, handleTermsRequired);
    };
  }, [isVisitorGateRoute, fetchFreshChallenge]);

  const handleSplashComplete = useCallback(() => {
    setGatePhase((current) => (current === 'splash' ? 'disclaimer' : current));
  }, []);

  const handleSelectClause = (id: string) => {
    setActiveClauseId(id);
    setAcknowledgedClauses((prev) => ({ ...prev, [id]: true }));
  };

  const handleToggleClauseAck = (id: string) => {
    setAcknowledgedClauses((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMasterConsentChange = (checked: boolean) => {
    setAgreedToSafeUse(checked);
    if (checked) {
      setAcknowledgedClauses({
        'ethical-use': true,
        'user-responsibility': true,
        'privacy-consent': true,
      });
    }
    if (errorMessage) setErrorMessage(null);
  };

  const activeClause =
    SAFE_USE_CLAUSES.find((c) => c.id === activeClauseId) || SAFE_USE_CLAUSES[0];
  const ActiveClauseIcon = activeClause.icon;
  const acknowledgedCount = SAFE_USE_CLAUSES.filter((c) => acknowledgedClauses[c.id]).length;
  const progressPercent = agreedToSafeUse
    ? 100
    : Math.round((acknowledgedCount / SAFE_USE_CLAUSES.length) * 75);

  const submitTermsDecision = async (accept: boolean) => {
    setErrorMessage(null);
    setSubmittingAction(accept ? 'accept' : 'decline');

    try {
      let activeChallenge = challengeToken;
      if (!activeChallenge) {
        activeChallenge = await fetchFreshChallenge(true);
      }

      const uid = getOrInitAnonymousUserId();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (uid) {
        headers['X-Workspace-Id'] = uid;
      }

      let res = await fetch('/api/terms', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          accepted: accept,
          agreedToSafeUse: accept ? agreedToSafeUse : false,
          challengeToken: activeChallenge,
        }),
      });

      let data = (await res.json().catch(() => null)) as TermsPostResponse | null;

      // Retry once transparently if the challenge expired while user read the disclaimer
      if (res.status === 403 && data?.code === 'INVALID_CHALLENGE') {
        const refreshed = await fetchFreshChallenge(true);
        res = await fetch('/api/terms', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            accepted: accept,
            agreedToSafeUse: accept ? agreedToSafeUse : false,
            challengeToken: refreshed,
          }),
        });
        data = (await res.json().catch(() => null)) as TermsPostResponse | null;
      }

      if (data?.workspaceId && ANONYMOUS_USER_ID_REGEX.test(data.workspaceId)) {
        setStoredWorkspaceId(data.workspaceId);
      }

      if (!res.ok) {
        setErrorMessage(data?.error || 'Could not verify terms response. Please try again.');
        return;
      }

      if (accept) {
        if (!data?.accepted || !data.termsToken) {
          setErrorMessage('Server did not issue a valid access token. Please retry.');
          return;
        }
        setTermsToken(data.termsToken);
        setGatePhase('accepted');
      } else {
        clearTermsToken();
        setAgreedToSafeUse(false);
        setGatePhase('refused');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Network error verifying terms agreement.'
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleRetryFromRefused = async () => {
    setSubmittingAction('retry');
    setErrorMessage(null);
    setAgreedToSafeUse(false);
    clearTermsToken();

    try {
      await fetchFreshChallenge(true);
    } catch {
      // Allow moving back to disclaimer; submitTermsDecision retries challenge fetch if needed
    } finally {
      setSubmittingAction(null);
      setGatePhase('disclaimer');
    }
  };

  // Visitor short-link gates bypass LinkPulse's splash & website disclaimer
  if (isVisitorGateRoute) {
    return <>{children}</>;
  }

  // Only mount main application DOM & React tree AFTER server-verified acceptance
  if (gatePhase === 'accepted') {
    return (
      <motion.div
        key="accepted-workspace"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    );
  }

  if (gatePhase === 'splash') {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (gatePhase === 'refused') {
    return (
      <RefusedTerms3D
        onRetry={handleRetryFromRefused}
        isRetrying={submittingAction === 'retry'}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-heading"
      className="h-[100dvh] w-full relative flex items-center justify-center p-2.5 sm:p-5 lg:p-8 bg-slate-50 dark:bg-[#060913] text-slate-900 dark:text-slate-100 overflow-hidden"
    >
      {/* Living Hi-Tech Ambient Backdrop */}
      <AmbientBackdrop />

      <AnimatePresence mode="wait">
        <SpotlightCard
          key="disclaimer-card"
          hoverLift={false}
          showReticles
          spotlightColor="rgba(99, 102, 241, 0.14)"
          borderGlowColor="rgba(56, 189, 248, 0.5)"
          className="relative z-10 w-full max-w-3xl max-h-full overflow-hidden [@media(max-height:520px)]:overflow-y-auto glass-elevated border border-slate-200/80 dark:border-white/15 rounded-2xl sm:rounded-3xl p-3 sm:p-6 lg:p-8 flex flex-col justify-between"
        >
          <div className="flex flex-col justify-between gap-2 sm:gap-4 lg:gap-5">
            {/* 1. Compact Fluid Header & Progress Indicator */}
            <header className="space-y-1.5 sm:space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileHover={{ scale: 1.06, rotate: -3 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/25"
                  >
                    <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                  </motion.div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      <Lock className="w-3 h-3 shrink-0" />
                      <span className="truncate">Mandatory Safe-Use Gate</span>
                    </div>
                    <MaskedReveal delay={0.05}>
                      <h1
                        id="disclaimer-heading"
                        className="text-[15px] min-[380px]:text-lg sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight truncate"
                      >
                        Terms &amp; Safe-Use Disclaimer
                      </h1>
                    </MaskedReveal>
                  </div>
                </div>

                {/* Live Consent Readiness Pill */}
                <div className="shrink-0 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.04] px-2 sm:px-3.5 py-1 sm:py-1.5 text-right">
                  <div className="hidden sm:block text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Review Progress
                  </div>
                  <div className="text-[10px] sm:text-xs font-bold font-mono tabular-nums text-indigo-600 dark:text-cyan-300 whitespace-nowrap">
                    {agreedToSafeUse ? 'Ready · 100%' : `${acknowledgedCount}/${SAFE_USE_CLAUSES.length} Read`}
                  </div>
                </div>
              </div>

              <div className="h-1 sm:h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ width: `${Math.max(10, progressPercent)}%` }}
                  transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                  className={`h-full rounded-full ${
                    agreedToSafeUse
                      ? 'bg-gradient-to-r from-emerald-500 via-cyan-400 to-indigo-500'
                      : 'bg-gradient-to-r from-indigo-500 to-sky-400'
                  }`}
                />
              </div>
            </header>

            {/* 2. Official Disclaimer Statement */}
            <section
              aria-label="Official disclaimer notice"
              className="shrink-0 rounded-xl sm:rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300/75 dark:border-amber-500/30 p-2.5 sm:p-4 lg:p-5 space-y-1 sm:space-y-2"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 text-amber-800 dark:text-amber-300 text-[10px] sm:text-xs font-semibold uppercase tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Official Disclaimer Notice</span>
              </div>
              <p className="text-[11px] min-[380px]:text-xs sm:text-sm lg:text-[15px] font-semibold text-slate-900 dark:text-white leading-snug sm:leading-relaxed">
                This website is strictly for safe use and must not be used to harm anyone. The
                website developer is not responsible for any misuse.
              </p>
              <p className="text-[10px] min-[380px]:text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 leading-snug sm:leading-relaxed">
                By proceeding, you agree to comply with applicable laws and respect visitor privacy
                and explicit location consent.
              </p>
            </section>

            {/* 3. Interactive 3-Pillar Safety Commitments (Single-Frame Tabbed Inspector — Zero Vertical Bloat) */}
            <section aria-label="Safe-use commitments" className="shrink-0 space-y-2 sm:space-y-2.5">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5" role="tablist" aria-label="Safety policy clauses">
                {SAFE_USE_CLAUSES.map((clause) => {
                  const isActive = activeClauseId === clause.id;
                  const isAck = acknowledgedClauses[clause.id];
                  return (
                    <button
                      key={clause.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => handleSelectClause(clause.id)}
                      className={`relative flex items-center justify-center sm:justify-between gap-1.5 px-2 sm:px-3.5 py-2 rounded-xl border text-[11px] sm:text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        isActive
                          ? `bg-white dark:bg-white/10 ${clause.accentBorder} text-slate-900 dark:text-white shadow-xs`
                          : 'bg-white/60 dark:bg-white/[0.03] border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/25'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="font-mono text-[10px] opacity-60">{clause.index}</span>
                        <span className="truncate">{clause.shortLabel}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                          isAck
                            ? 'bg-emerald-500'
                            : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeClause.id}
                  role="tabpanel"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className={`rounded-xl sm:rounded-2xl border p-3 sm:p-4 bg-white/85 dark:bg-white/[0.05] ${activeClause.accentBorder}`}
                >
                  <div className="flex items-start justify-between gap-2.5 sm:gap-4">
                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${activeClause.accentIcon}`}
                      >
                        <ActiveClauseIcon className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5 sm:space-y-1 min-w-0">
                        <h2 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                          {activeClause.title}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-snug sm:leading-relaxed">
                          {activeClause.summary}{' '}
                          <span className="hidden sm:inline text-slate-500 dark:text-slate-400">
                            {activeClause.details}
                          </span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleClauseAck(activeClause.id)}
                      aria-pressed={acknowledgedClauses[activeClause.id]}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-medium border transition-all whitespace-nowrap ${
                        acknowledgedClauses[activeClause.id]
                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      {acknowledgedClauses[activeClause.id] ? 'Reviewed' : 'Mark Read'}
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </section>

            {/* 4. Explicit Consent Confirmation Toggle */}
            <section aria-label="Consent confirmation" className="shrink-0 space-y-2">
              <label
                className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl border cursor-pointer transition-all duration-200 ${
                  agreedToSafeUse
                    ? 'bg-indigo-50/85 dark:bg-indigo-950/35 border-indigo-500/50 shadow-sm shadow-indigo-500/10'
                    : 'bg-slate-100/80 dark:bg-white/[0.045] border-slate-200/90 dark:border-white/10 hover:border-indigo-500/40'
                }`}
              >
                <div className="relative mt-0.5 flex items-center justify-center shrink-0">
                  <input
                    type="checkbox"
                    checked={agreedToSafeUse}
                    onChange={(e) => handleMasterConsentChange(e.target.checked)}
                    className="peer sr-only"
                  />
                  <motion.span
                    aria-hidden="true"
                    whileTap={{ scale: 0.9 }}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-150 ${
                      agreedToSafeUse
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {agreedToSafeUse && (
                      <motion.span
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                        className="flex items-center justify-center"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.6]" />
                      </motion.span>
                    )}
                  </motion.span>
                </div>

                <div className="space-y-0.5 select-none">
                  <div className="text-[11px] sm:text-xs lg:text-sm font-semibold text-slate-900 dark:text-white leading-snug sm:leading-relaxed">
                    I agree to use this website solely for safe purposes, not to harm anyone, and
                    acknowledge that the website developer is not responsible for any misuse.
                  </div>
                  <p className="hidden min-[380px]:block text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                    {agreedToSafeUse
                      ? 'Consent confirmed — ready to enter XrGeoLink.'
                      : 'Check above to enable entry. Declining opens the restricted 3D view.'}
                  </p>
                </div>
              </label>

              {errorMessage && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 flex items-center gap-2 text-[11px] sm:text-xs text-rose-700 dark:text-rose-300">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </section>

            {/* 5. Responsive Decision Footer (Single-Row Side-by-Side Across Phones, Tablets & Laptops) */}
            <footer className="shrink-0 grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2.5 sm:gap-4 pt-2 sm:pt-3 border-t border-slate-200/75 dark:border-white/10">
              <button
                type="button"
                onClick={() => submitTermsDecision(false)}
                disabled={submittingAction !== null}
                className="min-h-[42px] sm:min-h-[46px] inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 rounded-xl bg-slate-200/80 dark:bg-white/10 hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-300/70 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>{submittingAction === 'decline' ? 'Declining...' : 'Decline Terms'}</span>
              </button>

              <MagneticShell strength={agreedToSafeUse ? 5 : 0} className="w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => submitTermsDecision(true)}
                  disabled={!agreedToSafeUse || submittingAction !== null}
                  className="group w-full sm:w-auto min-h-[42px] sm:min-h-[46px] inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25 disabled:shadow-none whitespace-nowrap"
                >
                  <span>
                    {submittingAction === 'accept' ? 'Verifying...' : 'Accept & Enter'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-150 group-hover:translate-x-0.5 shrink-0" />
                </button>
              </MagneticShell>
            </footer>
          </div>
        </SpotlightCard>
      </AnimatePresence>
    </div>
  );
}
