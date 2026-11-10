/**
 * Game state shapes. GameState is the exact shape the web app has always used
 * (web/src/lib/types.ts mirrors it) — only who is allowed to change it moved.
 */

export type Option = 'A' | 'B' | 'C' | 'D';
export const OPTIONS: Option[] = ['A', 'B', 'C', 'D'];

export interface Question {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  /** Usually a letter; older rows can hold the option's text instead. */
  guest_answer: string;
  // One Shot format only
  contestant_name?: string;
  prize?: string;
  createdAt?: string;
  rowIndex?: number;
}

// 'classic'  — one guest, prize ladder, lives, lock, All or Nothing.
// 'oneShot'  — many contestants, one question each, fixed prize, sudden death.
export type GameFormat = 'classic' | 'oneShot';

export interface PlayAlongDisplayEntry {
  uid: string;
  name: string;
  answer: Option;
  timestamp: number;
  responseTimeMs: number;
}

export interface GameState {
  gameFormat: GameFormat;
  oneShotOutcome: 'won' | 'lost' | null;
  oneShotResults: Record<string, 'won' | 'lost'>;

  currentQuestion: Question | null;
  currentQuestionNumber: number;

  panelGuess: Option | '';
  panelGuessSubmitted: boolean;
  panelGuessChecked: boolean;

  lives: number;
  lifeUsed: boolean;
  questionsAnswered: number;
  panelCorrectAnswers: number;
  prize: number;
  pendingAdvancement: boolean;

  gameOver: boolean;
  pendingGameOver: boolean;
  softEliminated: boolean;
  currentQuestionAnswerRevealed: boolean;
  needsManualReveal: boolean;

  hiddenOption: Option | null;
  hideOptionUsed: boolean;

  revealedOptions: Option[];
  aonRevealedOptions: Option[];

  allOrNothingActive: boolean;
  allOrNothingAttempt: number;
  allOrNothingComplete: boolean;
  allOrNothingWon: boolean;
  allOrNothingPendingPanelWin: boolean;
  allOrNothingPendingGuestWin: boolean;
  allOrNothingModalVisible: boolean;
  allOrNothingLastGuess: string;
  allOrNothingLastGuessCorrect: boolean;
  allOrNothingAttempt1Guess: string;
  allOrNothingAttempt1Correct: boolean;
  allOrNothingAttempt2Guess: string;
  allOrNothingAttempt2Correct: boolean;

  guestVictoryPending: boolean;
  guestVictoryModalVisible: boolean;
  guestLostPending: boolean;
  guestLostModalVisible: boolean;

  lock: { placed: boolean; level: number | null };
  lockedMoney: number;

  usedQuestions: Record<string, boolean>;

  buzzerTrigger: number;
  show75_25Banner: boolean;
  showLogo: boolean;

  currentQuestionStartTime: number | null;
  playAlongAnswerWindowOpen: boolean;
  playAlongDisplayMode: 'none' | 'quickest' | 'slowest' | 'correct' | 'incorrect';
  playAlongDisplayEntries: PlayAlongDisplayEntry[];

  showLeaderboard: boolean;
  leaderboardScope: 'all' | number;
  leaderboardCorrectFilter: 'all' | 'correct' | 'incorrect';
  leaderboardOrder: 'fastest' | 'slowest';

  /** Bumped on reset so /play phones sign out. */
  playersResetAt: number;

  lastActivity: string;
  documentVersion: string;
}

/** A registered play-along player (formerly Firestore playAlongUsers/{uid}). */
export interface Player {
  uid: string;
  name: string;
  phone: string;
  createdAt: number;
}

/** One phone's answer to one question number (formerly RTDB playAlong/answers). */
export interface PlayAnswer {
  answer: Option;
  /** Server time the answer arrived — phones can't fake being fastest. */
  timestamp: number;
  responseTimeMs: number;
  name: string;
  phone: string;
  questionNumber: number;
  questionId: string;
}

/** What play-along answers for a question number are graded against. */
export interface QuestionMeta {
  questionText: string;
  correctAnswer: Option | null;
  questionNumber: number;
}

/**
 * Everything the server holds for one show. `game` is broadcast (redacted per
 * role); the rest is served to the operator or derived into summaries, and the
 * phone numbers in `players`/`answers` never leave the server except in the
 * operator's export.
 */
export interface ServerState {
  game: GameState;
  /** The question pool (formerly Firestore questions/pool). Operator only. */
  pool: Question[];
  poolUpdatedAt: string | null;
  /** The game as it was at step 1 of the current question — for Reset Question. Never broadcast. */
  roundStart: GameState | null;
  players: Record<string, Player>;
  /** questionNumber -> uid -> answer */
  answers: Record<string, Record<string, PlayAnswer>>;
  /** questionNumber -> meta */
  questionMeta: Record<string, QuestionMeta>;
}

export const PRIZE_TIERS = [
  { level: 1, amount: 2000, displayText: '₹2K' },
  { level: 2, amount: 4000, displayText: '₹4K' },
  { level: 3, amount: 8000, displayText: '₹8K' },
  { level: 4, amount: 12000, displayText: '₹12K' },
  { level: 5, amount: 20000, displayText: '₹20K' },
  { level: 6, amount: 30000, displayText: '₹30K' },
  { level: 7, amount: 50000, displayText: '₹50K' },
] as const;

export function defaultGameState(): GameState {
  return {
    gameFormat: 'classic',
    oneShotOutcome: null,
    oneShotResults: {},
    currentQuestion: null,
    currentQuestionNumber: 1,
    panelGuess: '',
    panelGuessSubmitted: false,
    panelGuessChecked: false,
    lives: 2,
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
    hiddenOption: null,
    hideOptionUsed: false,
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
    lock: { placed: false, level: null },
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
    documentVersion: '3.0',
  };
}

export function initialServerState(): ServerState {
  return {
    game: defaultGameState(),
    pool: [],
    poolUpdatedAt: null,
    roundStart: null,
    players: {},
    answers: {},
    questionMeta: {},
  };
}

/** Fill in anything an older snapshot is missing (same job as the old mergeWithDefaults). */
export function normalizeGame(raw: Partial<GameState> | null | undefined): GameState {
  const d = defaultGameState();
  return {
    ...d,
    ...(raw ?? {}),
    revealedOptions: raw?.revealedOptions ?? [],
    aonRevealedOptions: raw?.aonRevealedOptions ?? [],
    playAlongDisplayEntries: raw?.playAlongDisplayEntries ?? [],
    oneShotResults: raw?.oneShotResults ?? {},
    usedQuestions: raw?.usedQuestions ?? {},
    lock: { ...d.lock, ...(raw?.lock ?? {}) },
  };
}

/**
 * Play-along answer buckets (one per question number) are updated in place by
 * recordAnswer, so object identity can't say whether one changed. Each write
 * bumps this counter; the view caches in redact.ts compare it.
 */
const bucketRevisions = new WeakMap<object, number>();

export function touchBucket(bucket: object): void {
  bucketRevisions.set(bucket, (bucketRevisions.get(bucket) ?? 0) + 1);
}

export function bucketRevision(bucket: object): number {
  return bucketRevisions.get(bucket) ?? 0;
}
