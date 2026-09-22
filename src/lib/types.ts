export interface Question {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  guest_answer: 'A' | 'B' | 'C' | 'D';
}

export interface GameState {
  // Current question data
  currentQuestion: Question | null;
  currentQuestionNumber: number;

  // Panel interaction
  panelGuess: 'A' | 'B' | 'C' | 'D' | '';
  panelGuessSubmitted: boolean;
  panelGuessChecked: boolean;

  // Game progression  
  lives: number;
  lifeUsed: boolean;
  questionsAnswered: number;
  panelCorrectAnswers: number; // Track panel correct guesses for game end
  prize: number;
  pendingAdvancement: boolean; // Guest won round, waiting for next question to advance

  // Game status
  gameOver: boolean;
  pendingGameOver: boolean; // Guest lost all lives, waiting for operator to show game over
  softEliminated: boolean;
  currentQuestionAnswerRevealed: boolean;
  needsManualReveal: boolean;

  // Hide Option Feature
  hiddenOption: 'A' | 'B' | 'C' | 'D' | null; // The option that is currently hidden
  hideOptionUsed: boolean; // Whether the one-time use lifeline has been used

  // Option Reveal Feature (operator controlled)
  revealedOptions: ('A' | 'B' | 'C' | 'D')[]; // Options revealed by operator in reveal order (normal game)
  aonRevealedOptions: ('A' | 'B' | 'C' | 'D')[]; // Options revealed during All or Nothing (separate from normal game)

  // All or Nothing phase
  allOrNothingActive: boolean;
  allOrNothingAttempt: number; // 0 = not started, 1 = first attempt, 2 = second attempt
  allOrNothingComplete: boolean;
  allOrNothingWon: boolean;

  // All or Nothing manual control
  allOrNothingPendingPanelWin: boolean; // Panel won, waiting for operator to show modal
  allOrNothingPendingGuestWin: boolean; // Guest won, waiting for operator to show modal
  allOrNothingModalVisible: boolean; // Modal is currently displayed

  // All or Nothing attempt tracking
  allOrNothingLastGuess: string; // Track last guess for highlighting
  allOrNothingLastGuessCorrect: boolean; // Track if last guess was correct
  allOrNothingAttempt1Guess: string; // Track attempt 1 guess
  allOrNothingAttempt1Correct: boolean; // Track if attempt 1 was correct
  allOrNothingAttempt2Guess: string; // Track attempt 2 guess
  allOrNothingAttempt2Correct: boolean; // Track if attempt 2 was correct

  // Guest Victory (completing all 7 questions without lock)
  guestVictoryPending: boolean; // Guest completed all 7 questions, waiting for operator to show victory modal
  guestVictoryModalVisible: boolean; // Victory modal is currently displayed

  // Guest Lost (lost all lives without placing lock)
  guestLostPending: boolean; // Guest lost without lock, waiting for operator to show elimination modal
  guestLostModalVisible: boolean; // Elimination modal is currently displayed

  // Lock system
  lock: {
    placed: boolean;
    level: number | null;
  };
  lockedMoney: number;

  // Question management
  usedQuestions: Record<string, boolean>;

  // Buzzer trigger (operator triggers, plays on audience)
  buzzerTrigger: number; // Timestamp of buzzer trigger, changes trigger new sound

  // 75:25 Banner (operator controlled)
  show75_25Banner: boolean; // Whether to show the 75:25 banner on audience display

  // Logo overlay (operator controlled)
  showLogo: boolean; // Whether to show the full-screen show logo on audience display

  // Play Along
  currentQuestionStartTime: number | null;
  playAlongAnswerWindowOpen: boolean;
  playAlongDisplayMode: 'none' | 'quickest' | 'slowest' | 'correct' | 'incorrect';
  playAlongDisplayEntries: PlayAlongDisplayEntry[];

  // Operator-driven leaderboard (full-screen modal on audience screen)
  showLeaderboard: boolean;                                     // modal on/off
  leaderboardScope: 'all' | number;                            // 'all' = overall ranking; number = that question's spotlight
  leaderboardCorrectFilter: 'all' | 'correct' | 'incorrect';   // per-question scope only
  leaderboardOrder: 'fastest' | 'slowest';                     // per-question scope only

  // Players reset signal — bumped on reset so /play clients force a sign-out
  playersResetAt: number;

  // Metadata
  lastActivity: string;
  documentVersion: string;
}

export interface PlayAlongUser {
  uid: string;
  name: string;
  phone: string;
  createdAt: number;
}

export interface PlayAlongResponse {
  answer: 'A' | 'B' | 'C' | 'D';
  timestamp: number;
  name: string;
  phone: string;
  questionId: string;
  questionNumber: number;
}

export interface PlayAlongDisplayEntry {
  uid: string;
  name: string;
  answer: 'A' | 'B' | 'C' | 'D';
  timestamp: number;
  responseTimeMs: number;
}

export interface PrizeTier {
  level: number;
  amount: number;
  displayText: string;
}

export interface SoundEffect {
  name: string;
  file: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface QuestionPool {
  questions: Question[];
  lastUpdated: string;
}