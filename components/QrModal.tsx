'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Copy, Check, QrCode as QrIcon } from 'lucide-react';

interface QrModalProps {
  isOpen: boolean;
  url: string;
  title: string;
  onClose: () => void;
}

function QrModalContent({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/qrcode?text=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success && data.qrDataUrl) {
          setQrDataUrl(data.qrDataUrl);
        }
      })
      .catch((err) => console.error('Failed to load QR code:', err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url]);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-code-${encodeURIComponent(title || 'link')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm glass-elevated border border-slate-200/80 dark:border-white/15 rounded-2xl p-6 text-center"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close QR dialog"
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
          <QrIcon className="w-5 h-5" />
        </div>

        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          QR Code Scanner
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 max-w-xs mx-auto truncate">
          {title || url}
        </p>

        {/* QR Image Box with Optical Scanner Frame */}
        <div className="w-56 h-56 mx-auto p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-inner flex items-center justify-center mb-5 relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-2">
            <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-indigo-500/50 rounded-tl-xs" />
            <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-indigo-500/50 rounded-tr-xs" />
            <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-indigo-500/50 rounded-bl-xs" />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-indigo-500/50 rounded-br-xs" />
          </div>
          {loading ? (
            <div className="text-xs text-slate-400 font-medium">Generating QR...</div>
          ) : qrDataUrl ? (
            <>
              <Image
                src={qrDataUrl}
                alt="Shortened URL QR Code"
                width={220}
                height={220}
                unoptimized
                className="w-full h-full object-contain relative z-10"
                referrerPolicy="no-referrer"
              />
              <motion.div
                aria-hidden="true"
                initial={{ y: -90, opacity: 0 }}
                animate={{ y: [-90, 90, -90], opacity: [0.15, 0.55, 0.15] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-x-4 h-[2px] z-20 bg-gradient-to-r from-transparent via-cyan-400 to-transparent will-change-transform"
              />
            </>
          ) : (
            <div className="text-xs text-red-500">Failed to render QR</div>
          )}
        </div>

        <div className="mb-4 px-3 py-2 bg-white/60 dark:bg-slate-950/60 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-mono text-indigo-600 dark:text-indigo-400 truncate select-all">
          {url}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white/80 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-all active:scale-[0.98]"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.12 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied</span>
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.12 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-indigo-500/25 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PNG</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function QrModal({ isOpen, url, title, onClose }: QrModalProps) {
  return (
    <AnimatePresence>
      {isOpen && url && <QrModalContent url={url} title={title} onClose={onClose} />}
    </AnimatePresence>
  );
}
