'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  Flame,
  Globe2,
  Server,
  FileCheck2,
} from 'lucide-react';

export function SecuritySection() {
  const securityPillars = [
    {
      title: 'Cryptographic Workspace & Bcrypt Passcodes',
      desc: 'Visitors receive an instant 128-bit cryptographic browser workspace without needing an account. Optional link passcodes are salted and hashed with 12 bcrypt rounds before storage.',
      icon: <Lock className="w-5 h-5 text-indigo-500" />,
      tag: 'Cryptographic Integrity',
    },
    {
      title: 'SSRF, Phishing & Obfuscated IP Shield',
      desc: 'Blocks RFC 1918 private subnets, loopback, octal/hex/integer IPv4 bypasses, cloud metadata hosts (169.254.169.254), unsafe service ports, and credential-in-URL phishing (@).',
      icon: <Server className="w-5 h-5 text-emerald-500" />,
      tag: 'Infrastructure Protection',
    },
    {
      title: 'XSS, Prototype Pollution & Header Guard',
      desc: 'Strict http/https protocol allowlisting, HTML/script delimiter sanitization on link titles and telemetry, prototype pollution rejection, plus X-Content-Type-Options, HSTS, and Permissions-Policy headers.',
      icon: <Flame className="w-5 h-5 text-rose-500" />,
      tag: 'Injection Defense',
    },
    {
      title: 'Multi-Layer IP & Workspace Rate Limiting',
      desc: 'Edge and distributed sliding-window rate limiters protect link creation, management, redirects, GPS verification, and passcode-unlock endpoints against automated flooding and brute-force guessing.',
      icon: <ShieldCheck className="w-5 h-5 text-sky-500" />,
      tag: 'Abuse Prevention',
    },
    {
      title: 'Zero-Trust Firestore Rules & Server Storage',
      desc: 'Direct client Firestore access remains strictly default-deny while hardened Next.js API routes manage validated link records and telemetry via Firebase Admin SDK.',
      icon: <FileCheck2 className="w-5 h-5 text-indigo-400" />,
      tag: 'Zero-Trust Storage',
    },
    {
      title: 'IP Anonymization & Consent-First GPS',
      desc: 'Client IP addresses recorded during link redirection are automatically masked (e.g. 198.51.100.xxx), and precision GPS verification requires explicit visitor browser permission.',
      icon: <Globe2 className="w-5 h-5 text-amber-500" />,
      tag: 'Privacy By Design',
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      {/* Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-200/80 dark:border-white/15 bg-slate-950 shadow-xl">
        <div className="relative h-64 sm:h-72 w-full">
          <Image
            src="/images/auth_hero_preview_1794445483732.jpg"
            alt="Security Architecture Dashboard Preview"
            fill
            className="object-cover opacity-50"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent" />
          <div className="absolute inset-0 p-6 sm:p-10 flex flex-col justify-center max-w-2xl">
            <div className="inline-flex items-center gap-2 text-sky-300 text-xs font-semibold tracking-wider mb-3 w-fit">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Hardened Security Architecture</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2 text-balance">
              Defense-in-Depth Link Shortening
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every link shortened and click recorded traverses defensive protocol sanitizers,
              128-bit workspace isolation, and rate-limited firewalls built for instant open
              access without compromising safety.
            </p>
          </div>
        </div>
      </div>

      {/* Security Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {securityPillars.map((pillar) => (
          <motion.div
            key={pillar.title}
            whileHover={{ y: -3 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-5 hover:border-indigo-500/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-white/75 dark:bg-white/5 border border-slate-200/70 dark:border-white/10">
                {pillar.icon}
              </div>
              <span className="text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400 tracking-wider">
                {pillar.tag}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
              {pillar.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {pillar.desc}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Active Defense Controls */}
      <div className="glass-surface border border-slate-200/80 dark:border-white/15 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
          Active Defense Invariants
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Programmatic verification rules enforced across API routes, edge middleware, and storage
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {[
            { label: 'Default-Deny Direct Firestore Client Rules', status: 'Enforced' },
            { label: '128-Bit Cryptographic Workspace Isolation', status: 'Enforced' },
            { label: 'Self-Redirect Loop & XSS Delimiter Filters', status: 'Enforced' },
            { label: 'Server-Verified Link Expiration & Status', status: 'Enforced' },
            { label: 'Credential-in-URL (@) & Obfuscated IP SSRF Guard', status: 'Blocked' },
            { label: 'javascript: / data: / file: URI Scheme Rejections', status: 'Blocked' },
            { label: '12-Round Bcrypt Link Passcode Hashing', status: 'Active' },
            { label: 'IP + Workspace Sliding-Window Rate Limiters', status: 'Active' },
            { label: 'Prototype Pollution & Payload Size Ceiling (64KB)', status: 'Active' },
            { label: 'HTTP Security Headers (nosniff / HSTS / CSP)', status: 'Active' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10"
            >
              <span className="text-slate-700 dark:text-slate-200 font-medium">
                {item.label}
              </span>
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 ml-2">
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
