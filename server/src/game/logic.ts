import { PRIZE_TIERS, type GameState, type Option, type Question } from './state';

/**
 * The JMYIC game rules, ported from web/src/utils/gameLogic.ts unchanged.
 * Each function reads the current state and returns the fields to change;
 * nothing here writes anything. The only difference from the browser version
 * is that the modal toggles take the state as an argument instead of fetching
 * it from Firebase.
 */

type Updates = Partial<GameState>;

export function isOneShot(gs: GameState): boolean {
  return gs.gameFormat === 'oneShot';
}

/**
 * One Shot round resolution. The judge guessing right means the contestant
 * loses; guessing wrong means they win their prize. Either way the round is over.
 */
function resolveOneShot(gs: GameState, isPanelCorrect: boolean): Updates {
  const question = gs.currentQuestion!;
  const outcome: 'won' | 'lost' = isPanelCorrect ? 'lost' : 'won';
  return {
    oneShotOutcome: outcome,
    oneShotResults: { ...(gs.oneShotResults || {}), [question.id]: outcome },
    currentQuestionAnswerRevealed: true,
    needsManualReveal: false,
    usedQuestions: { ...gs.usedQuestions, [question.id]: true },
  };
}

export function getPrizeForLevel(level: number): number {
  const tier = PRIZE_TIERS.find((t) => t.level === level);
  return tier ? tier.amount : 0;
}

/** Convert a full-text guest answer to its letter using the question's options. */
export function normalizeGuestAnswer(guestAnswer: string, question: Question): string {
  const normalized = (guestAnswer ?? '').toString().trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(normalized)) return normalized;
  const options = [
    { letter: 'A', text: (question.option_a ?? '').trim().toUpperCase() },
    { letter: 'B', text: (question.option_b ?? '').trim().toUpperCase() },
    { letter: 'C', text: (question.option_c ?? '').trim().toUpperCase() },
    { letter: 'D', text: (question.option_d ?? '').trim().toUpperCase() },
  ];
  const match = options.find((opt) => opt.text === normalized);
  return match ? match.letter : normalized;
}

/** The guest answer as a letter, or null if it doesn't match any option. */
export function correctLetter(question: Question): Option | null {
  const l = normalizeGuestAnswer(question.guest_answer, question);
  return (['A', 'B', 'C', 'D'] as string[]).includes(l) ? (l as Option) : null;
}

export function isPanelGuessCorrectWithContext(panelGuess: string, guestAnswer: string, question: Question): boolean {
  if (!panelGuess || !guestAnswer) return false;
  return panelGuess.toUpperCase() === normalizeGuestAnswer(guestAnswer, question);
}

/** Step 2: Check Panel Guess. */
export function calculatePanelGuessResult(gs: GameState, panelGuess: string): Updates {
  if (!gs.currentQuestion) throw new Error('No current question');
  if (!gs.currentQuestion.guest_answer) throw new Error('Current question missing guest_answer field');

  const isPanelCorrect = isPanelGuessCorrectWithContext(panelGuess, gs.currentQuestion.guest_answer, gs.currentQuestion);
  const updates: Updates = {
    panelGuessChecked: true,
    needsManualReveal: !isPanelCorrect, // Only need reveal if panel is WRONG
  };

  // One Shot: the judge being right ends this contestant's round immediately.
  // If the judge is wrong we still wait for the operator to reveal.
  if (isOneShot(gs)) {
    if (isPanelCorrect) return { ...updates, ...resolveOneShot(gs, true) };
    return updates;
  }

  if (isPanelCorrect) {
    // Panel wins - guest loses a life and stays at current level
    updates.currentQuestionAnswerRevealed = true;
    updates.panelCorrectAnswers = (gs.panelCorrectAnswers || 0) + 1;

    if (gs.lives > 0) {
      const newLives = gs.lives - 1;
      updates.lives = newLives;
      if (newLives === 0) {
        // Soft elimination is operator-controlled via a manual toggle, not auto-set here.
        if (!gs.lock.placed) updates.guestLostPending = true;
        else updates.guestVictoryPending = true; // Lock victory: guest wins the locked amount
      }
    }

    // Game ends when the panel has 2 correct answers (and the guest still has lives)
    if (updates.panelCorrectAnswers >= 2 && (updates.lives ?? 0) > 0) {
      updates.gameOver = true;
    }

    updates.usedQuestions = { ...gs.usedQuestions, [gs.currentQuestion.id]: true };

    // Keep the question on screen; reset only the panel guess for the next round
    updates.panelGuess = '';
    updates.panelGuessSubmitted = false;
    updates.panelGuessChecked = false;
  }
  // Panel wrong: the reveal step handles guest advancement

  return updates;
}

/** Step 3: Reveal Guest Answer. */
export function calculateRevealResult(gs: GameState): Updates {
  if (!gs.currentQuestion || !gs.panelGuess) throw new Error('Invalid state for reveal');

  const isPanelCorrect = isPanelGuessCorrectWithContext(gs.panelGuess, gs.currentQuestion.guest_answer, gs.currentQuestion);
  let updates: Updates = {
    currentQuestionAnswerRevealed: true,
    needsManualReveal: false,
  };

  // One Shot: reveal settles the round outright — win or lose, no ladder.
  if (isOneShot(gs)) return { ...updates, ...resolveOneShot(gs, isPanelCorrect) };

  if (!isPanelCorrect) {
    // Panel WRONG = Guest WINS the round; advance on next question selection
    const newQuestionsAnswered = gs.questionsAnswered + 1;
    updates = { ...updates, questionsAnswered: newQuestionsAnswered, pendingAdvancement: true };
    if (newQuestionsAnswered === 7) updates.guestVictoryPending = true;
  } else {
    // Panel CORRECT = Panel wins, guest loses a life
    const newPanelCorrectCount = gs.panelCorrectAnswers + 1;
    updates.panelCorrectAnswers = newPanelCorrectCount;
    if (gs.lives > 0) {
      const newLives = gs.lives - 1;
      updates.lives = newLives;
      if (newLives === 0 && !gs.lock.placed) updates.guestLostPending = true;
    }
    if (newPanelCorrectCount >= 2 && (updates.lives ?? 0) > 0) {
      updates.gameOver = true;
    }
  }

  return updates;
}

export function markQuestionAsUsed(gs: GameState, questionId: string): Updates {
  return { usedQuestions: { ...gs.usedQuestions, [questionId]: true } };
}

export function isQuestionUsed(gs: GameState, questionId: string): boolean {
  return !!gs.usedQuestions[questionId];
}

export function canPlaceLock(gs: GameState): boolean {
  if (isOneShot(gs)) return false;
  return !gs.lock.placed && !gs.gameOver;
}

export function calculateLockPlacement(gs: GameState, level: number): Updates {
  if (!canPlaceLock(gs)) throw new Error('Cannot place lock in current state');
  return { lock: { placed: true, level }, lockedMoney: getPrizeForLevel(level) };
}

export function canStartAllOrNothing(gs: GameState): boolean {
  if (isOneShot(gs)) return false;
  return gs.softEliminated && !gs.allOrNothingActive && !gs.allOrNothingComplete && !gs.gameOver;
}

export function startAllOrNothing(): Updates {
  return {
    allOrNothingActive: true,
    allOrNothingAttempt: 1,
    allOrNothingComplete: false,
    allOrNothingWon: false,
    allOrNothingLastGuess: '',
    allOrNothingLastGuessCorrect: false,
    allOrNothingAttempt1Guess: '',
    allOrNothingAttempt1Correct: false,
    allOrNothingAttempt2Guess: '',
    allOrNothingAttempt2Correct: false,
    currentQuestion: null,
    panelGuess: '',
    panelGuessSubmitted: false,
    panelGuessChecked: false,
    currentQuestionAnswerRevealed: false,
    needsManualReveal: false,
    revealedOptions: [],
    aonRevealedOptions: [],
    hiddenOption: null,
  };
}

export function handleAllOrNothingGuess(gs: GameState, panelGuess: Option): Updates {
  if (!gs.allOrNothingActive || !gs.currentQuestion) throw new Error('All or Nothing not active');

  const isPanelCorrect = isPanelGuessCorrectWithContext(panelGuess, gs.currentQuestion.guest_answer, gs.currentQuestion);
  const updates: Updates = {
    panelGuess,
    panelGuessSubmitted: true,
    panelGuessChecked: true,
    currentQuestionAnswerRevealed: true,
    allOrNothingLastGuess: panelGuess,
    allOrNothingLastGuessCorrect: isPanelCorrect,
  };

  if (gs.allOrNothingAttempt === 1) {
    updates.allOrNothingAttempt1Guess = panelGuess;
    updates.allOrNothingAttempt1Correct = isPanelCorrect;
  } else if (gs.allOrNothingAttempt === 2) {
    updates.allOrNothingAttempt2Guess = panelGuess;
    updates.allOrNothingAttempt2Correct = isPanelCorrect;
  }

  if (isPanelCorrect) {
    updates.allOrNothingPendingPanelWin = true;
    updates.allOrNothingWon = false;
    updates.prize = 0; // Guest gets ₹0 (even if locked money exists)
  } else if (gs.allOrNothingAttempt === 1) {
    // First attempt wrong - second attempt on the SAME question
    updates.allOrNothingAttempt = 2;
    updates.panelGuess = '';
    updates.panelGuessSubmitted = false;
    updates.panelGuessChecked = false;
    updates.currentQuestionAnswerRevealed = false;
  } else {
    updates.allOrNothingPendingGuestWin = true;
    updates.allOrNothingWon = true;
    updates.prize = 50000;
  }

  return updates;
}

/** Picking a question from the pool, including any pending ladder advancement. */
export function calculateQuestionSelection(gs: GameState, newQuestion: Question): Updates {
  const now = Date.now();
  if (gs.allOrNothingActive) {
    return {
      currentQuestion: newQuestion,
      panelGuess: '',
      panelGuessSubmitted: false,
      panelGuessChecked: false,
      currentQuestionAnswerRevealed: false,
      needsManualReveal: false,
      revealedOptions: [],
      aonRevealedOptions: [],
      currentQuestionStartTime: now,
      playAlongAnswerWindowOpen: true,
    };
  }

  if (isOneShot(gs)) {
    return {
      currentQuestion: newQuestion,
      panelGuess: '',
      panelGuessSubmitted: false,
      panelGuessChecked: false,
      currentQuestionAnswerRevealed: false,
      needsManualReveal: false,
      oneShotOutcome: null,
      revealedOptions: [],
      currentQuestionStartTime: now,
      playAlongAnswerWindowOpen: true,
      usedQuestions: { ...gs.usedQuestions, [newQuestion.id]: true },
    };
  }

  const updates: Updates = {
    currentQuestion: newQuestion,
    panelGuess: '',
    panelGuessSubmitted: false,
    panelGuessChecked: false,
    currentQuestionAnswerRevealed: false,
    needsManualReveal: false,
    hiddenOption: null,
    revealedOptions: [],
    currentQuestionStartTime: now,
    playAlongAnswerWindowOpen: true,
  };

  if (gs.pendingAdvancement) {
    const nextLevel = gs.currentQuestionNumber + 1;
    updates.currentQuestionNumber = nextLevel;
    updates.prize = getPrizeForLevel(nextLevel);
    updates.pendingAdvancement = false;
  }

  updates.usedQuestions = { ...gs.usedQuestions, [newQuestion.id]: true };
  return updates;
}

export function triggerGameOver(): Updates {
  return { gameOver: true, pendingGameOver: false };
}

export function canTriggerGameOver(gs: GameState): boolean {
  return (
    gs.softEliminated && !gs.gameOver && !gs.allOrNothingActive && !gs.guestLostPending && !gs.guestVictoryPending
  );
}

export function hideOption(gs: GameState, optionToHide: Option): Updates {
  if (gs.hideOptionUsed) throw new Error('Hide option lifeline already used');
  if (!gs.currentQuestion) throw new Error('No current question');
  return { hiddenOption: optionToHide, hideOptionUsed: true };
}

export function revealOption(gs: GameState, option: Option): Updates {
  const current = gs.revealedOptions || [];
  if (current.includes(option)) return {};
  return { revealedOptions: [...current, option] };
}

export function unrevealOption(gs: GameState, option: Option): Updates {
  const current = gs.revealedOptions || [];
  if (!current.includes(option)) return {};
  return { revealedOptions: current.filter((o) => o !== option) };
}

export function revealAllOptions(gs: GameState): Updates {
  const current = gs.revealedOptions || [];
  const remaining = (['A', 'B', 'C', 'D'] as Option[]).filter((o) => !current.includes(o));
  if (remaining.length === 0) return {};
  return { revealedOptions: [...current, ...remaining] };
}

/**
 * A question's answer was corrected after its round played. One Shot
 * recomputes the stored result; Classic is NOT re-scored silently — it only
 * reports that the operator should use Reset Question.
 */
export function recalculateAfterAnswerEdit(
  gs: GameState,
  updatedQuestion: Question,
): { updates: Updates; classicNeedsReset: boolean } {
  const none = { updates: {}, classicNeedsReset: false };
  const guess = gs.panelGuess;
  if (!guess || !gs.currentQuestion) return none;
  if (gs.currentQuestion.id !== updatedQuestion.id) return none;

  const nowCorrect = isPanelGuessCorrectWithContext(guess, updatedQuestion.guest_answer, updatedQuestion);

  if (isOneShot(gs)) {
    if (!gs.oneShotOutcome) return none;
    const outcome: 'won' | 'lost' = nowCorrect ? 'lost' : 'won';
    if (outcome === gs.oneShotOutcome) return none;
    return {
      updates: {
        oneShotOutcome: outcome,
        oneShotResults: { ...(gs.oneShotResults || {}), [updatedQuestion.id]: outcome },
        needsManualReveal: false,
        currentQuestionAnswerRevealed: true,
      },
      classicNeedsReset: false,
    };
  }

  const scored = gs.panelGuessChecked || gs.currentQuestionAnswerRevealed;
  if (!scored) return none;
  const wasCorrect = isPanelGuessCorrectWithContext(guess, gs.currentQuestion.guest_answer, gs.currentQuestion);
  return { updates: {}, classicNeedsReset: wasCorrect !== nowCorrect };
}

/**
 * Best-effort rewind of the current question when no round-start snapshot
 * exists. Cannot restore a life or ladder step already spent.
 */
export function resetQuestionFallback(gs: GameState): Updates {
  const updates: Updates = {
    panelGuess: '',
    panelGuessSubmitted: false,
    panelGuessChecked: false,
    currentQuestionAnswerRevealed: false,
    needsManualReveal: false,
    revealedOptions: [],
    aonRevealedOptions: [],
    currentQuestionStartTime: Date.now(),
    playAlongAnswerWindowOpen: true,
  };
  if (isOneShot(gs)) {
    updates.oneShotOutcome = null;
    const results = { ...(gs.oneShotResults || {}) };
    if (gs.currentQuestion) delete results[gs.currentQuestion.id];
    updates.oneShotResults = results;
  }
  return updates;
}

// ── Modal toggles (were async Firebase functions in gameLogic.ts) ───────────

/** Show/hide the All or Nothing result — guest win (₹50,000) or panel win (₹0). */
export function toggleAllOrNothingModal(gs: GameState): Updates {
  if (gs.allOrNothingModalVisible) return { allOrNothingModalVisible: false };
  if (gs.allOrNothingWon === true) {
    return { allOrNothingModalVisible: true, allOrNothingComplete: true, allOrNothingWon: true, gameOver: true, prize: 50000 };
  }
  return { allOrNothingModalVisible: true, allOrNothingComplete: true, allOrNothingWon: false, gameOver: true, prize: 0 };
}

/** Show/hide the guest victory (all 7 won, or out of lives with the lock placed). */
export function toggleGuestVictoryModal(gs: GameState): Updates {
  if (gs.guestVictoryModalVisible) return { guestVictoryModalVisible: false };
  const prizeAmount = gs.lives === 0 && gs.lock.placed ? gs.lockedMoney : gs.prize;
  return { guestVictoryModalVisible: true, gameOver: true, prize: prizeAmount };
}

/** Show the guest-lost screen; hiding it moves on to game over. */
export function toggleGuestLostModal(gs: GameState): Updates {
  if (gs.guestLostModalVisible) return { guestLostModalVisible: false, gameOver: true };
  return { guestLostModalVisible: true, prize: 0 };
}
