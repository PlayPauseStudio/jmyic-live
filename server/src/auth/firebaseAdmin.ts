import * as admin from 'firebase-admin';
import { env, isProd } from '../config/env';
import { logger } from '../util/logger';

let initialized = false;

/**
 * Initialize the Firebase Admin SDK, used ONLY to verify the ID tokens that
 * /play phones present. Verifying a token needs nothing but the project id
 * (Google's public signing keys are fetched on demand), so FIREBASE_PROJECT_ID
 * is enough; a service account works too.
 *
 * With neither set the server runs in a dev mode where (outside production)
 * the phone's "token" is taken as its raw uid, so local testing needs no
 * Firebase at all.
 */
export function initFirebaseAdmin(): void {
  if (initialized) return;
  initialized = true;
  try {
    if (env.FIREBASE_SERVICE_ACCOUNT_B64) {
      const json = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
      admin.initializeApp({ credential: admin.credential.cert(json) });
      logger.info('Firebase Admin initialized (service account).');
      return;
    }
    if (env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
      logger.info({ projectId: env.FIREBASE_PROJECT_ID }, 'Firebase Admin initialized (project id).');
      return;
    }
  } catch (e) {
    logger.error({ err: e }, 'Failed to initialize Firebase Admin.');
    if (isProd) process.exit(1);
    return;
  }
  if (isProd) {
    logger.error('FIREBASE_PROJECT_ID is required in production — phones cannot sign in without it.');
  } else {
    logger.warn('Firebase Admin not configured — phone tokens accepted as raw uid (dev only).');
  }
}

export function isFirebaseConfigured(): boolean {
  return admin.apps.length > 0;
}

export interface VerifiedUser {
  uid: string;
  name?: string;
}

/**
 * Verify a Firebase ID token and return the trusted uid. Throws on invalid
 * tokens. In dev-without-Firebase mode, accepts a non-empty string as the uid.
 */
export async function verifyIdToken(token: string): Promise<VerifiedUser> {
  if (!token) throw new Error('missing_token');
  if (!isFirebaseConfigured()) {
    if (isProd) throw new Error('auth_unavailable');
    return { uid: token.slice(0, 128) }; // dev fallback
  }
  const decoded = await admin.auth().verifyIdToken(token);
  return { uid: decoded.uid, name: decoded.name };
}
