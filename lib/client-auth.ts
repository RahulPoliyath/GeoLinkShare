'use client';

const WORKSPACE_STORAGE_KEY = 'lp_workspace_id';
const WORKSPACE_ID_REGEX = /^ws_[a-f0-9]{32}$/;

function generateClientWorkspaceId(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `ws_${hex}`;
}

export function getOrInitWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = localStorage.getItem(WORKSPACE_STORAGE_KEY)?.trim() || '';
    if (WORKSPACE_ID_REGEX.test(existing)) {
      return existing;
    }
    const created = generateClientWorkspaceId();
    localStorage.setItem(WORKSPACE_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export function setStoredWorkspaceId(workspaceId: string): void {
  if (typeof window === 'undefined' || !WORKSPACE_ID_REGEX.test(workspaceId)) return;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  } catch (err) {
    console.error('Failed to save workspace ID to localStorage:', err);
  }
}

/**
 * Resilient fetch wrapper that sends the isolated workspace identifier via both
 * header and HttpOnly cookie so any user can create and manage links without logging in.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const workspaceId = getOrInitWorkspaceId();
  const headers = new Headers(options.headers || {});

  if (workspaceId && !headers.has('X-Workspace-Id')) {
    headers.set('X-Workspace-Id', workspaceId);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const serverWorkspaceId = res.headers.get('X-Workspace-Id')?.trim();
  if (serverWorkspaceId && WORKSPACE_ID_REGEX.test(serverWorkspaceId)) {
    setStoredWorkspaceId(serverWorkspaceId);
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
