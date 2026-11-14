import { NextRequest, NextResponse } from 'next/server';

interface EdgeRateEntry {
  count: number;
  resetAt: number;
}

const edgeRateStore = new Map<string, EdgeRateEntry>();
const MAX_STORE_ENTRIES = 10000;
const MAX_JSON_BODY_BYTES = 64 * 1024; // 64 KB hard ceiling for API JSON payloads

const BLOCKED_SCANNER_UA =
  /\b(sqlmap|nikto|nessus|masscan|zgrab|gobuster|dirbuster|wfuzz|ffuf|nuclei|acunetix|netsparker|havij)\b/i;

function getEdgeClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
}

function checkEdgeRate(key: string, maxRequests: number, windowMs: number): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();

  // Bound memory in long-lived isolates
  if (edgeRateStore.size > MAX_STORE_ENTRIES) {
    for (const [k, entry] of edgeRateStore.entries()) {
      if (entry.resetAt < now) {
        edgeRateStore.delete(k);
      }
    }
    if (edgeRateStore.size > MAX_STORE_ENTRIES) {
      edgeRateStore.clear();
    }
  }

  const existing = edgeRateStore.get(key);
  if (!existing || existing.resetAt < now) {
    edgeRateStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ua = req.headers.get('user-agent') || '';

  // 1. Block known automated vulnerability/directory scanners at the edge
  if (ua && BLOCKED_SCANNER_UA.test(ua)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isApi = pathname.startsWith('/api/');
  const isRedirect = pathname.startsWith('/r/');

  // 2. Strict HTTP method allowlisting
  if (isRedirect && req.method !== 'GET' && req.method !== 'HEAD') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (
    isApi &&
    !['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(req.method)
  ) {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // 3. Reject oversized JSON payloads before hitting route handlers
  if (isApi && (req.method === 'POST' || req.method === 'PATCH')) {
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader) {
      const bytes = Number(contentLengthHeader);
      if (!Number.isNaN(bytes) && bytes > MAX_JSON_BODY_BYTES) {
        return NextResponse.json(
          { error: 'Request payload exceeds maximum allowed size (64 KB)' },
          { status: 413 }
        );
      }
    }
  }

  // 4. Edge burst rate limiter (absorbs L7 floods before invoking Firestore)
  const ip = getEdgeClientIp(req);
  const limit = isRedirect ? 120 : 180;
  const bucket = `${isRedirect ? 'r' : 'api'}:${ip}`;
  const rate = checkEdgeRate(bucket, limit, 60 * 1000);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down and try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSec),
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
        },
      }
    );
  }

  const res = NextResponse.next();
  if (isApi || isRedirect) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return res;
}

export const config = {
  matcher: ['/api/:path*', '/r/:path*'],
};
