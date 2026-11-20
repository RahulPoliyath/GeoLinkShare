'use client';

const USER_ID_STORAGE_KEY = 'lp_user_id';
const LEGACY_WORKSPACE_KEY = 'lp_workspace_id';
const LINKS_STORAGE_PREFIX = 'lp_links_';
const ANALYTICS_STORAGE_PREFIX = 'lp_analytics_';
const TERMS_TOKEN_SESSION_KEY = 'lp_terms_signed_token';

export const TERMS_REQUIRED_EVENT = 'lp-terms-required';

let inMemoryTermsToken: string | null = null;

export const ANONYMOUS_USER_ID_REGEX = /^AnonymousUser-[a-zA-Z0-9]{16,48}$/;

export function getTermsToken(): string | null {
  if (inMemoryTermsToken) return inMemoryTermsToken;
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(TERMS_TOKEN_SESSION_KEY)?.trim() || null;
    if (stored) inMemoryTermsToken = stored;
    return stored;
  } catch {
    return null;
  }
}

export function setTermsToken(token: string): void {
  const clean = token.trim();
  if (!clean) return;
  inMemoryTermsToken = clean;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(TERMS_TOKEN_SESSION_KEY, clean);
  } catch {
    // Ignore restricted storage errors
  }
}

export function clearTermsToken(): void {
  inMemoryTermsToken = null;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(TERMS_TOKEN_SESSION_KEY);
  } catch {
    // Ignore restricted storage errors
  }
}

function generateAnonymousUserId(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `AnonymousUser-${hex}`;
}

export function getOrInitAnonymousUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = localStorage.getItem(USER_ID_STORAGE_KEY)?.trim() || '';
    if (ANONYMOUS_USER_ID_REGEX.test(existing)) {
      return existing;
    }
    const created = generateAnonymousUserId();
    localStorage.setItem(USER_ID_STORAGE_KEY, created);
    localStorage.removeItem(LEGACY_WORKSPACE_KEY);
    return created;
  } catch {
    return null;
  }
}

export function getOrInitWorkspaceId(): string | null {
  return getOrInitAnonymousUserId();
}

export function setStoredWorkspaceId(userId: string): void {
  if (typeof window === 'undefined' || !ANONYMOUS_USER_ID_REGEX.test(userId)) return;
  try {
    localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  } catch (err) {
    console.error('Failed to save user ID to localStorage:', err);
  }
}

export function loadLinksFromLocalStorage<T>(userId: string | null): T[] {
  if (typeof window === 'undefined' || !userId || !ANONYMOUS_USER_ID_REGEX.test(userId)) {
    return [];
  }
  try {
    const raw = localStorage.getItem(`${LINKS_STORAGE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function saveLinksToLocalStorage<T>(userId: string | null, links: T[]): void {
  if (typeof window === 'undefined' || !userId || !ANONYMOUS_USER_ID_REGEX.test(userId)) {
    return;
  }
  try {
    localStorage.setItem(`${LINKS_STORAGE_PREFIX}${userId}`, JSON.stringify(links));
  } catch (err) {
    console.error('Failed to persist links to localStorage:', err);
  }
}

export function loadAnalyticsFromLocalStorage<T>(
  userId: string | null,
  linkScope = 'all'
): T | null {
  if (typeof window === 'undefined' || !userId || !ANONYMOUS_USER_ID_REGEX.test(userId)) {
    return null;
  }
  try {
    const raw = localStorage.getItem(`${ANALYTICS_STORAGE_PREFIX}${userId}_${linkScope}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveAnalyticsToLocalStorage<T>(
  userId: string | null,
  linkScope: string,
  data: T
): void {
  if (typeof window === 'undefined' || !userId || !ANONYMOUS_USER_ID_REGEX.test(userId)) {
    return;
  }
  try {
    localStorage.setItem(
      `${ANALYTICS_STORAGE_PREFIX}${userId}_${linkScope}`,
      JSON.stringify(data)
    );
  } catch (err) {
    console.error('Failed to persist analytics to localStorage:', err);
  }
}

/**
 * Resilient fetch wrapper that sends the AnonymousUser-... identifier and server-signed
 * terms consent token via both header and HttpOnly cookie.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const userId = getOrInitAnonymousUserId();
  const termsToken = getTermsToken();
  const headers = new Headers(options.headers || {});

  if (userId && !headers.has('X-Workspace-Id')) {
    headers.set('X-Workspace-Id', userId);
  }
  if (termsToken && !headers.has('X-Terms-Token')) {
    headers.set('X-Terms-Token', termsToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const serverUserId = res.headers.get('X-Workspace-Id')?.trim();
  if (serverUserId && ANONYMOUS_USER_ID_REGEX.test(serverUserId)) {
    setStoredWorkspaceId(serverUserId);
  }

  if (res.status === 403 && res.headers.get('X-Terms-Required') === 'true') {
    clearTermsToken();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TERMS_REQUIRED_EVENT));
    }
  }

  return res;
}

export async function safeReadApiResponse<T = Record<string, unknown>>(
  res: Response
): Promise<{ data: T | null; parseErrorMessage: string | null }> {
  const rawText = await res.text();
  if (!rawText) {
    return {
      data: null,
      parseErrorMessage: res.ok
        ? null
        : `Server returned an empty HTTP ${res.status} response.`,
    };
  }

  try {
    return { data: JSON.parse(rawText) as T, parseErrorMessage: null };
  } catch {
    return {
      data: null,
      parseErrorMessage: `Server error (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}). Verify Vercel Environment Variables (FIREBASE_SERVICE_ACCOUNT_JSON) and deployment logs.`,
    };
  }
}
