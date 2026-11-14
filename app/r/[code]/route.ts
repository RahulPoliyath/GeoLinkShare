import { NextRequest, NextResponse } from 'next/server';
import {
  checkDistributedRateLimit,
  getLinkByShortCode,
  recordClick,
} from '@/lib/db';
import { extractGeoData } from '@/lib/geo';
import { getClientIp, validateSafeUrl } from '@/lib/security';

function noCacheRedirect(target: string | URL, status: 302 | 307 = 307): NextResponse {
  const response = NextResponse.redirect(target, { status });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  let shortCodeForError = '';
  try {
    const ip = getClientIp(req);
    if (!(await checkDistributedRateLimit(`redirect:${ip}`, 90, 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many redirect requests. Please wait a minute and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-Robots-Tag': 'noindex, nofollow, noarchive',
          },
        }
      );
    }

    const { code } = await params;
    shortCodeForError = code || '';
    if (!code || !/^[a-zA-Z0-9_-]{3,32}$/.test(code)) {
      return noCacheRedirect(new URL('/link-status?status=invalid', req.url));
    }

    const link = await getLinkByShortCode(code);
    if (!link) {
      return noCacheRedirect(
        new URL(`/link-status?status=not-found&code=${encodeURIComponent(code)}`, req.url)
      );
    }

    if (!link.isActive) {
      return noCacheRedirect(
        new URL(`/link-status?status=inactive&code=${encodeURIComponent(code)}`, req.url)
      );
    }

    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      return noCacheRedirect(
        new URL(`/link-status?status=expired&code=${encodeURIComponent(code)}`, req.url)
      );
    }

    // Re-validate destination URL at redirect time against SSRF/XSS/credential phishing
    const safeUrlCheck = validateSafeUrl(link.originalUrl);
    if (!safeUrlCheck.isValid || !safeUrlCheck.normalizedUrl) {
      return noCacheRedirect(
        new URL(`/link-status?status=blocked&code=${encodeURIComponent(code)}`, req.url)
      );
    }

    // If password-protected, direct user to unlock page (handles passcode + optional GPS)
    if (link.passwordHash) {
      return noCacheRedirect(new URL(`/unlock/${encodeURIComponent(code)}`, req.url));
    }

    // If high-accuracy GPS verification is enabled, route through opt-in GNSS verification gate
    if (link.requireGps) {
      return noCacheRedirect(new URL(`/verify-location/${encodeURIComponent(code)}`, req.url));
    }

    // Record Telemetry Click before issuing redirect (critical on Vercel serverless)
    const referrer = req.headers.get('referer') || 'direct';
    const userAgent = req.headers.get('user-agent') || '';
    const geo = extractGeoData(req);

    await recordClick({
      linkId: link.id,
      shortCode: link.shortCode,
      userId: link.userId,
      ip,
      referrer,
      userAgent,
      countryCode: geo.countryCode,
      countryName: geo.countryName,
      city: geo.city,
    });

    // 307 Temporary Redirect with strict anti-caching so analytics stay 100% accurate
    const response = noCacheRedirect(safeUrlCheck.normalizedUrl, 307);
    response.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
    return response;
  } catch (err) {
    console.error('Redirection error:', err);
    const codeParam = /^[a-zA-Z0-9_-]{3,32}$/.test(shortCodeForError)
      ? `&code=${encodeURIComponent(shortCodeForError)}`
      : '';
    return noCacheRedirect(new URL(`/link-status?status=error${codeParam}`, req.url));
  }
}
