import { NextRequest, NextResponse } from 'next/server';
import { checkDistributedRateLimit, getLinkByShortCode } from '@/lib/db';
import { getClientIp } from '@/lib/security';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const ip = getClientIp(req);
    if (!(await checkDistributedRateLimit(`pub_link:${ip}`, 120, 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429 }
      );
    }

    const { code } = await params;
    const cleanCode = (code || '').trim();
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanCode)) {
      return NextResponse.json({ error: 'Invalid short link code' }, { status: 400 });
    }

    const link = await getLinkByShortCode(cleanCode);
    if (!link) {
      return NextResponse.json({ error: 'Short link not found' }, { status: 404 });
    }

    const isExpired = Boolean(link.expiresAt && new Date(link.expiresAt).getTime() < Date.now());

    // Strictly return only public gate metadata (never expose originalUrl, passwordHash, or userId)
    return NextResponse.json({
      shortCode: link.shortCode,
      title: link.title,
      isActive: link.isActive,
      isExpired,
      hasPassword: Boolean(link.passwordHash),
      requireGps: Boolean(link.requireGps),
      gpsMaxAccuracyMeters: link.gpsMaxAccuracyMeters ?? 1,
      gpsStrictMode: Boolean(link.gpsStrictMode),
    });
  } catch (err) {
    console.error('Public link metadata error:', err);
    return NextResponse.json({ error: 'Failed to inspect link policy' }, { status: 500 });
  }
}
