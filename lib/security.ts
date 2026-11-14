import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

const JWT_EXPIRES_IN = '7d';
export const AUTH_COOKIE_NAME = 'lp_session';
export const WORKSPACE_COOKIE_NAME = 'lp_workspace';
export const WORKSPACE_HEADER_NAME = 'x-workspace-id';
export const ANONYMOUS_USER_PREFIX = 'AnonymousUser-';
export const WORKSPACE_ID_PATTERN = /^(?:AnonymousUser-[a-zA-Z0-9]{16,48}|ws_[a-f0-9]{32})$/;

// Valid bcrypt hash used for constant-time dummy verification on unknown usernames
export const DUMMY_BCRYPT_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.1Y0s8W3pK7Z8n4W1X7u5f5p6g7h8i9q';

const globalForSecret = globalThis as unknown as { __lpJwtSecret?: string };

export class VercelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VercelConfigError';
  }
}

export function isVercelConfigError(err: unknown): err is VercelConfigError {
  return err instanceof VercelConfigError || (err instanceof Error && err.name === 'VercelConfigError');
}

function isVercelOrProd(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function getJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32) {
    return process.env.JWT_SECRET.trim();
  }

  // Never allow ephemeral or filesystem-persisted secrets on Vercel serverless functions
  if (isVercelOrProd()) {
    throw new VercelConfigError(
      'Server configuration incomplete on Vercel: add JWT_SECRET (min 32 chars) in Vercel Project Settings -> Environment Variables.'
    );
  }

  if (globalForSecret.__lpJwtSecret) {
    return globalForSecret.__lpJwtSecret;
  }

  const dataDir = path.join(process.cwd(), '.data');
  const secretFile = path.join(dataDir, '.jwt_secret');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf-8').trim();
      if (stored.length >= 64) {
        globalForSecret.__lpJwtSecret = stored;
        return stored;
      }
    }
    const generated = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf-8', mode: 0o600 });
    globalForSecret.__lpJwtSecret = generated;
    return generated;
  } catch {
    const ephemeral = crypto.randomBytes(64).toString('hex');
    globalForSecret.__lpJwtSecret = ephemeral;
    return ephemeral;
  }
}

export function sanitizeLinkForClient<
  T extends { passwordHash?: string | null }
>(link: T): Omit<T, 'passwordHash'> & { hasPassword: boolean } {
  const { passwordHash, ...rest } = link;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash),
  };
}

export interface TokenPayload {
  userId: string;
  username: string;
}

// In-memory sliding rate limiter to prevent brute-force attacks and abuse
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up stale rate limit entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (record.resetTime < now) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

/**
 * Check if an action is within rate limits.
 * Returns true if allowed, false if limit exceeded.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = rateLimitMap.get(key);

  if (!existing || existing.resetTime < now) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (existing.count >= maxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}

/**
 * Extract client IP cleanly from forwarding headers
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

/**
 * Strip ASCII control chars and HTML/script delimiters to neutralize stored XSS payloads.
 */
export function sanitizeText(value: unknown, maxLength = 120): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[<>"'`\\]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Guard against JSON prototype pollution keys (__proto__, constructor, prototype)
 */
export function hasPrototypePollution(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (dangerous.has(key)) return true;
  }
  return false;
}

export interface ValidatedGpsReading {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  altitudeMeters: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  samplesCount: number;
}

/**
 * Validate browser/GNSS geolocation coordinates strictly on the server without altering true accuracy.
 */
export function validateGpsReading(raw: unknown): {
  isValid: boolean;
  error?: string;
  reading?: ValidatedGpsReading;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, error: 'GPS payload must be a valid object' };
  }
  if (hasPrototypePollution(raw)) {
    return { isValid: false, error: 'Malformed GPS payload' };
  }

  const data = raw as Record<string, unknown>;
  const lat = data.latitude;
  const lng = data.longitude;
  const acc = data.accuracyMeters;

  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { isValid: false, error: 'Invalid latitude coordinate (-90 to 90 expected)' };
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { isValid: false, error: 'Invalid longitude coordinate (-180 to 180 expected)' };
  }
  if (typeof acc !== 'number' || !Number.isFinite(acc) || acc < 0.01 || acc > 100000) {
    return { isValid: false, error: 'Invalid GPS accuracy radius in meters' };
  }

  let altitudeMeters: number | null = null;
  if (typeof data.altitudeMeters === 'number' && Number.isFinite(data.altitudeMeters)) {
    if (data.altitudeMeters >= -500 && data.altitudeMeters <= 100000) {
      altitudeMeters = Math.round(data.altitudeMeters * 100) / 100;
    }
  }

  let headingDeg: number | null = null;
  if (typeof data.headingDeg === 'number' && Number.isFinite(data.headingDeg)) {
    if (data.headingDeg >= 0 && data.headingDeg <= 360) {
      headingDeg = Math.round(data.headingDeg * 100) / 100;
    }
  }

  let speedMps: number | null = null;
  if (typeof data.speedMps === 'number' && Number.isFinite(data.speedMps)) {
    if (data.speedMps >= 0 && data.speedMps <= 1000) {
      speedMps = Math.round(data.speedMps * 100) / 100;
    }
  }

  let samplesCount = 1;
  if (typeof data.samplesCount === 'number' && Number.isInteger(data.samplesCount)) {
    samplesCount = Math.min(100, Math.max(1, data.samplesCount));
  }

  return {
    isValid: true,
    reading: {
      // 7 decimal places = ~1.1 cm resolution
      latitude: Math.round(lat * 1e7) / 1e7,
      longitude: Math.round(lng * 1e7) / 1e7,
      accuracyMeters: Math.round(acc * 100) / 100,
      altitudeMeters,
      headingDeg,
      speedMps,
      samplesCount,
    },
  };
}

/**
 * Hash password securely using bcrypt with 12 salt rounds
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Compare plain text password with stored bcrypt hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Create a signed HS256 JWT token
 */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verify and decode HS256 JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof (decoded as TokenPayload).userId === 'string' &&
      typeof (decoded as TokenPayload).username === 'string'
    ) {
      return decoded as TokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract authenticated user from Authorization header or NextRequest cookie
 */
export function getAuthUser(req: NextRequest): TokenPayload | null {
  // 1. Check Authorization Bearer header (critical for iframe contexts where 3P cookies are partitioned/blocked)
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      const verified = verifyToken(token);
      if (verified) return verified;
    }
  }

  // 2. Check HTTP cookie
  const cookieToken = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) {
    const verified = verifyToken(cookieToken);
    if (verified) return verified;
  }

  return null;
}

/**
 * Set Session Cookie on response
 */
export function setAuthCookie(res: NextResponse, token: string): void {
  const onVercel = isVercelOrProd();
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: onVercel ? 'lax' : 'none',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    path: '/',
  });
}

/**
 * Clear Session Cookie
 */
export function clearAuthCookie(res: NextResponse): void {
  const onVercel = isVercelOrProd();
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: onVercel ? 'lax' : 'none',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Read a strictly validated 128-bit opaque workspace identifier from header or cookie.
 */
export function getExistingWorkspaceId(req: NextRequest): string | null {
  const headerId = req.headers.get(WORKSPACE_HEADER_NAME)?.trim();
  if (headerId && WORKSPACE_ID_PATTERN.test(headerId)) {
    return headerId;
  }

  const cookieId = req.cookies.get(WORKSPACE_COOKIE_NAME)?.value?.trim();
  if (cookieId && WORKSPACE_ID_PATTERN.test(cookieId)) {
    return cookieId;
  }

  return null;
}

/**
 * Resolve an existing workspace ID or mint a new 128-bit cryptographic workspace ID
 * so any visitor can use LinkPulse immediately with isolated link/telemetry storage.
 */
export function resolveWorkspaceId(req: NextRequest): { workspaceId: string; isNew: boolean } {
  const existing = getExistingWorkspaceId(req);
  if (existing) {
    return { workspaceId: existing, isNew: false };
  }
  const generated = `${ANONYMOUS_USER_PREFIX}${crypto.randomBytes(12).toString('hex')}`;
  return { workspaceId: generated, isNew: true };
}

/**
 * Persist workspace cookie & echo header so browser/iframe clients stay synchronized.
 */
export function setWorkspaceCookie(res: NextResponse, workspaceId: string): void {
  const onVercel = isVercelOrProd();
  res.headers.set('X-Workspace-Id', workspaceId);
  res.cookies.set({
    name: WORKSPACE_COOKIE_NAME,
    value: workspaceId,
    httpOnly: true,
    secure: true,
    sameSite: onVercel ? 'lax' : 'none',
    maxAge: 365 * 24 * 60 * 60,
    path: '/',
  });
}

const BLOCKED_INTERNAL_PORTS = new Set([
  '21', '22', '23', '25', '53', '110', '111', '135', '139', '143',
  '445', '1433', '1521', '2049', '3306', '3389', '5432', '5900',
  '6379', '9200', '11211', '27017',
]);

/**
 * Rigorous URL validation to prevent:
 * 1. Protocol exploitation (javascript:, data:, vbscript:, file:, blob:)
 * 2. SSRF attacks on internal infrastructure, integer/hex/octal IP bypasses, or unsafe service ports
 * 3. Credential-in-URL phishing (https://trusted.com@evil.com) and CRLF injection
 */
export function validateSafeUrl(urlString: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  if (!urlString || typeof urlString !== 'string') {
    return { isValid: false, error: 'URL must not be empty' };
  }

  if (/[\x00-\x1F\x7F]/.test(urlString)) {
    return { isValid: false, error: 'URL contains forbidden control characters' };
  }

  const trimmed = urlString.trim();
  if (trimmed.length > 2048) {
    return { isValid: false, error: 'URL exceeds maximum length of 2048 characters' };
  }

  // Block dangerous schemes explicitly before auto-prepending https://
  if (/^(javascript|data|vbscript|file|blob|ftp|ws|wss):/i.test(trimmed)) {
    return { isValid: false, error: 'Only http:// and https:// URLs are permitted' };
  }

  // Auto-prepend https:// if protocol is omitted by user
  let fullUrl = trimmed;
  if (!/^https?:\/\//i.test(fullUrl)) {
    fullUrl = `https://${fullUrl}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(fullUrl);
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Only http:// and https:// URLs are permitted' };
  }

  // Reject embedded credentials (e.g. https://trusted.com@attacker.com)
  if (parsed.username || parsed.password) {
    return { isValid: false, error: 'URLs containing embedded credentials (@) are blocked for phishing protection' };
  }

  if (parsed.port && BLOCKED_INTERNAL_PORTS.has(parsed.port)) {
    return { isValid: false, error: 'Target port is restricted for security' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || !hostname.includes('.')) {
    return { isValid: false, error: 'Destination must be a valid public domain name' };
  }

  // Reject integer/hex/octal obfuscated IPv4 addresses (e.g., 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname) || /(^|\.)0[0-7]{1,3}(\.|$)/.test(hostname)) {
    return { isValid: false, error: 'Obfuscated numeric hostnames are not permitted' };
  }

  // Block internal DNS suffixes
  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.arpa')
  ) {
    return { isValid: false, error: 'Internal network hostnames are blocked for security' };
  }

  // SSRF Protection: Reject localhost, loopback, private RFC 1918 subnets, link-local, broadcast
  const privateSubnetPatterns = [
    /^localhost$/i,
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,  // 10.0.0.0/8
    /^192\.168\.\d{1,3}\.\d{1,3}$/,     // 192.168.0.0/16
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
    /^169\.254\.\d{1,3}\.\d{1,3}$/,    // 169.254.0.0/16
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/, // CGNAT 100.64.0.0/10
    /^0\.0\.0\.0$/,
    /^\[?::1\]?$/,                      // IPv6 loopback
    /^\[?::\]?$/,                       // IPv6 unspecified
    /^\[?::ffff:/i,                     // IPv4-mapped IPv6
    /^\[?fe80:/i,                       // IPv6 link-local
    /^\[?fc00:/i,                       // IPv6 unique local
    /^\[?fd[0-9a-f]{2}:/i,              // IPv6 ULA
  ];

  for (const pattern of privateSubnetPatterns) {
    if (pattern.test(hostname)) {
      return { isValid: false, error: 'Access to local and private network addresses is forbidden for security' };
    }
  }

  // Reject metadata endpoints common in cloud environments (e.g. 169.254.169.254)
  if (
    hostname.includes('169.254.169.254') ||
    hostname.includes('metadata.google.internal') ||
    hostname.includes('metadata.aws')
  ) {
    return { isValid: false, error: 'Cloud metadata targets are strictly blocked' };
  }

  return { isValid: true, normalizedUrl: parsed.toString() };
}

/**
 * Validate Short Code / Custom Slug
 * Must be 3 to 32 alphanumeric characters, dashes, or underscores.
 */
export function validateSlug(slug: string): { isValid: boolean; error?: string } {
  if (!slug || typeof slug !== 'string') {
    return { isValid: false, error: 'Short code is required' };
  }

  const clean = slug.trim();
  if (clean.length < 3 || clean.length > 32) {
    return { isValid: false, error: 'Short code must be between 3 and 32 characters' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
    return { isValid: false, error: 'Short code can only contain letters, numbers, hyphens, and underscores' };
  }

  // Reserved keywords to prevent overriding application routes
  const reservedSlugs = new Set([
    'api', 'auth', 'login', 'signup', 'dashboard', 'settings', 'r', 's', 'links', 'analytics',
    'unlock', 'link-status', 'favicon.ico', '_next', 'static', 'images', 'public', 'admin',
    'help', 'terms', 'privacy', 'robots.txt', 'sitemap.xml',
  ]);

  if (reservedSlugs.has(clean.toLowerCase())) {
    return { isValid: false, error: `The custom alias "${clean}" is reserved for system use` };
  }

  return { isValid: true };
}

/**
 * Generate cryptographically random short slug (6-7 chars base62)
 */
export function generateRandomSlug(length = 6): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Unambiguous chars
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'security',
  'linkpulse', 'moderator', 'staff', 'api', 'auth', 'null', 'undefined',
]);

/**
 * Validate Username format & block reserved system names
 */
export function validateUsername(username: string): { isValid: boolean; error?: string } {
  if (!username || typeof username !== 'string') {
    return { isValid: false, error: 'Username is required' };
  }

  const clean = username.trim();
  if (clean.length < 3 || clean.length > 24) {
    return { isValid: false, error: 'Username must be between 3 and 24 characters' };
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(clean)) {
    return { isValid: false, error: 'Username can only contain alphanumeric characters, hyphens, underscores, and dots' };
  }

  if (RESERVED_USERNAMES.has(clean.toLowerCase())) {
    return { isValid: false, error: `The username "${clean}" is reserved for system security` };
  }

  return { isValid: true };
}

const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'admin123', 'letmein1', 'welcome1', 'iloveyou1', 'changeme1',
]);

/**
 * Validate Password strength
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long' };
  }

  if (password.length > 128) {
    return { isValid: false, error: 'Password exceeds maximum length of 128 characters' };
  }

  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return { isValid: false, error: 'Password is too common. Please choose a stronger password.' };
  }

  if (!/[a-zA-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one letter' };
  }

  // Check for at least one number or special character
  if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one digit or symbol' };
  }

  return { isValid: true };
}

/**
 * Prevent short links from pointing back to the active LinkPulse host (redirect loops).
 */
export function isSelfRedirectLoop(normalizedUrl: string, requestHost: string | null): boolean {
  if (!normalizedUrl || !requestHost) return false;
  try {
    const parsed = new URL(normalizedUrl);
    const targetHostname = parsed.hostname.toLowerCase();

    const firstHost = requestHost.split(',')[0]?.trim().toLowerCase() || '';
    if (!firstHost) return false;

    const reqHostname = firstHost.startsWith('[')
      ? firstHost.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1')
      : firstHost.split(':')[0];

    if (!reqHostname) return false;
    return targetHostname === reqHostname;
  } catch {
    return false;
  }
}

/**
 * Classify server-side errors into safe HTTP status codes and user-facing messages
 * without leaking internal stack traces or credentials.
 */
export function classifyServerError(
  err: unknown,
  fallbackMessage: string
): { status: number; message: string } {
  if (isVercelConfigError(err)) {
    return {
      status: 503,
      message: err.message,
    };
  }

  if (err instanceof SyntaxError) {
    return {
      status: 400,
      message: 'Malformed JSON request payload',
    };
  }

  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (code === 8 || code === 'resource-exhausted') {
      return {
        status: 429,
        message: 'Database rate quota temporarily exceeded. Please try again shortly.',
      };
    }
    if (code === 5 || code === 'not-found') {
      return {
        status: 503,
        message:
          'Firestore database not found. Verify FIRESTORE_DATABASE_ID and FIREBASE_SERVICE_ACCOUNT_JSON match your Firebase project.',
      };
    }
    if (
      code === 7 ||
      code === 16 ||
      code === 14 ||
      code === 'permission-denied' ||
      code === 'unauthenticated' ||
      code === 'unavailable'
    ) {
      return {
        status: 503,
        message:
          'Database service temporarily unavailable or misconfigured. Verify Firebase Admin credentials and Firestore IAM permissions.',
      };
    }
  }

  return {
    status: 500,
    message: fallbackMessage,
  };
}
