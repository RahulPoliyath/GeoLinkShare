import { NextRequest, NextResponse } from 'next/server';
import { checkDistributedRateLimit, getLinkByShortCode, recordClick } from '@/lib/db';
import { extractGeoData } from '@/lib/geo';
import {
  getClientIp,
  hasPrototypePollution,
  validateGpsReading,
  validateSafeUrl,
} from '@/lib/security';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!(await checkDistributedRateLimit(`gps_verify:${ip}`, 45, 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many GPS verification requests. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    if (hasPrototypePollution(body)) {
      return NextResponse.json({ error: 'Malformed request payload' }, { status: 400 });
    }

    const { code, gps } = body;
    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'Short link code is required' }, { status: 400 });
    }

    const cleanCode = code.trim();
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanCode)) {
      return NextResponse.json({ error: 'Invalid short link code' }, { status: 400 });
    }

    if (!(await checkDistributedRateLimit(`gps_verify:${ip}:${cleanCode.toLowerCase()}`, 20, 60 * 1000))) {
      return NextResponse.json(
        { error: 'Rate limit reached for this link. Please wait briefly.' },
        { status: 429 }
      );
    }

    const link = await getLinkByShortCode(cleanCode);
    if (!link) {
      return NextResponse.json({ error: 'Short link not found' }, { status: 404 });
    }
    if (!link.isActive) {
      return NextResponse.json({ error: 'This link has been deactivated by its owner' }, { status: 403 });
    }
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
    }

    // If password-protected, force completion via /api/unlock instead of bypassing passcode
    if (link.passwordHash) {
      return NextResponse.json(
        { error: 'This link requires passcode authentication on the unlock page.' },
        { status: 403 }
      );
    }

    const safeDestination = validateSafeUrl(link.originalUrl);
    if (!safeDestination.isValid || !safeDestination.normalizedUrl) {
      return NextResponse.json({ error: 'Destination URL failed security verification' }, { status: 403 });
    }

    const gpsCheck = validateGpsReading(gps);
    if (!gpsCheck.isValid || !gpsCheck.reading) {
      return NextResponse.json({ error: gpsCheck.error || 'Valid GPS coordinates are required' }, { status: 400 });
    }

    const reading = gpsCheck.reading;
    const targetMeters = link.gpsMaxAccuracyMeters ?? 1;
    const targetMet = reading.accuracyMeters <= targetMeters;

    if (link.requireGps && link.gpsStrictMode && !targetMet) {
      return NextResponse.json(
        {
          errorCode: 'GPS_ACCURACY_NOT_MET',
          error: `Strict precision gate active: achieved ±${reading.accuracyMeters.toFixed(2)}m radius, but this link requires <= ${targetMeters.toFixed(2)}m (RTK/survey-grade GNSS).`,
          accuracyMeters: reading.accuracyMeters,
          targetMeters,
        },
        { status: 422 }
      );
    }

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
      geoSource: 'gps',
      latitude: reading.latitude,
      longitude: reading.longitude,
      accuracyMeters: reading.accuracyMeters,
      altitudeMeters: reading.altitudeMeters,
      headingDeg: reading.headingDeg,
      speedMps: reading.speedMps,
      gpsSamplesCount: reading.samplesCount,
      gpsTargetMeters: targetMeters,
      gpsTargetMet: targetMet,
    });

    return NextResponse.json({
      success: true,
      redirectUrl: safeDestination.normalizedUrl,
      accuracyMeters: reading.accuracyMeters,
      targetMeters,
      targetMet,
    });
  } catch (err) {
    console.error('GPS verification error:', err);
    return NextResponse.json({ error: 'Failed to process GPS verification' }, { status: 500 });
  }
}
