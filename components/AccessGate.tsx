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
} from 'lucide-react';
import { SplashScreen } from './SplashScreen';
import { RefusedTerms3D } from './RefusedTerms3D';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MaskedReveal, SpotlightCard } from './MotionPrimitives';
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

export function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isVisitorGateRoute =
    Boolean(pathname?.startsWith('/verify-location')) ||
    Boolean(pathname?.startsWith('/unlock')) ||
    Boolean(pathname?.startsWith('/link-status'));

  const [gatePhase, setGatePhase] = useState<GatePhase>('splash');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [agreedToSafeUse, setAgreedToSafeUse] = useState(false);
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
      className="min-h-screen w-full relative flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-[#060913] text-slate-900 dark:text-slate-100 overflow-y-auto"
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
          className="relative z-10 w-full max-w-2xl glass-elevated border border-slate-200/80 dark:border-white/15 rounded-3xl p-6 sm:p-9 space-y-6"
        >
          {/* Header */}
          <div className="flex items-start gap-4">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/25"
            >
              <ShieldCheck className="w-6 h-6" />
            </motion.div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Mandatory Safe-Use Agreement</span>
              </div>
              <MaskedReveal delay={0.06}>
                <h1
                  id="disclaimer-heading"
                  className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white"
                >
                  Terms &amp; Safe-Use Disclaimer
                </h1>
              </MaskedReveal>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Please read and accept the following safety terms before accessing LinkPulse.
              </p>
            </div>
          </div>

          {/* Core Disclaimer Box */}
          <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-500/30 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-semibold uppercase tracking-wide">
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
          </div>

          {/* Key Commitments */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/70 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 p-3.5 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-white">Safe &amp; Ethical Use</p>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Never create links intended for phishing, harassment, stalking, malware, or harming others.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/70 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 p-3.5 flex items-start gap-2.5">
              <Scale className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-white">Full User Responsibility</p>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  You bear sole legal and ethical responsibility for every link you shorten and share.
                </p>
              </div>
            </div>
          </div>

          {/* Explicit Checkbox Confirmation with Custom Animated Tick */}
          <label className="flex items-start gap-3 p-4 rounded-2xl bg-slate-100/80 dark:bg-white/[0.05] border border-slate-200/90 dark:border-white/10 cursor-pointer hover:border-indigo-500/40 transition-colors">
            <div className="relative mt-0.5 flex items-center justify-center shrink-0">
              <input
                type="checkbox"
                checked={agreedToSafeUse}
                onChange={(e) => {
                  setAgreedToSafeUse(e.target.checked);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-150 ${
                  agreedToSafeUse
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                }`}
              >
                {agreedToSafeUse && (
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <motion.path
                      d="M3.5 8.5l3 3 6-6.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </svg>
                )}
              </span>
            </div>
            <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed select-none">
              I agree to use this website solely for safe purposes, not to harm anyone, and
              acknowledge that the website developer is not responsible for any misuse.
            </span>
          </label>

          {/* Inline Error Alert */}
          {errorMessage && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => submitTermsDecision(false)}
              disabled={submittingAction !== null}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-200/80 dark:bg-white/10 hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-300/70 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              <span>{submittingAction === 'decline' ? 'Declining...' : 'Decline Terms'}</span>
            </button>

            <button
              type="button"
              onClick={() => submitTermsDecision(true)}
              disabled={!agreedToSafeUse || submittingAction !== null}
              className="group min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25 disabled:shadow-none"
            >
              <span>
                {submittingAction === 'accept' ? 'Verifying Consent...' : 'Accept & Enter Website'}
              </span>
              <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          </div>
        </SpotlightCard>
      </AnimatePresence>
    </div>
  );
}
