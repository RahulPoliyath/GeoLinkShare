import { NextRequest, NextResponse } from 'next/server';
import {
  classifyServerError,
  clearTermsConsentCookie,
  getClientIp,
  hasPrototypePollution,
  issueTermsChallenge,
  issueTermsConsentToken,
  resolveWorkspaceId,
  setTermsConsentCookie,
  setWorkspaceCookie,
  verifyTermsChallenge,
  verifyTermsConsentToken,
} from '@/lib/security';
import { checkDistributedRateLimit } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const { workspaceId } = resolveWorkspaceId(req);

    if (
      !(await checkDistributedRateLimit(`terms_get_ip:${clientIp}`, 120, 60 * 1000)) ||
      !(await checkDistributedRateLimit(`terms_get:${workspaceId}`, 90, 60 * 1000))
    ) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const shouldReset = searchParams.get('reset') === '1';

    const challengeToken = issueTermsChallenge(workspaceId);
    const accepted = shouldReset ? false : verifyTermsConsentToken(req, workspaceId);

    const res = NextResponse.json({
      challengeToken,
      accepted,
      workspaceId,
    });
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    setWorkspaceCookie(res, workspaceId);

    if (shouldReset) {
      clearTermsConsentCookie(res);
    }

    return res;
  } catch (err) {
    console.error('Error issuing terms challenge:', err);
    const { status, message } = classifyServerError(err, 'Failed to initialize terms challenge');
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const { workspaceId } = resolveWorkspaceId(req);

    if (
      !(await checkDistributedRateLimit(`terms_post_ip:${clientIp}`, 60, 60 * 1000)) ||
      !(await checkDistributedRateLimit(`terms_post:${workspaceId}`, 45, 60 * 1000))
    ) {
      return NextResponse.json(
        { error: 'Too many confirmation attempts. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || hasPrototypePollution(body)) {
      return NextResponse.json({ error: 'Malformed request payload' }, { status: 400 });
    }

    const { accepted, agreedToSafeUse, challengeToken } = body as {
      accepted?: unknown;
      agreedToSafeUse?: unknown;
      challengeToken?: unknown;
    };

    if (!verifyTermsChallenge(challengeToken, workspaceId)) {
      const invalidRes = NextResponse.json(
        {
          error: 'Security challenge expired or invalid. Please reload the disclaimer and retry.',
          code: 'INVALID_CHALLENGE',
        },
        { status: 403 }
      );
      clearTermsConsentCookie(invalidRes);
      setWorkspaceCookie(invalidRes, workspaceId);
      return invalidRes;
    }

    if (accepted !== true) {
      const declineRes = NextResponse.json({
        success: true,
        accepted: false,
        workspaceId,
      });
      declineRes.headers.set('Cache-Control', 'no-store, max-age=0');
      clearTermsConsentCookie(declineRes);
      setWorkspaceCookie(declineRes, workspaceId);
      return declineRes;
    }

    if (agreedToSafeUse !== true) {
      return NextResponse.json(
        { error: 'You must acknowledge the safe-use & liability statement before continuing.' },
        { status: 400 }
      );
    }

    const termsToken = issueTermsConsentToken(workspaceId);
    const okRes = NextResponse.json({
      success: true,
      accepted: true,
      termsToken,
      workspaceId,
    });
    okRes.headers.set('Cache-Control', 'no-store, max-age=0');
    setWorkspaceCookie(okRes, workspaceId);
    setTermsConsentCookie(okRes, termsToken);
    return okRes;
  } catch (err) {
    console.error('Error processing terms consent:', err);
    const { status, message } = classifyServerError(err, 'Failed to process disclaimer consent');
    return NextResponse.json({ error: message }, { status });
  }
}
