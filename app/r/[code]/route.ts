import { NextRequest, NextResponse } from 'next/server';
import {
  checkDistributedRateLimit,
  getLinkByShortCode,
} from '@/lib/db';
import { escapeHtmlAttr, resolveLinkSocialPreview } from '@/lib/link-preview';
import {
  getClientIp,
  isSocialPreviewCrawler,
  validateSafeUrl,
} from '@/lib/security';

function noCacheRedirect(target: string | URL, status: 302 | 307 = 307): NextResponse {
  const response = NextResponse.redirect(target, { status });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('Vary', 'User-Agent');
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

    const nextPath = link.passwordHash
      ? `/unlock/${encodeURIComponent(code)}`
      : `/verify-location/${encodeURIComponent(code)}`;

    // Serve destination-aware OpenGraph metadata to non-interactive link-preview bots (WhatsApp, Telegram, Slack, etc.)
    // Strictly never cached at CDN edge (no-store + Vary: User-Agent) so real browsers always get the 307 redirect,
    // and includes a JS redirect + interactive fallback link in case any in-app WebView renders it.
    const userAgent = req.headers.get('user-agent');
    if (isSocialPreviewCrawler(userAgent)) {
      const preview = await resolveLinkSocialPreview(link, req.url);
      const safeTitle = escapeHtmlAttr(preview.title);
      const safeDesc = escapeHtmlAttr(preview.description);
      const safeSite = escapeHtmlAttr(preview.siteName);
      const safeCanonical = escapeHtmlAttr(preview.canonicalUrl || req.url);
      const safeNextHref = escapeHtmlAttr(nextPath);
      const imageMeta = preview.imageUrl
        ? `<meta property="og:image" content="${escapeHtmlAttr(preview.imageUrl)}" />
  <meta name="twitter:image" content="${escapeHtmlAttr(preview.imageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />`
        : `<meta name="twitter:card" content="summary" />`;

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${safeSite}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:url" content="${safeCanonical}" />
  ${imageMeta}
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <script>window.location.replace(${JSON.stringify(nextPath)});</script>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#090b10;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:24px;text-align:center;">
  <div style="max-width:420px;width:100%;padding:28px 24px;border-radius:16px;background:rgba(15,23,42,0.85);border:1px solid rgba(148,163,184,0.2);">
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#fff;">${safeTitle}</p>
    <p style="margin:0 0 20px;font-size:13px;color:#94a3b8;line-height:1.5;">${safeDesc}</p>
    <a href="${safeNextHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">Continue to Link</a>
  </div>
</body>
</html>`;

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
          Pragma: 'no-cache',
          Expires: '0',
          Vary: 'User-Agent',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Route visitors through passcode unlock or browser location permission & disclaimer gate
    return noCacheRedirect(new URL(nextPath, req.url));
  } catch (err) {
    console.error('Redirection error:', err);
    const codeParam = /^[a-zA-Z0-9_-]{3,32}$/.test(shortCodeForError)
      ? `&code=${encodeURIComponent(shortCodeForError)}`
      : '';
    return noCacheRedirect(new URL(`/link-status?status=error${codeParam}`, req.url));
  }
}
