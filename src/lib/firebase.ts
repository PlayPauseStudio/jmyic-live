import { initializeApp } from 'firebase/app';
import { getFirestore, doc, collection } from 'firebase/firestore';
import { getDatabase, ref } from 'firebase/database';
import type { GameState } from './types';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!,
};

// Initialize Firebase — exported so firebaseAuth.ts can reuse it
export const app = initializeApp(firebaseConfig);

// Firestore — used for questions pool and play-along only
export const db = getFirestore(app);

// Realtime Database — game state sync (~50-80ms vs Firestore's ~200-500ms)
export const rtdb = getDatabase(app);
export const gameRtdbRef = ref(rtdb, 'games/game1');

// Play-along RTDB refs — answers keyed by questionNumber then uid
export const playAlongRtdbRoot = ref(rtdb, 'playAlong');
export const playAlongAnswersRtdbRef = ref(rtdb, 'playAlong/answers');
export const playAlongQuestionsMetaRtdbRef = ref(rtdb, 'playAlong/questions');
export function playAlongAnswersByQNumRef(questionNumber: number) {
  return ref(rtdb, `playAlong/answers/${questionNumber}`);
}
export function playAlongUserAnswerRtdbRef(questionNumber: number, uid: string) {
  return ref(rtdb, `playAlong/answers/${questionNumber}/${uid}`);
}
export function playAlongQuestionMetaRtdbRef(questionNumber: number) {
  return ref(rtdb, `playAlong/questions/${questionNumber}`);
}

if (typeof window !== 'undefined') {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'unknown';
  console.log(`🔥 Firebase initialized for ${environment}:`, firebaseConfig.projectId);
}

// Firestore refs — questions + play-along only (not game state)
export const questionsDocRef = doc(collection(db, "questions"), "pool");

// Play Along collection references
export const playAlongUsersRef = collection(db, 'playAlongUsers');
export function playAlongResponsesRef(questionId: string) {
  return collection(db, 'playAlongAnswers', questionId, 'responses');
}

// Default game state  
export const defaultGameState: GameState = {
  currentQuestion: null,
  currentQuestionNumber: 1,
  panelGuess: '',
  panelGuessSubmitted: false,
  panelGuessChecked: false,
  lives: 2, // Start with 2 lives
  lifeUsed: false,
  questionsAnswered: 0,
  panelCorrectAnswers: 0,
  prize: 0,
  pendingAdvancement: false,
  gameOver: false,
  pendingGameOver: false,
  softEliminated: false,
  currentQuestionAnswerRevealed: false,
  needsManualReveal: false,

  // Hide Option Feature
  hiddenOption: null,
  hideOptionUsed: false,

  // Option Reveal Feature
  revealedOptions: [],
  aonRevealedOptions: [],

  allOrNothingActive: false,
  allOrNothingAttempt: 0,
  allOrNothingComplete: false,
  allOrNothingWon: false,
  allOrNothingPendingPanelWin: false,
  allOrNothingPendingGuestWin: false,
  allOrNothingModalVisible: false,
  allOrNothingLastGuess: '',
  allOrNothingLastGuessCorrect: false,
  allOrNothingAttempt1Guess: '',
  allOrNothingAttempt1Correct: false,
  allOrNothingAttempt2Guess: '',
  allOrNothingAttempt2Correct: false,
  guestVictoryPending: false,
  guestVictoryModalVisible: false,
  guestLostPending: false,
  guestLostModalVisible: false,
  lock: {
    placed: false,
    level: null,
  },
  lockedMoney: 0,
  usedQuestions: {},
  buzzerTrigger: 0,
  show75_25Banner: false,
  showLogo: false,
  currentQuestionStartTime: null,
  playAlongAnswerWindowOpen: false,
  playAlongDisplayMode: 'none',
  playAlongDisplayEntries: [],
  showLeaderboard: false,
  leaderboardScope: 'all',
  leaderboardCorrectFilter: 'all',
  leaderboardOrder: 'fastest',
  playersResetAt: 0,
  lastActivity: new Date().toISOString(),
  documentVersion: '3.0'
};

// Prize tiers
export const PRIZE_TIERS = [
  { level: 1, amount: 2000, displayText: '₹2K' },
  { level: 2, amount: 4000, displayText: '₹4K' },
  { level: 3, amount: 8000, displayText: '₹8K' },
  { level: 4, amount: 12000, displayText: '₹12K' },
  { level: 5, amount: 20000, displayText: '₹20K' },
  { level: 6, amount: 30000, displayText: '₹30K' },
  { level: 7, amount: 50000, displayText: '₹50K' },
] as const;