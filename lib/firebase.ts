'use client';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// CRITICAL: Must pass firestoreDatabaseId from firebase-applet-config.json
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ==================== Blueprint Validation Constants ====================

export const BLUEPRINT_CONSTRAINTS = {
  idPattern: /^[a-zA-Z0-9_-]+$/,
  idMaxLength: 128,
  linkIdMaxLength: 64,
  usernamePattern: /^[a-zA-Z0-9_.-]+$/,
  usernameMinLength: 3,
  usernameMaxLength: 32,
  displayNameMaxLength: 64,
  emailMaxLength: 254,
  originalUrlPattern: /^https?:\/\/.+/,
  originalUrlMaxLength: 2048,
  shortCodePattern: /^[a-zA-Z0-9_-]+$/,
  shortCodeMinLength: 3,
  shortCodeMaxLength: 32,
  titleMaxLength: 120,
  tagsMaxCount: 10,
  tagMaxLength: 32,
};

// ==================== Mandatory Error Handling ====================

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ==================== Connection Validation on Boot ====================

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Firestore client is offline.');
      return false;
    }
    // Permission denied or not-found means server is reachable and online
    return true;
  }
}

if (typeof window !== 'undefined') {
  testFirestoreConnection();
}

// ==================== Sanitizers & Persistence Helpers ====================

const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'root', 'system', 'support',
  'security', 'linkpulse', 'moderator', 'staff', 'api', 'auth',
]);

function sanitizeSafeText(raw: string, maxLen: number, fallback: string): string {
  const cleaned = raw
    .replace(/[\x00-\x1F\x7F<>`"'\\]/g, '')
    .trim()
    .slice(0, maxLen);
  return cleaned.length >= 1 ? cleaned : fallback;
}

function sanitizeId(raw: string, maxLen = 64): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLen);
  return cleaned.length >= 3 ? cleaned : `id_${cleaned}`;
}

function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '_')
    .slice(0, BLUEPRINT_CONSTRAINTS.usernameMaxLength);
  const sized = cleaned.length >= BLUEPRINT_CONSTRAINTS.usernameMinLength
    ? cleaned
    : `usr_${cleaned}`.slice(0, BLUEPRINT_CONSTRAINTS.usernameMaxLength);
  return RESERVED_HANDLES.has(sized) ? `usr_${sized}`.slice(0, BLUEPRINT_CONSTRAINTS.usernameMaxLength) : sized;
}

export async function syncUserProfileToFirestore(params: {
  uid: string;
  username: string;
  displayName: string;
  email: string;
}): Promise<void> {
  const userPath = `users/${params.uid}`;
  const privatePath = `users/${params.uid}/private/info`;

  const safeUsername = sanitizeUsername(params.username);
  const safeDisplayName = sanitizeSafeText(
    params.displayName || safeUsername,
    BLUEPRINT_CONSTRAINTS.displayNameMaxLength,
    'User'
  );
  const safeEmail = (params.email || auth.currentUser?.email || '')
    .trim()
    .slice(0, BLUEPRINT_CONSTRAINTS.emailMaxLength);

  if (!safeEmail) return;

  try {
    const userRef = doc(db, 'users', params.uid);
    const privateRef = doc(db, 'users', params.uid, 'private', 'info');
    const existingSnap = await getDoc(userRef);

    if (!existingSnap.exists()) {
      const batch = writeBatch(db);
      batch.set(userRef, {
        userId: params.uid,
        username: safeUsername,
        displayName: safeDisplayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateRef, {
        userId: params.uid,
        email: safeEmail,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      const batch = writeBatch(db);
      batch.update(userRef, {
        username: safeUsername,
        displayName: safeDisplayName,
        updatedAt: serverTimestamp(),
      });
      const privateSnap = await getDoc(privateRef);
      if (privateSnap.exists()) {
        batch.update(privateRef, {
          email: safeEmail,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(privateRef, {
          userId: params.uid,
          email: safeEmail,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} | ${privatePath}`);
  }
}

export async function saveLinkToFirestore(params: {
  uid: string;
  id: string;
  originalUrl: string;
  shortCode: string;
  title: string;
  tags: string[];
  isActive: boolean;
  hasPassword: boolean;
  requireGps?: boolean;
  gpsMaxAccuracyMeters?: number;
  gpsStrictMode?: boolean;
  expiresAt?: string | null;
}): Promise<void> {
  const safeId = sanitizeId(params.id, BLUEPRINT_CONSTRAINTS.linkIdMaxLength);
  const safeShortCode = sanitizeId(params.shortCode, BLUEPRINT_CONSTRAINTS.shortCodeMaxLength);
  const safeUrl = params.originalUrl.trim().slice(0, BLUEPRINT_CONSTRAINTS.originalUrlMaxLength);
  if (
    !BLUEPRINT_CONSTRAINTS.originalUrlPattern.test(safeUrl) ||
    safeUrl.length < 10 ||
    /^https?:\/\/[^/]*@/.test(safeUrl)
  ) {
    throw new Error('Invalid destination URL for Firestore blueprint');
  }

  const safeTitle = sanitizeSafeText(
    params.title || safeUrl,
    BLUEPRINT_CONSTRAINTS.titleMaxLength,
    'Untitled Link'
  );

  const safeTags = (params.tags || [])
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '')
        .slice(0, BLUEPRINT_CONSTRAINTS.tagMaxLength)
    )
    .filter((t) => t.length >= 1)
    .slice(0, BLUEPRINT_CONSTRAINTS.tagsMaxCount);

  const boundedMaxAccuracy =
    typeof params.gpsMaxAccuracyMeters === 'number' && Number.isFinite(params.gpsMaxAccuracyMeters)
      ? Math.min(1000, Math.max(0.1, Math.round(params.gpsMaxAccuracyMeters * 100) / 100))
      : 1;

  const payload: Record<string, unknown> = {
    id: safeId,
    userId: params.uid,
    originalUrl: safeUrl,
    shortCode: safeShortCode,
    title: safeTitle,
    tags: safeTags,
    isActive: Boolean(params.isActive),
    hasPassword: Boolean(params.hasPassword),
    requireGps: Boolean(params.requireGps),
    gpsMaxAccuracyMeters: boundedMaxAccuracy,
    gpsStrictMode: Boolean(params.gpsStrictMode),
    clicksCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.expiresAt && params.expiresAt.length >= 10 && params.expiresAt.length <= 64) {
    payload.expiresAt = params.expiresAt;
  }

  const path = `links/${safeId}`;
  try {
    await setDoc(doc(db, 'links', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateLinkActiveInFirestore(
  linkId: string,
  isActive: boolean
): Promise<void> {
  const safeId = sanitizeId(linkId, BLUEPRINT_CONSTRAINTS.linkIdMaxLength);
  const path = `links/${safeId}`;
  try {
    await updateDoc(doc(db, 'links', safeId), {
      isActive: Boolean(isActive),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteLinkFromFirestore(linkId: string): Promise<void> {
  const safeId = sanitizeId(linkId, BLUEPRINT_CONSTRAINTS.linkIdMaxLength);
  const path = `links/${safeId}`;
  try {
    await deleteDoc(doc(db, 'links', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordClickToFirestore(params: {
  uid: string;
  linkId: string;
  shortCode: string;
  countryCode?: string;
  countryName?: string;
  city?: string;
  referrer?: string;
  referrerCategory?: 'direct' | 'search' | 'social' | 'website';
  browser?: string;
  os?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
}): Promise<void> {
  const safeLinkId = sanitizeId(params.linkId, BLUEPRINT_CONSTRAINTS.linkIdMaxLength);
  const clickId = `clk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `links/${safeLinkId}/clicks/${clickId}`;

  try {
    const linkRef = doc(db, 'links', safeLinkId);
    const linkSnap = await getDoc(linkRef);
    if (!linkSnap.exists()) return;

    const clickRef = doc(db, 'links', safeLinkId, 'clicks', clickId);
    const batch = writeBatch(db);
    batch.update(linkRef, {
      clicksCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    const safeCountryCode = (params.countryCode || 'US')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 8) || 'US';

    batch.set(clickRef, {
      id: clickId,
      linkId: safeLinkId,
      shortCode: sanitizeId(params.shortCode, BLUEPRINT_CONSTRAINTS.shortCodeMaxLength),
      userId: params.uid,
      timestamp: serverTimestamp(),
      countryCode: safeCountryCode.length >= 2 ? safeCountryCode : 'US',
      countryName: sanitizeSafeText(params.countryName || 'United States', 64, 'United States'),
      city: sanitizeSafeText(params.city || 'San Francisco', 64, 'Unknown'),
      referrer: sanitizeSafeText(params.referrer || 'Direct / Bookmark', 256, 'Direct'),
      referrerCategory: params.referrerCategory || 'direct',
      browser: sanitizeSafeText(params.browser || 'Chrome', 32, 'Other'),
      os: sanitizeSafeText(params.os || 'macOS', 32, 'Other'),
      device: params.device || 'desktop',
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
