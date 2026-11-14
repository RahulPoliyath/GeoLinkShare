import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { getAdminFieldValue, getAdminFirestore, isVercelRuntime } from './firebase-admin';
import {
  checkRateLimit as checkLocalRateLimit,
  sanitizeText,
  VercelConfigError,
} from './security';

export interface UserRecord {
  id: string;
  username: string;
  usernameLower?: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface LinkRecord {
  id: string;
  userId: string;
  originalUrl: string;
  shortCode: string;
  shortCodeLower?: string;
  title: string;
  tags: string[];
  isActive: boolean;
  passwordHash?: string | null;
  requireGps?: boolean;
  gpsMaxAccuracyMeters?: number;
  gpsStrictMode?: boolean;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  clicksCount: number;
}

export interface ClickRecord {
  id: string;
  linkId: string;
  shortCode: string;
  userId: string;
  timestamp: string;
  ip: string;
  countryCode: string;
  countryName: string;
  city: string;
  referrer: string;
  referrerCategory: 'direct' | 'search' | 'social' | 'website';
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet';
  geoSource?: 'ip' | 'gps';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  altitudeMeters?: number | null;
  headingDeg?: number | null;
  speedMps?: number | null;
  gpsSamplesCount?: number;
  gpsTargetMeters?: number;
  gpsTargetMet?: boolean;
}

export interface DatabaseSchema {
  users: UserRecord[];
  links: LinkRecord[];
  clicks: ClickRecord[];
}

const DEMO_USER_ID = 'usr_demo_882910';
const USERS_COLLECTION = 'app_users';
const LINKS_COLLECTION = 'app_links';
const CLICKS_COLLECTION = 'app_clicks';
const RATE_LIMITS_COLLECTION = 'app_rate_limits';

// ================= RUNTIME BACKEND SELECTION =================

async function resolveFirestore(): Promise<Firestore | null> {
  const firestore = await getAdminFirestore();
  if (firestore) return firestore;

  if (isVercelRuntime()) {
    throw new VercelConfigError(
      'Server database not configured on Vercel: add FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) in Vercel Project Settings -> Environment Variables.'
    );
  }

  return null;
}

// ================= LOCAL DEV FALLBACK (NON-VERCEL ONLY) =================

const globalForDb = globalThis as unknown as {
  __lpLocalDb?: DatabaseSchema | null;
  __lpDemoSeeded?: Promise<void> | null;
};

function getLocalDbPath(): string {
  const cwdData = path.join(process.cwd(), '.data');
  try {
    if (!fs.existsSync(cwdData)) {
      fs.mkdirSync(cwdData, { recursive: true });
    }
    return path.join(cwdData, 'db.json');
  } catch {
    const tmpData = path.join('/tmp', '.data');
    if (!fs.existsSync(tmpData)) {
      fs.mkdirSync(tmpData, { recursive: true });
    }
    return path.join(tmpData, 'db.json');
  }
}

function loadLocalDatabase(): DatabaseSchema {
  if (globalForDb.__lpLocalDb) return globalForDb.__lpLocalDb;

  const dbFile = getLocalDbPath();
  try {
    if (fs.existsSync(dbFile)) {
      const raw = fs.readFileSync(dbFile, 'utf-8');
      globalForDb.__lpLocalDb = JSON.parse(raw) as DatabaseSchema;
      return globalForDb.__lpLocalDb;
    }
  } catch (err) {
    console.error('Error loading local database file, re-initializing:', err);
  }

  const seeded = buildDemoSeedData();
  globalForDb.__lpLocalDb = seeded;
  saveLocalDatabase(seeded);
  return seeded;
}

function saveLocalDatabase(data: DatabaseSchema): void {
  try {
    const dbFile = getLocalDbPath();
    const tmpFile = `${dbFile}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, dbFile);
    globalForDb.__lpLocalDb = data;
  } catch (err) {
    console.error('Failed to save local database:', err);
  }
}

/**
 * Build initial demo workspace data using a random runtime password hash (zero hardcoded passwords).
 */
function buildDemoSeedData(): DatabaseSchema {
  const randomSecret = crypto.randomBytes(32).toString('hex');
  const demoPasswordHash = bcrypt.hashSync(randomSecret, 10);

  const demoUser: UserRecord = {
    id: DEMO_USER_ID,
    username: 'demo_user',
    usernameLower: 'demo_user',
    passwordHash: demoPasswordHash,
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const initialLinks: LinkRecord[] = [
    {
      id: 'lnk_101',
      userId: DEMO_USER_ID,
      originalUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
      shortCode: 'js-docs',
      shortCodeLower: 'js-docs',
      title: 'MDN Web Docs - JavaScript Guide',
      tags: ['dev', 'reference', 'learning'],
      isActive: true,
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      clicksCount: 142,
    },
    {
      id: 'lnk_102',
      userId: DEMO_USER_ID,
      originalUrl: 'https://github.com/trending',
      shortCode: 'gh-trends',
      shortCodeLower: 'gh-trends',
      title: 'GitHub Trending Repositories',
      tags: ['opensource', 'trending', 'github'],
      isActive: true,
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      clicksCount: 88,
    },
    {
      id: 'lnk_103',
      userId: DEMO_USER_ID,
      originalUrl: 'https://news.ycombinator.com',
      shortCode: 'hn-front',
      shortCodeLower: 'hn-front',
      title: 'Hacker News Frontpage',
      tags: ['news', 'tech'],
      isActive: true,
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      clicksCount: 64,
    },
    {
      id: 'lnk_104',
      userId: DEMO_USER_ID,
      originalUrl: 'https://en.wikipedia.org/wiki/Computer_security',
      shortCode: 'cybersec',
      shortCodeLower: 'cybersec',
      title: 'Cybersecurity Fundamentals & Architecture',
      tags: ['security', 'knowledge'],
      isActive: true,
      passwordHash: null,
      expiresAt: null,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      clicksCount: 35,
    },
  ];

  const countries = [
    { code: 'US', name: 'United States', city: 'San Francisco' },
    { code: 'US', name: 'United States', city: 'New York' },
    { code: 'GB', name: 'United Kingdom', city: 'London' },
    { code: 'DE', name: 'Germany', city: 'Berlin' },
    { code: 'JP', name: 'Japan', city: 'Tokyo' },
    { code: 'FR', name: 'France', city: 'Paris' },
    { code: 'CA', name: 'Canada', city: 'Toronto' },
    { code: 'IN', name: 'India', city: 'Bengaluru' },
    { code: 'AU', name: 'Australia', city: 'Sydney' },
    { code: 'SG', name: 'Singapore', city: 'Singapore' },
    { code: 'BR', name: 'Brazil', city: 'São Paulo' },
  ];

  const referrers: { ref: string; cat: 'direct' | 'search' | 'social' | 'website' }[] = [
    { ref: 'Direct / Bookmark', cat: 'direct' },
    { ref: 'https://www.google.com', cat: 'search' },
    { ref: 'https://t.co (X / Twitter)', cat: 'social' },
    { ref: 'https://www.linkedin.com', cat: 'social' },
    { ref: 'https://www.reddit.com', cat: 'social' },
    { ref: 'https://youtube.com', cat: 'social' },
    { ref: 'https://news.ycombinator.com', cat: 'website' },
    { ref: 'https://github.com', cat: 'website' },
  ];

  const browsers = ['Chrome', 'Safari', 'Firefox', 'Edge'];
  const osList = ['macOS', 'Windows', 'iOS', 'Android', 'Linux'];
  const devices: ('desktop' | 'mobile' | 'tablet')[] = ['desktop', 'mobile', 'tablet'];

  const clicks: ClickRecord[] = [];
  let clickCounter = 1;

  for (const link of initialLinks) {
    for (let i = 0; i < link.clicksCount; i++) {
      const daysAgo = Math.random() * 7;
      const ts = new Date(Date.now() - daysAgo * 86400000).toISOString();
      const country = countries[Math.floor(Math.random() * countries.length)];
      const ref = referrers[Math.floor(Math.random() * referrers.length)];
      const browser = browsers[Math.floor(Math.random() * browsers.length)];
      const os = osList[Math.floor(Math.random() * osList.length)];
      const device =
        os === 'iOS' || os === 'Android'
          ? 'mobile'
          : devices[Math.floor(Math.random() * devices.length)];

      clicks.push({
        id: `clk_demo_${clickCounter++}`,
        linkId: link.id,
        shortCode: link.shortCode,
        userId: DEMO_USER_ID,
        timestamp: ts,
        ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
        countryCode: country.code,
        countryName: country.name,
        city: country.city,
        referrer: ref.ref,
        referrerCategory: ref.cat,
        browser,
        os,
        device,
      });
    }
  }

  clicks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    users: [demoUser],
    links: initialLinks,
    clicks,
  };
}

async function ensureDemoSeeded(fsDb: Firestore): Promise<void> {
  if (!globalForDb.__lpDemoSeeded) {
    globalForDb.__lpDemoSeeded = (async () => {
      try {
        const demoRef = fsDb.collection(USERS_COLLECTION).doc(DEMO_USER_ID);
        const snap = await demoRef.get();
        if (snap.exists) return;

        const seed = buildDemoSeedData();
        const batchWrites: Array<{ ref: DocumentReference; data: object }> = [];

        for (const u of seed.users) {
          batchWrites.push({
            ref: fsDb.collection(USERS_COLLECTION).doc(u.id),
            data: u,
          });
        }
        for (const l of seed.links) {
          batchWrites.push({
            ref: fsDb.collection(LINKS_COLLECTION).doc(l.id),
            data: l,
          });
        }
        for (const c of seed.clicks) {
          batchWrites.push({
            ref: fsDb.collection(CLICKS_COLLECTION).doc(c.id),
            data: c,
          });
        }

        // Firestore WriteBatch limit is 500 operations
        for (let i = 0; i < batchWrites.length; i += 400) {
          const chunk = batchWrites.slice(i, i + 400);
          const batch = fsDb.batch();
          for (const item of chunk) {
            batch.set(item.ref, item.data, { merge: true });
          }
          await batch.commit();
        }
      } catch (err) {
        globalForDb.__lpDemoSeeded = null;
        throw err;
      }
    })();
  }

  return globalForDb.__lpDemoSeeded;
}

// ================= DISTRIBUTED RATE LIMITING =================

export async function checkDistributedRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    return checkLocalRateLimit(key, maxRequests, windowMs);
  }

  const docId = crypto.createHash('sha256').update(key).digest('hex').slice(0, 48);
  const docRef = fsDb.collection(RATE_LIMITS_COLLECTION).doc(docId);
  const now = Date.now();

  try {
    return await fsDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.data() as { count?: number; resetTime?: number } | undefined;

      if (!snap.exists || !data || typeof data.resetTime !== 'number' || data.resetTime < now) {
        tx.set(docRef, {
          count: 1,
          resetTime: now + windowMs,
          updatedAt: now,
        });
        return true;
      }

      const currentCount = typeof data.count === 'number' ? data.count : 0;
      if (currentCount >= maxRequests) {
        return false;
      }

      tx.update(docRef, {
        count: currentCount + 1,
        updatedAt: now,
      });
      return true;
    });
  } catch (err) {
    console.error('Distributed rate limit check failed, falling back to local limiter:', err);
    return checkLocalRateLimit(key, maxRequests, windowMs);
  }
}

// ================= USER OPERATIONS =================

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const clean = username.trim().toLowerCase();
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    return db.users.find((u) => u.username.toLowerCase() === clean) || null;
  }

  const snap = await fsDb
    .collection(USERS_COLLECTION)
    .where('usernameLower', '==', clean)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as UserRecord;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    return db.users.find((u) => u.id === id) || null;
  }

  if (id === DEMO_USER_ID) {
    await ensureDemoSeeded(fsDb);
  }

  const snap = await fsDb.collection(USERS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as UserRecord;
}

export async function createUser(data: { username: string; passwordHash: string }): Promise<UserRecord> {
  const cleanUsername = data.username.trim().toLowerCase();
  const fsDb = await resolveFirestore();
  const nowIso = new Date().toISOString();

  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    username: cleanUsername,
    usernameLower: cleanUsername,
    passwordHash: data.passwordHash,
    createdAt: nowIso,
    lastLoginAt: nowIso,
  };

  if (!fsDb) {
    const db = loadLocalDatabase();
    db.users.push(newUser);
    saveLocalDatabase(db);
    return newUser;
  }

  await fsDb.collection(USERS_COLLECTION).doc(newUser.id).set(newUser);
  return newUser;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      user.lastLoginAt = nowIso;
      saveLocalDatabase(db);
    }
    return;
  }

  await fsDb.collection(USERS_COLLECTION).doc(userId).update({
    lastLoginAt: nowIso,
  });
}

export async function ensureDemoUser(): Promise<UserRecord> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    const existing = db.users.find((u) => u.id === DEMO_USER_ID);
    if (existing) {
      existing.lastLoginAt = new Date().toISOString();
      saveLocalDatabase(db);
      return existing;
    }
    const seed = buildDemoSeedData();
    db.users.push(...seed.users);
    db.links.push(...seed.links);
    db.clicks.push(...seed.clicks);
    saveLocalDatabase(db);
    return seed.users[0];
  }

  await ensureDemoSeeded(fsDb);
  const ref = fsDb.collection(USERS_COLLECTION).doc(DEMO_USER_ID);
  const nowIso = new Date().toISOString();
  await ref.update({ lastLoginAt: nowIso });
  const snap = await ref.get();
  return snap.data() as UserRecord;
}

export async function upsertFirebaseUser(data: {
  uid: string;
  email: string;
  displayName?: string;
}): Promise<UserRecord> {
  const firebaseId = `fb_${data.uid}`;
  const nowIso = new Date().toISOString();
  const fsDb = await resolveFirestore();

  if (!fsDb) {
    const db = loadLocalDatabase();
    const existing = db.users.find((u) => u.id === firebaseId);
    if (existing) {
      existing.lastLoginAt = nowIso;
      saveLocalDatabase(db);
      return existing;
    }

    const baseHandle = (data.displayName || data.email.split('@')[0] || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '_')
      .slice(0, 18);
    const safeHandle = baseHandle.length >= 3 ? baseHandle : `user_${baseHandle}`;
    let candidate = safeHandle;
    let suffix = 1;
    while (db.users.some((u) => u.username.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${safeHandle.slice(0, 18)}_${suffix++}`;
    }

    const newUser: UserRecord = {
      id: firebaseId,
      username: candidate,
      usernameLower: candidate.toLowerCase(),
      passwordHash: '',
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };

    db.users.push(newUser);
    saveLocalDatabase(db);
    return newUser;
  }

  const userRef = fsDb.collection(USERS_COLLECTION).doc(firebaseId);
  const existingSnap = await userRef.get();
  if (existingSnap.exists) {
    await userRef.update({ lastLoginAt: nowIso });
    return { ...(existingSnap.data() as UserRecord), lastLoginAt: nowIso };
  }

  const baseHandle = (data.displayName || data.email.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '_')
    .slice(0, 18);
  const safeHandle = baseHandle.length >= 3 ? baseHandle : `user_${baseHandle}`;
  let candidate = safeHandle;
  let suffix = 1;

  while (true) {
    const collision = await fsDb
      .collection(USERS_COLLECTION)
      .where('usernameLower', '==', candidate.toLowerCase())
      .limit(1)
      .get();
    if (collision.empty) break;
    candidate = `${safeHandle.slice(0, 18)}_${suffix++}`;
  }

  const newUser: UserRecord = {
    id: firebaseId,
    username: candidate,
    usernameLower: candidate.toLowerCase(),
    passwordHash: '',
    createdAt: nowIso,
    lastLoginAt: nowIso,
  };

  await userRef.set(newUser);
  return newUser;
}

// ================= LINK OPERATIONS =================

export async function getLinkByShortCode(shortCode: string): Promise<LinkRecord | null> {
  const cleanCode = shortCode.trim().toLowerCase();
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    return db.links.find((l) => l.shortCode.toLowerCase() === cleanCode) || null;
  }

  await ensureDemoSeeded(fsDb);
  const snap = await fsDb
    .collection(LINKS_COLLECTION)
    .where('shortCodeLower', '==', cleanCode)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as LinkRecord;
}

export async function getLinkById(id: string, userId?: string): Promise<LinkRecord | null> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    const link = db.links.find((l) => l.id === id);
    if (!link) return null;
    if (userId && link.userId !== userId) return null;
    return link;
  }

  const snap = await fsDb.collection(LINKS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const link = snap.data() as LinkRecord;
  if (userId && link.userId !== userId) return null;
  return link;
}

export async function getLinksByUserId(userId: string): Promise<LinkRecord[]> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    return db.links
      .filter((l) => l.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  if (userId === DEMO_USER_ID) {
    await ensureDemoSeeded(fsDb);
  }

  const snap = await fsDb
    .collection(LINKS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  return snap.docs
    .map((d) => d.data() as LinkRecord)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createLink(data: {
  userId: string;
  originalUrl: string;
  shortCode: string;
  title?: string;
  tags?: string[];
  passwordHash?: string | null;
  requireGps?: boolean;
  gpsMaxAccuracyMeters?: number;
  gpsStrictMode?: boolean;
  expiresAt?: string | null;
}): Promise<LinkRecord> {
  const nowIso = new Date().toISOString();
  const cleanCode = data.shortCode.trim();
  const boundedTarget =
    typeof data.gpsMaxAccuracyMeters === 'number' && Number.isFinite(data.gpsMaxAccuracyMeters)
      ? Math.min(1000, Math.max(0.1, Math.round(data.gpsMaxAccuracyMeters * 100) / 100))
      : 1;

  const newLink: LinkRecord = {
    id: `lnk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    userId: data.userId,
    originalUrl: data.originalUrl,
    shortCode: cleanCode,
    shortCodeLower: cleanCode.toLowerCase(),
    title: data.title?.trim() || data.originalUrl.replace(/^https?:\/\//i, '').substring(0, 48),
    tags: (data.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    isActive: true,
    passwordHash: data.passwordHash || null,
    requireGps: Boolean(data.requireGps),
    gpsMaxAccuracyMeters: boundedTarget,
    gpsStrictMode: Boolean(data.gpsStrictMode),
    expiresAt: data.expiresAt || null,
    createdAt: nowIso,
    updatedAt: nowIso,
    clicksCount: 0,
  };

  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    db.links.unshift(newLink);
    saveLocalDatabase(db);
    return newLink;
  }

  await fsDb.collection(LINKS_COLLECTION).doc(newLink.id).set(newLink);
  return newLink;
}

export async function updateLink(
  id: string,
  userId: string,
  updates: Partial<
    Pick<
      LinkRecord,
      | 'title'
      | 'tags'
      | 'isActive'
      | 'passwordHash'
      | 'requireGps'
      | 'gpsMaxAccuracyMeters'
      | 'gpsStrictMode'
      | 'expiresAt'
    >
  >
): Promise<LinkRecord | null> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    const link = db.links.find((l) => l.id === id && l.userId === userId);
    if (!link) return null;

    if (updates.title !== undefined) link.title = updates.title.trim();
    if (updates.tags !== undefined) {
      link.tags = updates.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    }
    if (updates.isActive !== undefined) link.isActive = updates.isActive;
    if (updates.passwordHash !== undefined) link.passwordHash = updates.passwordHash;
    if (updates.requireGps !== undefined) link.requireGps = Boolean(updates.requireGps);
    if (
      updates.gpsMaxAccuracyMeters !== undefined &&
      Number.isFinite(updates.gpsMaxAccuracyMeters)
    ) {
      link.gpsMaxAccuracyMeters = Math.min(
        1000,
        Math.max(0.1, Math.round(updates.gpsMaxAccuracyMeters * 100) / 100)
      );
    }
    if (updates.gpsStrictMode !== undefined) link.gpsStrictMode = Boolean(updates.gpsStrictMode);
    if (updates.expiresAt !== undefined) link.expiresAt = updates.expiresAt;

    link.updatedAt = new Date().toISOString();
    saveLocalDatabase(db);
    return link;
  }

  const linkRef = fsDb.collection(LINKS_COLLECTION).doc(id);
  const snap = await linkRef.get();
  if (!snap.exists) return null;

  const existing = snap.data() as LinkRecord;
  if (existing.userId !== userId) return null;

  const patch: Partial<LinkRecord> = {
    updatedAt: new Date().toISOString(),
  };
  if (updates.title !== undefined) patch.title = updates.title.trim();
  if (updates.tags !== undefined) {
    patch.tags = updates.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  }
  if (updates.isActive !== undefined) patch.isActive = updates.isActive;
  if (updates.passwordHash !== undefined) patch.passwordHash = updates.passwordHash;
  if (updates.requireGps !== undefined) patch.requireGps = Boolean(updates.requireGps);
  if (
    updates.gpsMaxAccuracyMeters !== undefined &&
    Number.isFinite(updates.gpsMaxAccuracyMeters)
  ) {
    patch.gpsMaxAccuracyMeters = Math.min(
      1000,
      Math.max(0.1, Math.round(updates.gpsMaxAccuracyMeters * 100) / 100)
    );
  }
  if (updates.gpsStrictMode !== undefined) patch.gpsStrictMode = Boolean(updates.gpsStrictMode);
  if (updates.expiresAt !== undefined) patch.expiresAt = updates.expiresAt;

  await linkRef.update(patch);
  return { ...existing, ...patch };
}

export async function deleteLink(id: string, userId: string): Promise<boolean> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    const initialCount = db.links.length;
    db.links = db.links.filter((l) => !(l.id === id && l.userId === userId));

    if (db.links.length < initialCount) {
      db.clicks = db.clicks.filter((c) => c.linkId !== id);
      saveLocalDatabase(db);
      return true;
    }
    return false;
  }

  const linkRef = fsDb.collection(LINKS_COLLECTION).doc(id);
  const snap = await linkRef.get();
  if (!snap.exists) return false;

  const existing = snap.data() as LinkRecord;
  if (existing.userId !== userId) return false;

  const clickSnaps = await fsDb
    .collection(CLICKS_COLLECTION)
    .where('linkId', '==', id)
    .get();

  const docsToDelete = [linkRef, ...clickSnaps.docs.map((d) => d.ref)];
  for (let i = 0; i < docsToDelete.length; i += 400) {
    const batch = fsDb.batch();
    for (const ref of docsToDelete.slice(i, i + 400)) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  return true;
}

// ================= ANALYTICS & CLICK TRACKING =================

function buildClickRecord(data: {
  linkId: string;
  shortCode: string;
  userId: string;
  ip: string;
  referrer?: string;
  userAgent?: string;
  countryCode?: string;
  countryName?: string;
  city?: string;
  geoSource?: 'ip' | 'gps';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  altitudeMeters?: number | null;
  headingDeg?: number | null;
  speedMps?: number | null;
  gpsSamplesCount?: number;
  gpsTargetMeters?: number;
  gpsTargetMet?: boolean;
}): ClickRecord {
  const ua = (data.userAgent || '').toLowerCase();
  let browser = 'Other';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

  let os = 'Other';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('linux')) os = 'Linux';

  let device: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (ua.includes('ipad') || ua.includes('tablet')) device = 'tablet';
  else if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) device = 'mobile';

  const ref = (data.referrer || '').trim();
  let referrerCategory: 'direct' | 'search' | 'social' | 'website' = 'direct';
  let cleanRef = 'Direct / Bookmark';

  if (ref && ref !== 'direct') {
    cleanRef = sanitizeText(ref, 256) || 'Direct / Bookmark';
    const lowerRef = cleanRef.toLowerCase();
    if (
      lowerRef.includes('google') ||
      lowerRef.includes('bing') ||
      lowerRef.includes('duckduckgo') ||
      lowerRef.includes('yahoo')
    ) {
      referrerCategory = 'search';
    } else if (
      lowerRef.includes('twitter') ||
      lowerRef.includes('t.co') ||
      lowerRef.includes('x.com') ||
      lowerRef.includes('facebook') ||
      lowerRef.includes('linkedin') ||
      lowerRef.includes('reddit') ||
      lowerRef.includes('instagram') ||
      lowerRef.includes('youtube') ||
      lowerRef.includes('tiktok')
    ) {
      referrerCategory = 'social';
    } else {
      referrerCategory = 'website';
    }
  }

  // Mask IPv4/IPv6 for privacy
  const ipParts = data.ip.split('.');
  const maskedIp =
    ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.xxx` : 'anonymized';

  const safeCountryCode =
    (data.countryCode || 'US').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'US';

  const record: ClickRecord = {
    id: `clk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    linkId: data.linkId,
    shortCode: data.shortCode,
    userId: data.userId,
    timestamp: new Date().toISOString(),
    ip: maskedIp,
    countryCode: safeCountryCode.length >= 2 ? safeCountryCode : 'US',
    countryName: sanitizeText(data.countryName || 'United States', 64) || 'United States',
    city: sanitizeText(data.city || 'Undisclosed', 64) || 'Undisclosed',
    referrer: cleanRef,
    referrerCategory,
    browser,
    os,
    device,
    geoSource: data.geoSource || 'ip',
  };

  if (
    data.geoSource === 'gps' &&
    typeof data.latitude === 'number' &&
    typeof data.longitude === 'number' &&
    typeof data.accuracyMeters === 'number'
  ) {
    record.latitude = Math.round(data.latitude * 1e7) / 1e7;
    record.longitude = Math.round(data.longitude * 1e7) / 1e7;
    record.accuracyMeters = Math.round(data.accuracyMeters * 100) / 100;
    record.altitudeMeters = data.altitudeMeters ?? null;
    record.headingDeg = data.headingDeg ?? null;
    record.speedMps = data.speedMps ?? null;
    record.gpsSamplesCount = data.gpsSamplesCount ?? 1;
    record.gpsTargetMeters = data.gpsTargetMeters ?? 1;
    record.gpsTargetMet = Boolean(data.gpsTargetMet);
  }

  return record;
}

export async function recordClick(data: {
  linkId: string;
  shortCode: string;
  userId: string;
  ip: string;
  referrer?: string;
  userAgent?: string;
  countryCode?: string;
  countryName?: string;
  city?: string;
  geoSource?: 'ip' | 'gps';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  altitudeMeters?: number | null;
  headingDeg?: number | null;
  speedMps?: number | null;
  gpsSamplesCount?: number;
  gpsTargetMeters?: number;
  gpsTargetMet?: boolean;
}): Promise<ClickRecord> {
  const newClick = buildClickRecord(data);
  const fsDb = await resolveFirestore();

  if (!fsDb) {
    const db = loadLocalDatabase();
    const link = db.links.find((l) => l.id === data.linkId);
    if (link) {
      link.clicksCount = (link.clicksCount || 0) + 1;
      link.updatedAt = new Date().toISOString();
    }
    db.clicks.unshift(newClick);
    if (db.clicks.length > 10000) {
      db.clicks = db.clicks.slice(0, 10000);
    }
    saveLocalDatabase(db);
    return newClick;
  }

  const FieldValue = await getAdminFieldValue();
  const batch = fsDb.batch();
  const linkRef = fsDb.collection(LINKS_COLLECTION).doc(data.linkId);
  const clickRef = fsDb.collection(CLICKS_COLLECTION).doc(newClick.id);

  batch.update(linkRef, {
    clicksCount: FieldValue.increment(1),
    updatedAt: new Date().toISOString(),
  });
  batch.set(clickRef, newClick);
  await batch.commit();

  return newClick;
}

export async function getClicksForUser(userId: string, linkId?: string): Promise<ClickRecord[]> {
  const fsDb = await resolveFirestore();
  if (!fsDb) {
    const db = loadLocalDatabase();
    return db.clicks.filter((c) => {
      if (c.userId !== userId) return false;
      if (linkId && c.linkId !== linkId) return false;
      return true;
    });
  }

  if (userId === DEMO_USER_ID) {
    await ensureDemoSeeded(fsDb);
  }

  const snap = await fsDb
    .collection(CLICKS_COLLECTION)
    .where('userId', '==', userId)
    .limit(5000)
    .get();

  return snap.docs
    .map((d) => d.data() as ClickRecord)
    .filter((c) => !linkId || c.linkId === linkId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getAnalyticsSummary(userId: string, linkId?: string) {
  const [userClicks, userLinks] = await Promise.all([
    getClicksForUser(userId, linkId),
    getLinksByUserId(userId),
  ]);

  const sampleClicks = userClicks.length;
  const linkTotalClicks = linkId
    ? userLinks.find((l) => l.id === linkId)?.clicksCount || 0
    : userLinks.reduce((sum, l) => sum + (l.clicksCount || 0), 0);
  const totalClicks = Math.max(sampleClicks, linkTotalClicks);
  const uniqueIps = new Set(userClicks.map((c) => c.ip)).size;

  const countryCounts: Record<string, { code: string; name: string; count: number }> = {};
  for (const c of userClicks) {
    const key = c.countryCode || 'UNKNOWN';
    if (!countryCounts[key]) {
      countryCounts[key] = { code: key, name: c.countryName || key, count: 0 };
    }
    countryCounts[key].count += 1;
  }
  const geographic = Object.values(countryCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      percentage: sampleClicks > 0 ? Math.round((item.count / sampleClicks) * 100) : 0,
    }));

  const referrerCounts: Record<string, { label: string; count: number; category: string }> = {};
  for (const c of userClicks) {
    const key = c.referrer;
    if (!referrerCounts[key]) {
      referrerCounts[key] = { label: key, count: 0, category: c.referrerCategory };
    }
    referrerCounts[key].count += 1;
  }
  const referrers = Object.values(referrerCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      percentage: sampleClicks > 0 ? Math.round((item.count / sampleClicks) * 100) : 0,
    }));

  const categoryCounts = { direct: 0, search: 0, social: 0, website: 0 };
  for (const c of userClicks) {
    if (categoryCounts[c.referrerCategory] !== undefined) {
      categoryCounts[c.referrerCategory] += 1;
    }
  }

  const deviceCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
  for (const c of userClicks) {
    deviceCounts[c.device] = (deviceCounts[c.device] || 0) + 1;
  }

  const browserCounts: Record<string, number> = {};
  for (const c of userClicks) {
    browserCounts[c.browser] = (browserCounts[c.browser] || 0) + 1;
  }

  const now = new Date();
  const clicksOverTime: { date: string; label: string; clicks: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    const count = userClicks.filter((c) => c.timestamp.startsWith(dateStr)).length;
    clicksOverTime.push({
      date: dateStr,
      label: `${month} ${day}`,
      clicks: count,
    });
  }

  const recentClicks = userClicks.slice(0, 20);

  const gpsClicks = userClicks.filter(
    (c) =>
      c.geoSource === 'gps' &&
      typeof c.latitude === 'number' &&
      typeof c.longitude === 'number' &&
      typeof c.accuracyMeters === 'number'
  );
  const accuracies = gpsClicks
    .map((c) => c.accuracyMeters as number)
    .sort((a, b) => a - b);
  const bestAccuracyMeters = accuracies.length > 0 ? accuracies[0] : null;
  const medianAccuracyMeters =
    accuracies.length > 0 ? accuracies[Math.floor(accuracies.length / 2)] : null;
  const sub1mCount = accuracies.filter((acc) => acc <= 1.0).length;
  const targetMetCount = gpsClicks.filter((c) => c.gpsTargetMet).length;

  return {
    totalClicks,
    uniqueVisitors: uniqueIps,
    totalLinks: userLinks.length,
    activeLinks: userLinks.filter((l) => l.isActive).length,
    clicksOverTime,
    geographic,
    referrers,
    categories: categoryCounts,
    devices: deviceCounts,
    browsers: browserCounts,
    recentClicks,
    gpsSummary: {
      gpsClicksCount: gpsClicks.length,
      sub1mCount,
      targetMetCount,
      bestAccuracyMeters,
      medianAccuracyMeters,
      recentGpsClicks: gpsClicks.slice(0, 20),
    },
  };
}
