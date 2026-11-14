import type { App, ServiceAccount } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { FieldValue, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const globalForAdmin = globalThis as unknown as {
  __lpAdminApp?: App;
  __lpAdminDb?: Firestore;
  __lpAdminAuth?: Auth;
};

function createVercelConfigError(message: string): Error {
  const err = new Error(message);
  err.name = 'VercelConfigError';
  return err;
}

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function stripSurroundingQuotes(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizePrivateKey(rawKey: string): string {
  return rawKey.replace(/\\n/g, '\n').trim();
}

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const rawJsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJsonEnv) {
    const cleaned = stripSurroundingQuotes(rawJsonEnv);
    let jsonStr = cleaned.startsWith('{')
      ? cleaned
      : Buffer.from(cleaned, 'base64').toString('utf-8');

    let parsed: {
      project_id?: string;
      projectId?: string;
      client_email?: string;
      clientEmail?: string;
      private_key?: string;
      privateKey?: string;
    };

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      try {
        // Handle multi-line pasted JSON where raw newlines appeared inside the string
        jsonStr = jsonStr.replace(/\r?\n/g, '\\n');
        parsed = JSON.parse(jsonStr);
      } catch (err) {
        console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON format:', err);
        throw createVercelConfigError(
          'Invalid FIREBASE_SERVICE_ACCOUNT_JSON in Vercel Environment Variables: could not parse JSON. Paste the single-line JSON (or base64-encoded JSON) from Firebase Console -> Project Settings -> Service Accounts.'
        );
      }
    }

    const projectId = parsed.project_id || parsed.projectId || firebaseConfig.projectId;
    const clientEmail = parsed.client_email || parsed.clientEmail;
    const privateKey = normalizePrivateKey(parsed.private_key || parsed.privateKey || '');

    if (!clientEmail || !privateKey || !privateKey.includes('PRIVATE KEY')) {
      throw createVercelConfigError(
        'FIREBASE_SERVICE_ACCOUNT_JSON is incomplete or missing a valid PEM private_key / client_email.'
      );
    }

    return { projectId, clientEmail, privateKey };
  }

  const clientEmail = stripSurroundingQuotes(process.env.FIREBASE_CLIENT_EMAIL || '');
  const privateKeyRaw = stripSurroundingQuotes(process.env.FIREBASE_PRIVATE_KEY || '');
  if (clientEmail && privateKeyRaw) {
    const projectId =
      stripSurroundingQuotes(process.env.FIREBASE_PROJECT_ID || '') || firebaseConfig.projectId;
    const privateKey = normalizePrivateKey(privateKeyRaw);
    if (!privateKey.includes('PRIVATE KEY')) {
      throw createVercelConfigError(
        'FIREBASE_PRIVATE_KEY in Vercel Environment Variables is not a valid PEM private key.'
      );
    }
    return { projectId, clientEmail, privateKey };
  }

  if (clientEmail || privateKeyRaw) {
    throw createVercelConfigError(
      'Incomplete Firebase Admin environment variables: both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be configured.'
    );
  }

  return null;
}

export function hasFirebaseAdminCredentials(): boolean {
  try {
    return parseServiceAccountFromEnv() !== null;
  } catch {
    return false;
  }
}

export function getMissingVercelEnvVars(): string[] {
  const missing: string[] = [];
  if (!hasFirebaseAdminCredentials()) {
    missing.push('FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
    missing.push('JWT_SECRET (min 32 characters)');
  }
  return missing;
}

async function getAdminApp(): Promise<App | null> {
  if (globalForAdmin.__lpAdminApp) {
    return globalForAdmin.__lpAdminApp;
  }

  const serviceAccount = parseServiceAccountFromEnv();
  if (!serviceAccount) {
    return null;
  }

  let appMod: typeof import('firebase-admin/app');
  try {
    appMod = await import('firebase-admin/app');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw createVercelConfigError(
      `Failed to load firebase-admin/app on server (${detail}). Ensure Node.js 22+ is active in Vercel Project Settings.`
    );
  }

  const existing = appMod.getApps();
  if (existing.length > 0) {
    globalForAdmin.__lpAdminApp = existing[0];
    return existing[0];
  }

  try {
    const app = appMod.initializeApp({
      credential: appMod.cert(serviceAccount),
      projectId: serviceAccount.projectId || firebaseConfig.projectId,
    });
    globalForAdmin.__lpAdminApp = app;
    return app;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw createVercelConfigError(
      `Firebase Admin credential initialization failed (${detail}). Re-check FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_PRIVATE_KEY in Vercel Environment Variables.`
    );
  }
}

export async function getAdminFirestore(): Promise<Firestore | null> {
  if (globalForAdmin.__lpAdminDb) {
    return globalForAdmin.__lpAdminDb;
  }

  const app = await getAdminApp();
  if (!app) {
    return null;
  }

  let fsMod: typeof import('firebase-admin/firestore');
  try {
    fsMod = await import('firebase-admin/firestore');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw createVercelConfigError(
      `Failed to load firebase-admin/firestore on server (${detail}).`
    );
  }

  const databaseId =
    process.env.FIRESTORE_DATABASE_ID?.trim() || firebaseConfig.firestoreDatabaseId;

  let db: Firestore;
  try {
    db = fsMod.initializeFirestore(app, { preferRest: true }, databaseId);
  } catch {
    // Fallback if Firestore was already initialized for this app instance
    db = fsMod.getFirestore(app, databaseId);
  }

  globalForAdmin.__lpAdminDb = db;
  return db;
}

export async function getAdminFieldValue(): Promise<typeof FieldValue> {
  try {
    const fsMod = await import('firebase-admin/firestore');
    return fsMod.FieldValue;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw createVercelConfigError(
      `Failed to load firebase-admin/firestore FieldValue (${detail}).`
    );
  }
}

export async function getAdminAuth(): Promise<Auth | null> {
  if (globalForAdmin.__lpAdminAuth) {
    return globalForAdmin.__lpAdminAuth;
  }

  const app = await getAdminApp();
  if (!app) {
    return null;
  }

  let authMod: typeof import('firebase-admin/auth');
  try {
    authMod = await import('firebase-admin/auth');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw createVercelConfigError(
      `Failed to load firebase-admin/auth on server (${detail}).`
    );
  }

  const auth = authMod.getAuth(app);
  globalForAdmin.__lpAdminAuth = auth;
  return auth;
}
