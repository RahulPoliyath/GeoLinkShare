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
  ChevronDown,
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
    title: 'Safe & Ethical Usage',
    summary: 'Never create links intended for phishing, harassment, stalking, malware, or harming others.',
    details:
      'Every shortened destination must serve a legitimate, non-harmful purpose. Any attempt to mask deceptive redirects, social-engineering lures, or abusive tracking violates safe-use policy and renders access void.',
    icon: CheckCircle2,
    accentIcon: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/12 border-emerald-500/25',
    accentBorder: 'border-emerald-500/40',
  },
  {
    id: 'user-responsibility',
    index: '02',
    title: 'Full User Accountability',
    summary: 'You bear sole legal and ethical responsibility for every link you shorten and share.',
    details:
      'You are exclusively responsible for verifying that shared destinations comply with local laws, intellectual property rights, and platform policies. The website developer assumes zero liability for user-generated links or misuse.',
    icon: Scale,
    accentIcon: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/12 border-indigo-500/25',
    accentBorder: 'border-indigo-500/40',
  },
  {
    id: 'privacy-consent',
    index: '03',
    title: 'Privacy & Visitor Transparency',
    summary: 'Respect visitor privacy and explicit location consent whenever enabling route telemetry.',
    details:
      'Optional high-accuracy geolocation prompts visitors directly through native browser permissions with clear disclosure. You agree never to misrepresent consent flows or collect data unlawfully.',
    icon: Eye,
    accentIcon: 'text-sky-600 dark:text-sky-400 bg-sky-500/12 border-sky-500/25',
    accentBorder: 'border-sky-500/40',
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
  const [expandedClauseId, setExpandedClauseId] = useState<string>('ethical-use');
  const [acknowledgedClauses, setAcknowledgedClauses] = useState<Record<string, boolean>>({
    'ethical-use': false,
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
    setExpandedClauseId((prev) => (prev === id ? '' : id));
    setAcknowledgedClauses((prev) => ({ ...prev, [id]: true }));
  };

  const handleToggleClauseAck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
      className="min-h-screen w-full relative flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-slate-50 dark:bg-[#060913] text-slate-900 dark:text-slate-100 overflow-y-auto"
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
          className="relative z-10 w-full max-w-3xl glass-elevated border border-slate-200/80 dark:border-white/15 rounded-3xl p-7 sm:p-11 lg:p-12"
        >
          <div className="space-y-8 sm:space-y-9">
            {/* 1. Header & Interactive Verification Progress */}
            <header className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileHover={{ scale: 1.06, rotate: -3 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="w-13 h-13 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/25"
                  >
                    <ShieldCheck className="w-6 h-6" />
                  </motion.div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Mandatory Safe-Use Gate</span>
                    </div>
                    <MaskedReveal delay={0.05}>
                      <h1
                        id="disclaimer-heading"
                        className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight"
                      >
                        Terms &amp; Safe-Use Disclaimer
                      </h1>
                    </MaskedReveal>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-0.5">
                      Review each safety pillar below and confirm your agreement to unlock LinkPulse.
                    </p>
                  </div>
                </div>

                {/* Live Consent Readiness Counter */}
                <div className="self-start shrink-0 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.04] px-4 py-2.5 text-right">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Review Progress
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums text-indigo-600 dark:text-cyan-300 mt-0.5">
                    {agreedToSafeUse ? 'Ready · 100%' : `${acknowledgedCount}/${SAFE_USE_CLAUSES.length} Reviewed`}
                  </div>
                </div>
              </div>

              {/* Smooth Progress Bar */}
              <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ width: `${Math.max(8, progressPercent)}%` }}
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
              className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300/75 dark:border-amber-500/30 p-5 sm:p-7 space-y-3.5"
            >
              <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-semibold uppercase tracking-wide">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Official Disclaimer Notice</span>
              </div>
              <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                This website is strictly for safe use and must not be used to harm anyone. The
                website developer is not responsible for any misuse.
              </p>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                By proceeding, you agree to comply with all applicable laws and respect user privacy
                and consent whenever generating or sharing shortened URLs.
              </p>
            </section>

            {/* 3. Interactive Expandable Safe-Use Policy Pillars */}
            <section aria-label="Safe-use commitments" className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Interactive Safety Commitments
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Click any item to expand details
                </span>
              </div>

              <div className="space-y-3.5">
                {SAFE_USE_CLAUSES.map((clause) => {
                  const Icon = clause.icon;
                  const isExpanded = expandedClauseId === clause.id;
                  const isAck = acknowledgedClauses[clause.id];

                  return (
                    <motion.div
                      key={clause.id}
                      layout
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className={`group rounded-2xl border p-4 sm:p-5 transition-colors ${
                        isExpanded
                          ? `bg-white/90 dark:bg-white/[0.07] ${clause.accentBorder} shadow-md shadow-slate-900/5 dark:shadow-black/30`
                          : 'bg-white/65 dark:bg-white/[0.035] border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 sm:gap-4">
                        <button
                          type="button"
                          onClick={() => handleSelectClause(clause.id)}
                          aria-expanded={isExpanded}
                          className="flex-1 flex items-start gap-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
                        >
                          <div
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${clause.accentIcon}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                {clause.index}
                              </span>
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                {clause.title}
                              </h3>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              {clause.summary}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={(e) => handleToggleClauseAck(clause.id, e)}
                            aria-pressed={isAck}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap ${
                              isAck
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
                            }`}
                          >
                            {isAck ? 'Reviewed' : 'Mark Read'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectClause(clause.id)}
                            aria-label={isExpanded ? `Collapse ${clause.title}` : `Expand ${clause.title}`}
                            className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                          >
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180 text-indigo-500 dark:text-cyan-300' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 pt-3.5 sm:pl-14 border-t border-slate-200/70 dark:border-white/10 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              {clause.details}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* 4. Explicit Consent Confirmation Toggle */}
            <section aria-label="Consent confirmation" className="space-y-4">
              <label
                className={`flex items-start gap-4 p-5 sm:p-6 rounded-2xl border cursor-pointer transition-all duration-200 ${
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

                <div className="space-y-1 select-none">
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                    I agree to use this website solely for safe purposes, not to harm anyone, and
                    acknowledge that the website developer is not responsible for any misuse.
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {agreedToSafeUse
                      ? 'Consent confirmed — you may now enter the LinkPulse workspace.'
                      : 'Required before entering LinkPulse. Refusing terms opens the restricted 3D view.'}
                  </p>
                </div>
              </label>

              {/* Inline Error Alert */}
              {errorMessage && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </section>

            {/* 5. Spaced Decision Action Footer */}
            <footer className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-200/75 dark:border-white/10">
              <button
                type="button"
                onClick={() => submitTermsDecision(false)}
                disabled={submittingAction !== null}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-200/80 dark:bg-white/10 hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-300/70 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>{submittingAction === 'decline' ? 'Declining...' : 'Decline Terms'}</span>
              </button>

              <MagneticShell strength={agreedToSafeUse ? 5 : 0}>
                <button
                  type="button"
                  onClick={() => submitTermsDecision(true)}
                  disabled={!agreedToSafeUse || submittingAction !== null}
                  className="group w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25 disabled:shadow-none whitespace-nowrap"
                >
                  <span>
                    {submittingAction === 'accept' ? 'Verifying Consent...' : 'Accept & Enter Website'}
                  </span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </button>
              </MagneticShell>
            </footer>
          </div>
        </SpotlightCard>
      </AnimatePresence>
    </div>
  );
}
