import type { LinkRecord } from './db';
import { extractDestinationBrand, extractYouTubeVideoId } from './domain-brand';
import { validateSafeUrl } from './security';

export interface SocialLinkPreview {
  title: string;
  description: string;
  siteName: string;
  imageUrl?: string;
  canonicalUrl?: string;
  destinationHostname?: string;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code > 31 && code < 65535 ? String.fromCharCode(code) : '';
    });
}

function extractMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']{1,500})["']`,
        'i'
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:property|name)=["']${escaped}["']`,
        'i'
      ),
    ];
    for (const re of patterns) {
      const match = html.match(re);
      if (match?.[1]) {
        const clean = decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
        if (clean) return clean;
      }
    }
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  if (!match?.[1]) return null;
  const clean = decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
  return clean || null;
}

async function fetchYouTubeOembed(
  targetUrl: string
): Promise<{ title?: string; author?: string; thumbnailUrl?: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
    const res = await fetch(endpoint, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: unknown;
      author_name?: unknown;
      thumbnail_url?: unknown;
    };
    return {
      title: typeof data.title === 'string' ? data.title.trim().slice(0, 140) : undefined,
      author:
        typeof data.author_name === 'string' ? data.author_name.trim().slice(0, 80) : undefined,
      thumbnailUrl:
        typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://')
          ? data.thumbnail_url
          : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPublicHtmlPreview(targetUrl: string): Promise<{
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
} | null> {
  const safeCheck = validateSafeUrl(targetUrl);
  if (!safeCheck.isValid || !safeCheck.normalizedUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1600);
  try {
    const res = await fetch(safeCheck.normalizedUrl, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = '';
    const decoder = new TextDecoder();
    while (html.length < 48_000) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.toLowerCase().includes('</head>')) break;
    }
    reader.cancel().catch(() => {});

    const rawTitle =
      extractMetaContent(html, ['og:title', 'twitter:title']) || extractTitleTag(html);
    const rawDesc = extractMetaContent(html, [
      'og:description',
      'twitter:description',
      'description',
    ]);
    const rawSite = extractMetaContent(html, ['og:site_name']);
    const rawImage = extractMetaContent(html, ['og:image', 'twitter:image']);

    let safeImage: string | undefined;
    if (rawImage) {
      const resolvedImage = rawImage.startsWith('//')
        ? `https:${rawImage}`
        : rawImage.startsWith('/')
          ? new URL(rawImage, safeCheck.normalizedUrl).toString()
          : rawImage;
      const imgCheck = validateSafeUrl(resolvedImage);
      if (imgCheck.isValid && imgCheck.normalizedUrl) {
        safeImage = imgCheck.normalizedUrl;
      }
    }

    return {
      title: rawTitle?.slice(0, 140),
      description: rawDesc?.slice(0, 220),
      siteName: rawSite?.slice(0, 60),
      imageUrl: safeImage,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveLinkSocialPreview(
  link: LinkRecord | null,
  requestUrl?: string
): Promise<SocialLinkPreview> {
  if (!link) {
    return {
      title: 'Shared Link Not Found',
      description: 'This link may have expired or been removed.',
      siteName: 'Shared Link',
    };
  }

  const isExpired = Boolean(link.expiresAt && new Date(link.expiresAt).getTime() < Date.now());
  if (!link.isActive || isExpired) {
    return {
      title: isExpired ? 'Link Expired' : 'Link Paused',
      description: isExpired
        ? 'This shortened link has expired.'
        : 'This shortened link has been paused by its owner.',
      siteName: 'Shared Link',
    };
  }

  let canonicalUrl: string | undefined;
  if (requestUrl) {
    try {
      const u = new URL(requestUrl);
      canonicalUrl = `${u.origin}/r/${encodeURIComponent(link.shortCode)}`;
    } catch {
      canonicalUrl = undefined;
    }
  }

  const hasCustomTitle =
    Boolean(link.title?.trim()) &&
    link.title.trim().toLowerCase() !== 'shortened link';

  // Never leak protected destinations when passcode protection is active
  if (link.passwordHash) {
    return {
      title: hasCustomTitle ? `${link.title.trim()} · Passcode Protected` : 'Passcode Protected Link',
      description: 'Enter the passcode to open this protected destination link.',
      siteName: 'Protected Link',
      canonicalUrl,
    };
  }

  const brand = extractDestinationBrand(link.originalUrl);
  const ytVideoId = extractYouTubeVideoId(link.originalUrl);

  if (ytVideoId || brand.brandSlug === 'youtube') {
    const oembedTarget = ytVideoId
      ? `https://www.youtube.com/watch?v=${ytVideoId}`
      : link.originalUrl;
    const ytData = await fetchYouTubeOembed(oembedTarget);
    const ytImage =
      ytData?.thumbnailUrl ||
      (ytVideoId ? `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg` : undefined);
    const title = hasCustomTitle
      ? `${link.title.trim()} · ${brand.hostname}`
      : ytData?.title
        ? `${ytData.title} - YouTube`
        : `YouTube (${brand.hostname})`;
    const description = ytData?.author
      ? `${ytData.author} · Watch on ${brand.hostname}`
      : `Open YouTube link (${brand.hostname})`;

    return {
      title,
      description,
      siteName: brand.hostname,
      imageUrl: ytImage,
      canonicalUrl,
      destinationHostname: brand.hostname,
    };
  }

  const scraped = await fetchPublicHtmlPreview(link.originalUrl);
  const fallbackTitle = hasCustomTitle
    ? `${link.title.trim()} · ${brand.hostname}`
    : `${brand.displayName} (${brand.hostname})`;
  const resolvedTitle =
    hasCustomTitle
      ? `${link.title.trim()} · ${brand.hostname}`
      : scraped?.title && !/login|sign in|error|just a moment/i.test(scraped.title)
        ? `${scraped.title} · ${brand.hostname}`
        : fallbackTitle;

  const resolvedDescription =
    scraped?.description && !/log in to|create an account/i.test(scraped.description)
      ? scraped.description
      : `Open ${brand.displayName} link (${brand.hostname})`;

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    siteName: scraped?.siteName || brand.hostname,
    imageUrl: scraped?.imageUrl,
    canonicalUrl,
    destinationHostname: brand.hostname,
  };
}

export function escapeHtmlAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
