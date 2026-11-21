import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AccessGate } from '@/components/AccessGate';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'XrGeoLink - Secure URL Shortener & Real-Time Analytics',
  description:
    'High-security URL shortener with instant browser workspaces, tamper-proof redirection, geo-traffic telemetry, QR code generator, and real-time click analytics.',
  openGraph: {
    title: 'XrGeoLink - Secure URL Shortener & Real-Time Analytics',
    description:
      'High-security URL shortener with instant browser workspaces, tamper-proof redirection, geo-traffic telemetry, QR code generator, and real-time click analytics.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'XrGeoLink - Secure URL Shortener & Real-Time Analytics',
    description:
      'High-security URL shortener with instant browser workspaces, tamper-proof redirection, geo-traffic telemetry, QR code generator, and real-time click analytics.',
  },
};

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('lp_theme');
    var isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="h-full bg-slate-50 dark:bg-[#060913] text-slate-900 dark:text-slate-100 antialiased font-sans transition-colors duration-200 selection:bg-indigo-500/20 selection:text-indigo-700 dark:selection:text-indigo-300"
        suppressHydrationWarning
      >
        <ThemeProvider>
          <AccessGate>{children}</AccessGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
