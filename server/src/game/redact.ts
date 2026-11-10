import { OPTIONS, type GameState, type Option, type Question, type QuestionMeta, type ServerState } from './state';

/**
 * Role-based views. The old app handed every screen the whole game straight
 * out of Firebase, including the guest's answer from the moment a question was
 * picked. Here each role gets only what it renders:
 *
 *   operator → the full game, the question pool, and live response rows
 *              (names only; phone numbers stay on the server)
 *   display  → the game with the guest answer blanked until it is revealed and
 *              unshown options blanked, plus the leaderboard while it's on screen
 *   phones   → the question on screen (same blanking), the answer window, and
 *              the phone's own profile and answers
 *
 * Phone numbers leave the server only in the operator's export.
 */

/** One response row on the operator's Play Along panel. */
export interface ResponseRow {
  uid: string;
  name: string;
  answer: Option;
  timestamp: number;
  responseTimeMs: number;
}

/** Answers as the big-screen leaderboard needs them: names, not phones. */
export interface LeaderboardData {
  answers: Record<string, Record<string, Omit<ResponseRow, 'uid'>>>;
  meta: Record<string, QuestionMeta>;
}

export interface OwnPlayAlong {
  profile: { uid: string; name: string; phone: string; createdAt: number };
  /** questionNumber -> this phone's answer */
  answers: Record<string, { answer: Option; questionId: string }>;
}

/** Options the screen can show right now — any other option's text is blanked. */
function visibleOptions(gs: GameState): Set<Option> {
  if (gs.currentQuestionAnswerRevealed) return new Set(OPTIONS);
  const visible = new Set<Option>([...(gs.revealedOptions || []), ...(gs.aonRevealedOptions || [])]);
  for (const g of [gs.panelGuess, gs.allOrNothingAttempt1Guess, gs.allOrNothingAttempt2Guess]) {
    if (g && (OPTIONS as string[]).includes(g)) visible.add(g as Option);
  }
  return visible;
}

const OPTION_KEY: Record<Option, 'option_a' | 'option_b' | 'option_c' | 'option_d'> = {
  A: 'option_a',
  B: 'option_b',
  C: 'option_c',
  D: 'option_d',
};

/** The question as a non-operator screen may see it. */
export function publicQuestion(gs: GameState): Question | null {
  const q = gs.currentQuestion;
  if (!q) return null;
  const visible = visibleOptions(gs);
  const out: Question = { ...q };
  // The guest's answer is the whole game — it stays on the server until revealed.
  if (!gs.currentQuestionAnswerRevealed) out.guest_answer = '';
  for (const o of OPTIONS) if (!visible.has(o)) out[OPTION_KEY[o]] = '';
  return out;
}

export function publicGame(gs: GameState): GameState {
  return { ...gs, currentQuestion: publicQuestion(gs) };
}

/** Play-along meta with the live question's answer hidden until it's revealed. */
function publicMeta(s: ServerState): Record<string, QuestionMeta> {
  const gs = s.game;
  const out: Record<string, QuestionMeta> = {};
  for (const [k, m] of Object.entries(s.questionMeta)) {
    const live = Number(k) === gs.currentQuestionNumber && !!gs.currentQuestion;
    out[k] = live && !gs.currentQuestionAnswerRevealed ? { ...m, correctAnswer: null } : m;
  }
  return out;
}

export function participantCount(s: ServerState): number {
  return Object.keys(s.players).length;
}

/** Responses for the question number on screen, for the operator's live table. */
export function currentResponses(s: ServerState): ResponseRow[] {
  const rows = s.answers[String(s.game.currentQuestionNumber)] ?? {};
  return Object.entries(rows).map(([uid, r]) => ({
    uid,
    name: r.name,
    answer: r.answer,
    timestamp: r.timestamp,
    responseTimeMs: r.responseTimeMs,
  }));
}

export function leaderboardData(s: ServerState): LeaderboardData | null {
  if (!s.game.showLeaderboard) return null;
  const answers: LeaderboardData['answers'] = {};
  for (const [qNum, rows] of Object.entries(s.answers)) {
    answers[qNum] = {};
    for (const [uid, r] of Object.entries(rows)) {
      answers[qNum][uid] = { name: r.name, answer: r.answer, timestamp: r.timestamp, responseTimeMs: r.responseTimeMs };
    }
  }
  return { answers, meta: publicMeta(s) };
}

/** Everything a view is made of, flattened: the game's keys plus role extras. */
export type View = Record<string, unknown>;

export function operatorView(s: ServerState): View {
  return {
    ...s.game,
    pool: s.pool,
    participantCount: participantCount(s),
    responses: currentResponses(s),
  };
}

export function displayView(s: ServerState): View {
  return {
    ...publicGame(s.game),
    participantCount: participantCount(s),
    leaderboard: leaderboardData(s),
  };
}

/** The game keys a phone renders. Everything else stays off the phones. */
const PHONE_KEYS = [
  'gameFormat',
  'currentQuestion',
  'currentQuestionNumber',
  'panelGuessSubmitted',
  'currentQuestionAnswerRevealed',
  'revealedOptions',
  'aonRevealedOptions',
  'hiddenOption',
  'allOrNothingActive',
  'allOrNothingAttempt',
  'playAlongAnswerWindowOpen',
  'gameOver',
  'playersResetAt',
] as const satisfies readonly (keyof GameState)[];

/** The room-wide part of a phone's view (identical for every phone). */
export function audienceSharedView(s: ServerState): View {
  const g = publicGame(s.game);
  const out: View = {};
  for (const k of PHONE_KEYS) out[k] = g[k];
  return out;
}

/** This phone's own profile and answers, or null if it hasn't registered. */
export function ownPlayAlong(s: ServerState, uid: string | undefined): OwnPlayAlong | null {
  if (!uid) return null;
  const p = s.players[uid];
  if (!p) return null;
  const answers: OwnPlayAlong['answers'] = {};
  for (const [qNum, rows] of Object.entries(s.answers)) {
    const r = rows[uid];
    if (r) answers[qNum] = { answer: r.answer, questionId: r.questionId };
  }
  return { profile: { uid: p.uid, name: p.name, phone: p.phone, createdAt: p.createdAt }, answers };
}

export function audienceView(s: ServerState, uid: string | undefined): View {
  return { ...audienceSharedView(s), you: ownPlayAlong(s, uid) };
}
