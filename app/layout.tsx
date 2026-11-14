import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SplashScreen } from '@/components/SplashScreen';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LinkPulse - Secure URL Shortener & Real-Time Analytics',
  description:
    'High-security URL shortener with instant browser workspaces, tamper-proof redirection, geo-traffic telemetry, QR code generator, and real-time click analytics.',
  openGraph: {
    title: 'LinkPulse - Secure URL Shortener & Real-Time Analytics',
    description:
      'High-security URL shortener with instant browser workspaces, tamper-proof redirection, geo-traffic telemetry, QR code generator, and real-time click analytics.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LinkPulse - Secure URL Shortener & Real-Time Analytics',
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
      className={`h-full ${plusJakarta.variable} ${jetbrainsMono.variable}`}
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
          <SplashScreen />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
