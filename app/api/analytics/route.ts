import { NextRequest, NextResponse } from 'next/server';
import {
  classifyServerError,
  getClientIp,
  resolveWorkspaceId,
  setWorkspaceCookie,
} from '@/lib/security';
import { checkDistributedRateLimit, getAnalyticsSummary } from '@/lib/db';

const LINK_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export async function GET(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const { workspaceId } = resolveWorkspaceId(req);

    if (
      !(await checkDistributedRateLimit(`analytics_ip:${clientIp}`, 150, 60 * 1000)) ||
      !(await checkDistributedRateLimit(`analytics:${workspaceId}`, 90, 60 * 1000))
    ) {
      return NextResponse.json(
        { error: 'Analytics refresh rate limit exceeded. Please wait briefly.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawLinkId = searchParams.get('linkId');
    const linkId = rawLinkId && rawLinkId.trim() ? rawLinkId.trim() : undefined;

    if (linkId && !LINK_ID_PATTERN.test(linkId)) {
      return NextResponse.json({ error: 'Invalid link identifier' }, { status: 400 });
    }

    const summary = await getAnalyticsSummary(workspaceId, linkId);
    const res = NextResponse.json({
      success: true,
      data: summary,
      workspaceId,
      timestamp: new Date().toISOString(),
    });
    setWorkspaceCookie(res, workspaceId);
    return res;
  } catch (err) {
    console.error('Error fetching analytics:', err);
    const { status, message } = classifyServerError(err, 'Failed to retrieve analytics');
    return NextResponse.json({ error: message }, { status });
  }
}
