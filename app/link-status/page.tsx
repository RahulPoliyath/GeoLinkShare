import React, { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Link2Off, ArrowLeft, ShieldAlert, ServerCrash } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeProvider';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';

function StatusContent({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const status = typeof searchParams.status === 'string' ? searchParams.status : 'not-found';
  const code = typeof searchParams.code === 'string' ? searchParams.code : '';

  let title = 'Link Not Found';
  let description =
    'The shortened link you are trying to visit does not exist, has been deleted, or was created on a different temporary preview instance.';
  let icon = <Link2Off className="w-8 h-8 text-amber-500 dark:text-amber-400" />;

  if (status === 'inactive') {
    title = 'Link Paused';
    description = 'The owner of this link has temporarily paused traffic to this destination URL.';
    icon = <AlertTriangle className="w-8 h-8 text-amber-500 dark:text-amber-400" />;
  } else if (status === 'expired') {
    title = 'Link Expired';
    description = 'This shortened link reached its scheduled expiration date and is no longer accepting redirects.';
    icon = <Clock className="w-8 h-8 text-rose-500 dark:text-rose-400" />;
  } else if (status === 'blocked' || status === 'invalid') {
    title = 'Destination Blocked';
    description = 'This link failed LinkPulse security verification and has been blocked to protect visitors.';
    icon = <ShieldAlert className="w-8 h-8 text-rose-500 dark:text-rose-400" />;
  } else if (status === 'error') {
    title = 'Redirect Service Unavailable';
    description =
      'The server could not query Cloud Firestore to resolve this short link right now. If hosted on Vercel, verify FIREBASE_SERVICE_ACCOUNT_JSON is configured in Environment Variables.';
    icon = <ServerCrash className="w-8 h-8 text-rose-500 dark:text-rose-400" />;
  }

  return (
    <div className="min-h-screen relative text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center px-4 py-12 transition-colors">
      <AmbientBackdrop />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md glass-elevated border border-slate-200/80 dark:border-white/15 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/75 dark:bg-white/5 border border-slate-200/80 dark:border-white/15 flex items-center justify-center mx-auto mb-6">
          {icon}
        </div>

        <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">{description}</p>

        {code && (
          <div className="mb-6 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-slate-200/80 dark:border-white/15 text-xs font-mono text-slate-700 dark:text-slate-200 inline-block">
            /r/{code}
          </div>
        )}

        <div className="pt-4 border-t border-slate-200/70 dark:border-white/10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to LinkPulse Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function LinkStatusPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-[#060913] flex items-center justify-center text-slate-500 dark:text-slate-400">
          Loading status...
        </div>
      }
    >
      <StatusContent searchParams={searchParams} />
    </Suspense>
  );
}
