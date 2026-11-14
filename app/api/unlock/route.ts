import { NextRequest, NextResponse } from 'next/server';
import {
  checkDistributedRateLimit,
  getLinkByShortCode,
  recordClick,
} from '@/lib/db';
import {
  comparePassword,
  DUMMY_BCRYPT_HASH,
  getClientIp,
  hasPrototypePollution,
  validateGpsReading,
  validateSafeUrl,
} from '@/lib/security';
import { extractGeoData } from '@/lib/geo';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!(await checkDistributedRateLimit(`unlock_ip:${ip}`, 20, 5 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many passcode attempts. Please wait 5 minutes before trying again.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    if (hasPrototypePollution(body)) {
      return NextResponse.json({ error: 'Malformed request payload' }, { status: 400 });
    }

    const { code, password, gps } = body;

    if (typeof code !== 'string' || typeof password !== 'string' || !code.trim() || !password) {
      return NextResponse.json({ error: 'Code and password are required' }, { status: 400 });
    }

    const cleanCode = code.trim();
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanCode)) {
      return NextResponse.json({ error: 'Invalid link code' }, { status: 400 });
    }

    // Per-link brute-force rate limiter (10 tries per IP+code every 5 minutes)
    if (!(await checkDistributedRateLimit(`unlock:${ip}:${cleanCode.toLowerCase()}`, 10, 5 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many incorrect passcode attempts for this link. Try again in 5 minutes.' },
        { status: 429 }
      );
    }

    const link = await getLinkByShortCode(cleanCode);
    if (!link) {
      await comparePassword(password, DUMMY_BCRYPT_HASH);
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    if (!link.isActive) {
      return NextResponse.json({ error: 'This link has been deactivated by its owner' }, { status: 403 });
    }

    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
    }

    // Re-validate destination URL before releasing it to prevent stored open redirect tampering
    const safeDestination = validateSafeUrl(link.originalUrl);
    if (!safeDestination.isValid || !safeDestination.normalizedUrl) {
      return NextResponse.json({ error: 'Destination URL failed security verification' }, { status: 403 });
    }

    if (link.passwordHash) {
      const isMatch = await comparePassword(password, link.passwordHash);
      if (!isMatch) {
        return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
      }
    }

    // Validate high-accuracy GPS telemetry if link requires GPS (after password passes)
    let gpsReading = undefined;
    const targetMeters = link.gpsMaxAccuracyMeters ?? 1;
    let targetMet = false;

    if (link.requireGps) {
      const gpsCheck = validateGpsReading(gps);
      if (!gpsCheck.isValid || !gpsCheck.reading) {
        return NextResponse.json(
          { error: gpsCheck.error || 'High-accuracy GPS verification is required to unlock this link.' },
          { status: 400 }
        );
      }
      gpsReading = gpsCheck.reading;
      targetMet = gpsReading.accuracyMeters <= targetMeters;
      if (link.gpsStrictMode && !targetMet) {
        return NextResponse.json(
          {
            errorCode: 'GPS_ACCURACY_NOT_MET',
            error: `Strict precision gate active: achieved ±${gpsReading.accuracyMeters.toFixed(2)}m radius, but this link requires <= ${targetMeters.toFixed(2)}m.`,
            accuracyMeters: gpsReading.accuracyMeters,
            targetMeters,
          },
          { status: 422 }
        );
      }
    }

    // Password (and optional GPS) verified, record click event
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
      ...(gpsReading
        ? {
            geoSource: 'gps' as const,
            latitude: gpsReading.latitude,
            longitude: gpsReading.longitude,
            accuracyMeters: gpsReading.accuracyMeters,
            altitudeMeters: gpsReading.altitudeMeters,
            headingDeg: gpsReading.headingDeg,
            speedMps: gpsReading.speedMps,
            gpsSamplesCount: gpsReading.samplesCount,
            gpsTargetMeters: targetMeters,
            gpsTargetMet: targetMet,
          }
        : {}),
    });

    return NextResponse.json({ success: true, redirectUrl: safeDestination.normalizedUrl });
  } catch (err) {
    console.error('Unlock error:', err);
    return NextResponse.json({ error: 'Failed to process unlock request' }, { status: 500 });
  }
}
