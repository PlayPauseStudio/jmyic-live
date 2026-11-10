import { initializeApp } from 'firebase/app';

// Firebase is used ONLY for play-along sign-in (Google / email) on /play.
// Game state, the question pool and play-along answers all live on
// jmyic-server now; nothing in the app reads or writes Firestore or the
// Realtime Database any more.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

export const app = initializeApp(firebaseConfig);
