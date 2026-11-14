import { NextRequest, NextResponse } from 'next/server';
import {
  classifyServerError,
  getClientIp,
  getExistingWorkspaceId,
  hashPassword,
  hasPrototypePollution,
  sanitizeLinkForClient,
  sanitizeText,
} from '@/lib/security';
import {
  checkDistributedRateLimit,
  getLinkById,
  updateLink,
  deleteLink,
} from '@/lib/db';

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = getExistingWorkspaceId(req);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Link not found or access denied' }, { status: 404 });
    }

    const clientIp = getClientIp(req);
    if (
      !(await checkDistributedRateLimit(`link_rw_ip:${clientIp}`, 90, 60 * 1000)) ||
      !(await checkDistributedRateLimit(`link_rw:${workspaceId}`, 60, 60 * 1000))
    ) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { id } = await params;
    if (!ID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Invalid link identifier' }, { status: 400 });
    }

    const link = await getLinkById(id, workspaceId);
    if (!link) {
      return NextResponse.json({ error: 'Link not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ link: sanitizeLinkForClient(link) });
  } catch (err) {
    console.error('Error fetching link:', err);
    const { status, message } = classifyServerError(err, 'Failed to retrieve link');
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = getExistingWorkspaceId(req);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Link not found or access denied' }, { status: 404 });
    }

    const clientIp = getClientIp(req);
    if (
      !(await checkDistributedRateLimit(`link_rw_ip:${clientIp}`, 90, 60 * 1000)) ||
      !(await checkDistributedRateLimit(`link_rw:${workspaceId}`, 60, 60 * 1000))
    ) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { id } = await params;
    if (!ID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Invalid link identifier' }, { status: 400 });
    }

    const body = await req.json();
    if (hasPrototypePollution(body)) {
      return NextResponse.json({ error: 'Malformed request payload' }, { status: 400 });
    }

    const {
      title,
      tags,
      isActive,
      password,
      removePassword,
      expiresAt,
      requireGps,
      gpsMaxAccuracyMeters,
      gpsStrictMode,
    } = body;

    const existing = await getLinkById(id, workspaceId);
    if (!existing) {
      return NextResponse.json({ error: 'Link not found or access denied' }, { status: 404 });
    }

    let passwordHash: string | null | undefined = undefined;
    if (removePassword) {
      passwordHash = null;
    } else if (password && typeof password === 'string' && password.trim().length > 0) {
      if (password.trim().length < 4 || password.trim().length > 128) {
        return NextResponse.json(
          { error: 'Passcode must be between 4 and 128 characters' },
          { status: 400 }
        );
      }
      passwordHash = await hashPassword(password.trim());
    }

    const safeTitle = typeof title === 'string' ? sanitizeText(title, 120) : undefined;
    const safeTags = Array.isArray(tags)
      ? tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => sanitizeText(t, 32).toLowerCase().replace(/[^a-z0-9_.-]/g, ''))
          .filter(Boolean)
          .slice(0, 10)
      : undefined;

    const updated = await updateLink(id, workspaceId, {
      title: safeTitle,
      tags: safeTags,
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
      passwordHash,
      requireGps: typeof requireGps === 'boolean' ? requireGps : undefined,
      gpsMaxAccuracyMeters:
        typeof gpsMaxAccuracyMeters === 'number' && Number.isFinite(gpsMaxAccuracyMeters)
          ? Math.min(1000, Math.max(0.1, Math.round(gpsMaxAccuracyMeters * 100) / 100))
          : undefined,
      gpsStrictMode: typeof gpsStrictMode === 'boolean' ? gpsStrictMode : undefined,
      expiresAt: expiresAt !== undefined ? expiresAt : undefined,
    });

    return NextResponse.json({
      success: true,
      link: updated ? sanitizeLinkForClient(updated) : null,
    });
  } catch (err) {
    console.error('Error updating link:', err);
    const { status, message } = classifyServerError(err, 'Failed to update link');
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = getExistingWorkspaceId(req);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Link not found or access denied' }, { status: 404 });
    }

    const clientIp = getClientIp(req);
    if (
      !(await checkDistributedRateLimit(`link_rw_ip:${clientIp}`, 90, 60 * 1000)) ||
      !(await checkDistributedRateLimit(`link_rw:${workspaceId}`, 60, 60 * 1000))
    ) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { id } = await params;
    if (!ID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Invalid link identifier' }, { status: 400 });
    }

    const success = await deleteLink(id, workspaceId);
    if (!success) {
      return NextResponse.json(
        { error: 'Link not found or could not be deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting link:', err);
    const { status, message } = classifyServerError(err, 'Failed to delete link');
    return NextResponse.json({ error: message }, { status });
  }
}
