export interface DestinationBrandInfo {
  hostname: string;
  brandSlug: string;
  displayName: string;
}

const KNOWN_PLATFORM_MAP: Array<{
  match: (host: string) => boolean;
  brandSlug: string;
  displayName: string;
}> = [
  {
    match: (h) => h === 'youtu.be' || h === 'youtube.com' || h.endsWith('.youtube.com'),
    brandSlug: 'youtube',
    displayName: 'YouTube',
  },
  {
    match: (h) => h === 'instagram.com' || h.endsWith('.instagram.com') || h === 'instagr.am',
    brandSlug: 'instagram',
    displayName: 'Instagram',
  },
  {
    match: (h) =>
      h === 'facebook.com' ||
      h.endsWith('.facebook.com') ||
      h === 'fb.watch' ||
      h === 'fb.com',
    brandSlug: 'facebook',
    displayName: 'Facebook',
  },
  {
    match: (h) => h === 'whatsapp.com' || h.endsWith('.whatsapp.com') || h === 'wa.me',
    brandSlug: 'whatsapp',
    displayName: 'WhatsApp',
  },
  {
    match: (h) =>
      h === 'x.com' ||
      h.endsWith('.x.com') ||
      h === 'twitter.com' ||
      h.endsWith('.twitter.com') ||
      h === 't.co',
    brandSlug: 'x',
    displayName: 'X',
  },
  {
    match: (h) => h === 'tiktok.com' || h.endsWith('.tiktok.com') || h === 'vm.tiktok.com',
    brandSlug: 'tiktok',
    displayName: 'TikTok',
  },
  {
    match: (h) => h === 'linkedin.com' || h.endsWith('.linkedin.com') || h === 'lnkd.in',
    brandSlug: 'linkedin',
    displayName: 'LinkedIn',
  },
  {
    match: (h) => h === 'github.com' || h.endsWith('.github.com') || h === 'gist.github.com',
    brandSlug: 'github',
    displayName: 'GitHub',
  },
  {
    match: (h) => h === 'spotify.com' || h.endsWith('.spotify.com') || h === 'spoti.fi',
    brandSlug: 'spotify',
    displayName: 'Spotify',
  },
  {
    match: (h) => h === 'reddit.com' || h.endsWith('.reddit.com') || h === 'redd.it',
    brandSlug: 'reddit',
    displayName: 'Reddit',
  },
  {
    match: (h) => h === 'snapchat.com' || h.endsWith('.snapchat.com'),
    brandSlug: 'snapchat',
    displayName: 'Snapchat',
  },
  {
    match: (h) => h === 'pinterest.com' || h.endsWith('.pinterest.com') || h === 'pin.it',
    brandSlug: 'pinterest',
    displayName: 'Pinterest',
  },
  {
    match: (h) => h === 'telegram.org' || h === 't.me' || h.endsWith('.telegram.org'),
    brandSlug: 'telegram',
    displayName: 'Telegram',
  },
  {
    match: (h) => h === 'google.com' || h.endsWith('.google.com') || h === 'goo.gl',
    brandSlug: 'google',
    displayName: 'Google',
  },
  {
    match: (h) => h === 'amazon.com' || h.startsWith('amazon.') || h === 'amzn.to',
    brandSlug: 'amazon',
    displayName: 'Amazon',
  },
];

/**
 * Extract a clean, URL-safe domain brand prefix and human display name from any destination URL
 * so generated short links visibly carry the destination domain (e.g. /r/youtube-HWm4r).
 */
export function extractDestinationBrand(urlInput: string): DestinationBrandInfo {
  const raw = (urlInput || '').trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    for (const platform of KNOWN_PLATFORM_MAP) {
      if (platform.match(hostname)) {
        return {
          hostname,
          brandSlug: platform.brandSlug,
          displayName: platform.displayName,
        };
      }
    }

    const strippedSub = hostname.replace(/^(m|mobile|l|lm|web|app)\./, '');
    const parts = strippedSub.split('.').filter(Boolean);
    const baseParts = parts.length >= 2 ? parts.slice(0, -1) : parts;
    const rawSlug = baseParts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const brandSlug = (rawSlug || 'link').slice(0, 18).replace(/-+$/g, '') || 'link';
    const primaryWord = (baseParts[0] || strippedSub || 'Link').replace(/[^a-zA-Z0-9-]/g, '');
    const displayName = primaryWord
      ? primaryWord.charAt(0).toUpperCase() + primaryWord.slice(1)
      : hostname;

    return {
      hostname,
      brandSlug,
      displayName,
    };
  } catch {
    return {
      hostname: 'link',
      brandSlug: 'link',
      displayName: 'Shared Link',
    };
  }
}

export function extractYouTubeVideoId(urlInput: string): string | null {
  try {
    const parsed = new URL(urlInput);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) return v;
      const segs = parsed.pathname.split('/').filter(Boolean);
      if (segs.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(segs[0])) {
        const id = segs[1];
        return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}
