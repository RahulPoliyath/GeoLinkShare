import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getClientIp } from '@/lib/security';
import { checkDistributedRateLimit } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!(await checkDistributedRateLimit(`qrcode:${ip}`, 60, 60 * 1000))) {
      return NextResponse.json({ error: 'Rate limit exceeded for QR generation' }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const text = searchParams.get('text');

    if (!text || text.length > 2048) {
      return NextResponse.json({ error: 'Valid text parameter (max 2048 chars) is required' }, { status: 400 });
    }

    // Strict protocol validation: only encode http:// or https:// URLs in QR codes
    let parsed: URL;
    try {
      parsed = new URL(text.trim());
    } catch {
      return NextResponse.json({ error: 'QR code content must be a valid http/https URL' }, { status: 400 });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http:// and https:// URLs are permitted in QR codes' }, { status: 400 });
    }

    // Generate high-resolution QR data URL
    const qrDataUrl = await QRCode.toDataURL(parsed.toString(), {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return NextResponse.json({ success: true, qrDataUrl });
  } catch (err) {
    console.error('QR code generation error:', err);
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 });
  }
}
