import { NextRequest, NextResponse } from 'next/server';
import {
  classifyServerError,
  getClientIp,
  hasPrototypePollution,
  isSelfRedirectLoop,
  resolveWorkspaceId,
  sanitizeText,
  sanitizeLinkForClient,
  setWorkspaceCookie,
  validateSafeUrl,
  validateSlug,
  generateRandomSlug,
  hashPassword,
} from '@/lib/security';
import {
  checkDistributedRateLimit,
  getLinksByUserId,
  getLinkByShortCode,
  createLink,
} from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const { workspaceId } = resolveWorkspaceId(req);

    if (
      !(await checkDistributedRateLimit(`get_links_ip:${clientIp}`, 180, 60 * 1000)) ||
      !(await checkDistributedRateLimit(`get_links:${workspaceId}`, 120, 60 * 1000))
    ) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before refreshing links.' },
        { status: 429 }
      );
    }

    const links = await getLinksByUserId(workspaceId);
    const res = NextResponse.json({
      links: links.map(sanitizeLinkForClient),
      workspaceId,
    });
    setWorkspaceCookie(res, workspaceId);
    return res;
  } catch (err) {
    console.error('Error fetching links:', err);
    const { status, message } = classifyServerError(err, 'Failed to retrieve links');
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const { workspaceId } = resolveWorkspaceId(req);

    // Dual IP + workspace rate limiting prevents abuse in zero-login mode
    const [ipAllowed, wsAllowed] = await Promise.all([
      checkDistributedRateLimit(`create_link_ip:${clientIp}`, 25, 60 * 1000),
      checkDistributedRateLimit(`create_link:${workspaceId}`, 30, 60 * 1000),
    ]);
    if (!ipAllowed || !wsAllowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before creating more links.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    if (hasPrototypePollution(body)) {
      return NextResponse.json({ error: 'Malformed request payload' }, { status: 400 });
    }

    const {
      originalUrl,
      customSlug,
      title,
      tags,
      password,
      expiresAt,
      requireGps,
      gpsMaxAccuracyMeters,
      gpsStrictMode,
    } = body;

    // Validate destination URL strictly against SSRF, javascript: schemes, local network addresses, and credential phishing
    const urlValidation = validateSafeUrl(originalUrl);
    if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
      return NextResponse.json(
        { error: urlValidation.error || 'Invalid destination URL' },
        { status: 400 }
      );
    }

    // Prevent accidental redirect loops back to LinkPulse's own domain
    const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (isSelfRedirectLoop(urlValidation.normalizedUrl, requestHost)) {
      return NextResponse.json(
        {
          error:
            'Destination URL points back to this LinkPulse website. Please enter the external target website URL you want to shorten.',
        },
        { status: 400 }
      );
    }

    // Determine short code
    let finalSlug = '';
    if (customSlug && typeof customSlug === 'string' && customSlug.trim()) {
      const slugValidation = validateSlug(customSlug.trim());
      if (!slugValidation.isValid) {
        return NextResponse.json({ error: slugValidation.error }, { status: 400 });
      }

      const existing = await getLinkByShortCode(customSlug.trim());
      if (existing) {
        return NextResponse.json(
          { error: `The alias "${customSlug.trim()}" is already taken. Please choose another.` },
          { status: 409 }
        );
      }
      finalSlug = customSlug.trim();
    } else {
      let attempts = 0;
      do {
        finalSlug = generateRandomSlug(6);
        attempts++;
      } while ((await getLinkByShortCode(finalSlug)) && attempts < 10);

      if (attempts >= 10) {
        finalSlug = generateRandomSlug(8);
      }
    }

    // Optional password protection
    let passwordHash: string | null = null;
    if (password !== undefined && password !== null) {
      if (typeof password !== 'string') {
        return NextResponse.json({ error: 'Invalid passcode format' }, { status: 400 });
      }
      if (password.trim().length > 0) {
        if (password.trim().length < 4 || password.trim().length > 128) {
          return NextResponse.json(
            { error: 'Link passcode must be between 4 and 128 characters' },
            { status: 400 }
          );
        }
        passwordHash = await hashPassword(password.trim());
      }
    }

    // Sanitize title and tags to prevent stored XSS
    const safeTitle = title ? sanitizeText(title, 120) : undefined;
    const safeTags = Array.isArray(tags)
      ? tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => sanitizeText(t, 32).toLowerCase().replace(/[^a-z0-9_.-]/g, ''))
          .filter(Boolean)
          .slice(0, 10)
      : undefined;

    // Optional expiration validation
    let validExpiresAt: string | null = null;
    if (expiresAt) {
      const parsedDate = new Date(expiresAt);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getTime() > Date.now()) {
        validExpiresAt = parsedDate.toISOString();
      }
    }

    // Optional high-accuracy GPS verification settings
    const enableGps = Boolean(requireGps);
    const parsedMaxAcc =
      typeof gpsMaxAccuracyMeters === 'number' && Number.isFinite(gpsMaxAccuracyMeters)
        ? Math.min(1000, Math.max(0.1, Math.round(gpsMaxAccuracyMeters * 100) / 100))
        : 1;
    const enableStrictGps = enableGps && Boolean(gpsStrictMode);

    const newLink = await createLink({
      userId: workspaceId,
      originalUrl: urlValidation.normalizedUrl,
      shortCode: finalSlug,
      title: safeTitle || undefined,
      tags: safeTags,
      passwordHash,
      requireGps: enableGps,
      gpsMaxAccuracyMeters: parsedMaxAcc,
      gpsStrictMode: enableStrictGps,
      expiresAt: validExpiresAt,
    });

    const res = NextResponse.json({
      success: true,
      link: sanitizeLinkForClient(newLink),
      workspaceId,
    });
    setWorkspaceCookie(res, workspaceId);
    return res;
  } catch (err) {
    console.error('Error creating link:', err);
    const { status, message } = classifyServerError(
      err,
      'Internal server error while shortening link'
    );
    return NextResponse.json({ error: message }, { status });
  }
}
