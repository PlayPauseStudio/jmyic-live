// Client-side only — auth is lazy-initialized so this file is safe to import
// at module level from 'use client' components. initializeAuth is never called
// during server-side prerendering because it only runs inside useEffect/handlers.
import {
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signOut,
  type Auth,
} from 'firebase/auth';
import { app } from './firebase';

let _auth: Auth | undefined;

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = initializeAuth(app, {
      persistence: [browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return _auth;
}

// Fully sign the current user out (used to force-logout players on game reset)
export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export const googleProvider = new GoogleAuthProvider();
