import * as L from './logic';
import {
  defaultGameState,
  type GameFormat,
  type GameState,
  type Option,
  type Player,
  type Question,
  type ServerState,
  touchBucket,
} from './state';

/**
 * Operator actions. Each one is what a button in the operator panel used to do
 * in the browser — same logic, same preconditions (the conditions that used to
 * only disable the button are enforced here too) — and returns the next
 * ServerState. Invalid requests throw OpError and change nothing.
 */

export class OpError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const fail = (code: string): never => {
  throw new OpError(code);
};

/** Merge game updates, stamping lastActivity like the old updateGameState did. */
function withGame(s: ServerState, updates: Partial<GameState>): ServerState {
  if (Object.keys(updates).length === 0) return s;
  return { ...s, game: { ...s.game, ...updates, lastActivity: new Date().toISOString() } };
}

function requireQuestion(gs: GameState): Question {
  return gs.currentQuestion ?? fail('no_question');
}

// ── Format ───────────────────────────────────────────────────────────────────

export function setFormat(s: ServerState, format: GameFormat): ServerState {
  if (s.game.gameFormat === format) return s;
  return withGame(s, { gameFormat: format });
}

// ── Question selection ───────────────────────────────────────────────────────

/**
 * Bring a question (or One Shot contestant) up. Also remembers step 1 of the
 * round for Reset Question, and records what play-along answers for this
 * question number are graded against.
 */
export function selectQuestion(s: ServerState, questionId: string): ServerState {
  const question = s.pool.find((q) => q.id === questionId) ?? fail('unknown_question');
  if (L.isQuestionUsed(s.game, question.id)) fail('question_used');

  const updates = L.calculateQuestionSelection(s.game, question);
  const next = withGame(s, updates);
  const qNum = next.game.currentQuestionNumber;
  return {
    ...next,
    roundStart: next.game,
    questionMeta: {
      ...next.questionMeta,
      [qNum]: { questionText: question.question, correctAnswer: L.correctLetter(question), questionNumber: qNum },
    },
  };
}

// ── Panel guess → check → reveal ─────────────────────────────────────────────

export function submitPanelGuess(s: ServerState, guess: Option): ServerState {
  const gs = s.game;
  requireQuestion(gs);
  if (gs.panelGuessChecked) fail('already_checked');
  if (gs.allOrNothingActive) {
    if (gs.allOrNothingComplete) fail('aon_complete');
    if (gs.allOrNothingAttempt === 2 && guess === gs.allOrNothingAttempt1Guess) fail('already_guessed');
  }
  return withGame(s, { panelGuess: guess, panelGuessSubmitted: true });
}

export function checkPanelGuess(s: ServerState): ServerState {
  const gs = s.game;
  requireQuestion(gs);
  if (gs.allOrNothingActive) fail('aon_active');
  if (!gs.panelGuess) fail('no_guess');
  if (gs.panelGuessChecked) fail('already_checked');
  const updates = L.calculatePanelGuessResult(gs, gs.panelGuess);
  // Lock in the submission and close the play-along window
  return withGame(s, { ...updates, panelGuessSubmitted: true, playAlongAnswerWindowOpen: false });
}

export function revealGuestAnswer(s: ServerState): ServerState {
  const gs = s.game;
  const question = requireQuestion(gs);
  if (gs.allOrNothingActive) fail('aon_active');
  if (!gs.needsManualReveal || gs.currentQuestionAnswerRevealed) fail('nothing_to_reveal');
  const updates = L.calculateRevealResult(gs);
  return withGame(s, { ...updates, ...L.markQuestionAsUsed(gs, question.id) });
}

// ── Lifelines ────────────────────────────────────────────────────────────────

export function placeLock(s: ServerState, level: number): ServerState {
  if (!L.canPlaceLock(s.game)) fail('lock_unavailable');
  return withGame(s, L.calculateLockPlacement(s.game, level));
}

export function hideOption(s: ServerState, option: Option): ServerState {
  if (s.game.hideOptionUsed) fail('hide_used');
  requireQuestion(s.game);
  return withGame(s, L.hideOption(s.game, option));
}

// ── Option reveals (normal game and All or Nothing keep separate lists) ──────

export function revealOption(s: ServerState, option: Option): ServerState {
  const gs = s.game;
  requireQuestion(gs);
  if (gs.allOrNothingActive) {
    const current = gs.aonRevealedOptions || [];
    if (current.includes(option)) return s;
    return withGame(s, { aonRevealedOptions: [...current, option] });
  }
  return withGame(s, L.revealOption(gs, option));
}

export function unrevealOption(s: ServerState, option: Option): ServerState {
  const gs = s.game;
  requireQuestion(gs);
  if (gs.allOrNothingActive) {
    const current = gs.aonRevealedOptions || [];
    if (!current.includes(option)) return s;
    return withGame(s, { aonRevealedOptions: current.filter((o) => o !== option) });
  }
  return withGame(s, L.unrevealOption(gs, option));
}

export function revealAllOptions(s: ServerState): ServerState {
  const gs = s.game;
  requireQuestion(gs);
  if (gs.allOrNothingActive) {
    const current = gs.aonRevealedOptions || [];
    const remaining = (['A', 'B', 'C', 'D'] as Option[]).filter((o) => !current.includes(o));
    if (remaining.length === 0) return s;
    return withGame(s, { aonRevealedOptions: [...current, ...remaining] });
  }
  return withGame(s, L.revealAllOptions(gs));
}

/**
 * Reset Question: back to step 1 of the round on screen, undoing anything it
 * scored. Restores the snapshot taken at selection, keeping the pool
 * bookkeeping as it is now and reopening play-along for a fresh run.
 */
export function resetQuestion(s: ServerState): ServerState {
  const gs = s.game;
  const question = requireQuestion(gs);
  const roundStart = s.roundStart;
  if (roundStart && roundStart.currentQuestion?.id === question.id) {
    return withGame(s, {
      ...roundStart,
      usedQuestions: gs.usedQuestions,
      currentQuestionStartTime: Date.now(),
      playAlongAnswerWindowOpen: true,
      // Not round progress: restoring an older value would replay the buzzer
      // on the big screen or skip a pending phone sign-out.
      buzzerTrigger: gs.buzzerTrigger,
      playersResetAt: gs.playersResetAt,
    });
  }
  return withGame(s, L.resetQuestionFallback(gs));
}

// ── All or Nothing + end of game ─────────────────────────────────────────────

export function startAllOrNothing(s: ServerState): ServerState {
  if (!L.canStartAllOrNothing(s.game)) fail('aon_unavailable');
  return withGame(s, L.startAllOrNothing());
}

export function revealAllOrNothingResult(s: ServerState): ServerState {
  const gs = s.game;
  if (!gs.allOrNothingActive || !gs.currentQuestion || !gs.panelGuess || !gs.panelGuessSubmitted || gs.panelGuessChecked) {
    fail('nothing_to_reveal');
  }
  return withGame(s, L.handleAllOrNothingGuess(gs, gs.panelGuess as Option));
}

export function toggleAllOrNothingModal(s: ServerState): ServerState {
  return withGame(s, L.toggleAllOrNothingModal(s.game));
}

export function toggleGuestVictoryModal(s: ServerState): ServerState {
  return withGame(s, L.toggleGuestVictoryModal(s.game));
}

export function toggleGuestLostModal(s: ServerState): ServerState {
  return withGame(s, L.toggleGuestLostModal(s.game));
}

export function triggerGameOver(s: ServerState): ServerState {
  if (!L.canTriggerGameOver(s.game)) fail('game_over_unavailable');
  return withGame(s, L.triggerGameOver());
}

// ── Screen toggles, buzzer, leaderboard ──────────────────────────────────────

export interface FlagsInput {
  showLogo?: boolean;
  show75_25Banner?: boolean;
  softEliminated?: boolean;
  showLeaderboard?: boolean;
  leaderboardScope?: 'all' | number;
  leaderboardCorrectFilter?: 'all' | 'correct' | 'incorrect';
  leaderboardOrder?: 'fastest' | 'slowest';
}

export function setFlags(s: ServerState, flags: FlagsInput): ServerState {
  const updates: Partial<GameState> = {};
  for (const [k, v] of Object.entries(flags)) {
    if (v !== undefined && (s.game as unknown as Record<string, unknown>)[k] !== v) {
      (updates as Record<string, unknown>)[k] = v;
    }
  }
  return withGame(s, updates);
}

export function triggerBuzzer(s: ServerState): ServerState {
  // Strictly increasing, so two presses in the same millisecond still buzz twice.
  return withGame(s, { buzzerTrigger: Math.max(Date.now(), s.game.buzzerTrigger + 1) });
}

// ── Question pool ────────────────────────────────────────────────────────────

export type QuestionInput = Omit<Question, 'id' | 'createdAt' | 'rowIndex'>;

/** CSV upload: replace the whole pool. Ids are assigned here. */
export function replaceQuestions(s: ServerState, rows: QuestionInput[]): ServerState {
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const pool: Question[] = rows.map((r, index) => {
    const q: Question = {
      id: `q_${now}_${index}`,
      question: r.question,
      option_a: r.option_a,
      option_b: r.option_b,
      option_c: r.option_c,
      option_d: r.option_d,
      guest_answer: r.guest_answer,
      createdAt: stamp,
      rowIndex: index,
    };
    if (r.contestant_name?.trim()) q.contestant_name = r.contestant_name.trim();
    if (r.prize?.trim()) q.prize = r.prize.trim();
    return q;
  });
  return { ...s, pool, poolUpdatedAt: stamp };
}

/**
 * Save an edit to any question in the pool. If it's the one on screen, the
 * live copy changes too, and a round already played under the old answer is
 * recomputed (One Shot) or flagged for Reset Question (Classic).
 */
export function editQuestion(
  s: ServerState,
  edit: QuestionInput & { id: string },
): { next: ServerState; classicNeedsReset: boolean } {
  const existing = s.pool.find((q) => q.id === edit.id) ?? fail('unknown_question');
  const updated: Question = {
    ...existing,
    question: edit.question.trim(),
    option_a: edit.option_a.trim(),
    option_b: edit.option_b.trim(),
    option_c: edit.option_c.trim(),
    option_d: edit.option_d.trim(),
    guest_answer: edit.guest_answer,
  };
  const name = edit.contestant_name?.trim();
  const prize = edit.prize?.trim();
  if (name) updated.contestant_name = name;
  else delete updated.contestant_name;
  if (prize) updated.prize = prize;
  else delete updated.prize;

  let next: ServerState = {
    ...s,
    pool: s.pool.map((q) => (q.id === updated.id ? updated : q)),
    poolUpdatedAt: new Date().toISOString(),
  };

  let classicNeedsReset = false;
  if (s.game.currentQuestion?.id === updated.id) {
    const recalc = L.recalculateAfterAnswerEdit(s.game, updated);
    classicNeedsReset = recalc.classicNeedsReset;
    next = withGame(next, { currentQuestion: updated, ...recalc.updates });
    const qNum = next.game.currentQuestionNumber;
    next = {
      ...next,
      // Reset Question must bring back the corrected question, not the typo.
      roundStart:
        next.roundStart?.currentQuestion?.id === updated.id
          ? { ...next.roundStart, currentQuestion: updated }
          : next.roundStart,
      // Play-along is graded against the corrected answer.
      questionMeta: {
        ...next.questionMeta,
        [qNum]: { questionText: updated.question, correctAnswer: L.correctLetter(updated), questionNumber: qNum },
      },
    };
  }
  return { next, classicNeedsReset };
}

// ── Resets ───────────────────────────────────────────────────────────────────

/**
 * Reset Game Only: keeps the questions and the show format; clears the game,
 * play-along answers and registered players (whose phones sign out).
 */
export function resetGame(s: ServerState): ServerState {
  return {
    ...s,
    game: {
      ...defaultGameState(),
      usedQuestions: {},
      playersResetAt: Date.now(),
      gameFormat: s.game.gameFormat,
      documentVersion: s.game.documentVersion || '3.0',
    },
    roundStart: null,
    players: {},
    answers: {},
    questionMeta: {},
  };
}

/** Reset EVERYTHING: back to state zero, questions included. */
export function resetEverything(s: ServerState): ServerState {
  return {
    ...s,
    game: { ...defaultGameState(), playersResetAt: Date.now() },
    pool: [],
    poolUpdatedAt: new Date().toISOString(),
    roundStart: null,
    players: {},
    answers: {},
    questionMeta: {},
    // A new episode: the old log went out in the backup taken before the reset.
    log: [],
  };
}

// ── Play-along (phones) ──────────────────────────────────────────────────────

/** Register a phone's name + mobile. Errors: duplicate_phone. */
// phone -> uid for each players object, so the duplicate-number check doesn't
// scan every registered player on each sign-up.
const phoneIndexes = new WeakMap<ServerState['players'], Map<string, string>>();

function phoneIndex(players: ServerState['players']): Map<string, string> {
  let idx = phoneIndexes.get(players);
  if (!idx) {
    idx = new Map(Object.values(players).map((p) => [p.phone, p.uid]));
    phoneIndexes.set(players, idx);
  }
  return idx;
}

export function registerPlayer(s: ServerState, uid: string, name: string, phone: string): ServerState {
  const idx = phoneIndex(s.players);
  const owner = idx.get(phone);
  if (owner && owner !== uid) fail('duplicate_phone');
  const existing = s.players[uid];
  const player: Player = { uid, name, phone, createdAt: existing?.createdAt ?? Date.now() };
  // Updated in place, like play-along answers: copying every player on each
  // sign-up made a crowd joining at once cost grow with the square of its size.
  if (existing && existing.phone !== phone && idx.get(existing.phone) === uid) idx.delete(existing.phone);
  s.players[uid] = player;
  idx.set(phone, uid);
  return { ...s };
}

/**
 * Record a phone's answer to the question on screen. Only while the answer
 * window is open, only an option the phone can actually see, and the time is
 * the server's — so "fastest finger" can't be faked.
 */
export function recordAnswer(s: ServerState, uid: string, answer: Option): ServerState {
  const gs = s.game;
  const player = s.players[uid] ?? fail('not_registered');
  const question = gs.currentQuestion ?? fail('no_question');
  if (!gs.playAlongAnswerWindowOpen || gs.currentQuestionAnswerRevealed) fail('window_closed');
  const revealed = gs.allOrNothingActive ? gs.aonRevealedOptions : gs.revealedOptions;
  if (gs.hiddenOption === answer || !(revealed || []).includes(answer)) fail('option_not_visible');

  const now = Date.now();
  const start = gs.currentQuestionStartTime ?? 0;
  const qKey = String(gs.currentQuestionNumber);
  // The one place state is changed in place. Copying the whole bucket on every
  // tap made a burst cost grow with the square of the crowd (1000 phones = 1M
  // copied entries). touchBucket tells the view caches this bucket changed.
  const existing = s.answers[qKey];
  const bucket = existing ?? {};
  bucket[uid] = {
    answer,
    timestamp: now,
    responseTimeMs: start > 0 ? now - start : 0,
    name: player.name,
    phone: player.phone,
    questionNumber: gs.currentQuestionNumber,
    questionId: question.id,
  };
  touchBucket(bucket);
  return { ...s, answers: existing ? s.answers : { ...s.answers, [qKey]: bucket } };
}
