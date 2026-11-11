import { OP } from '../protocol/events';
import { correctLetter, isOneShot } from './logic';
import { OPTIONS, type GameState, type LogEntry, type Option, type Question, type ServerState } from './state';

/**
 * The episode log: one row per thing that happened during the show, for the
 * "Episode Log" sheet of the Excel export.
 *
 * Rows are appended in place to `state.log` (the array is shared by every
 * state until Reset Everything swaps in a new one), so logging never copies
 * the log. It is not part of any broadcast view.
 */

/** Hard cap so a flood of failed logins or reconnects can't grow it forever. */
const MAX_ROWS = 20_000;
/** Above this, only game rows are kept (connection noise is dropped). */
const SOFT_ROWS = 15_000;

const clip = (text: string, max = 140): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const rupees = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

/** "Q3", or the contestant's name in One Shot. */
function questionLabel(gs: GameState): string {
  const q = gs.currentQuestion;
  if (!q) return '';
  if (isOneShot(gs)) return q.contestant_name || 'Contestant';
  return `Q${gs.currentQuestionNumber}`;
}

export function appendLog(
  s: ServerState,
  row: { actor: string; event: string; details?: string; q?: string },
  opts: { noise?: boolean } = {},
): void {
  const log = s.log;
  if (log.length >= MAX_ROWS) return;
  if (opts.noise && log.length >= SOFT_ROWS) return;
  const gs = s.game;
  const classic = !isOneShot(gs);
  const entry: LogEntry = {
    t: Date.now(),
    actor: row.actor,
    event: row.event,
    q: row.q ?? questionLabel(gs),
    details: row.details ?? '',
    lives: classic ? gs.lives : null,
    prize: classic ? gs.prize : null,
  };
  log.push(entry);
}

// ── Operator actions ─────────────────────────────────────────────────────────

const FLAG_TEXT: Record<string, (v: unknown) => string> = {
  showLogo: (v) => (v ? 'Logo shown' : 'Logo hidden'),
  show75_25Banner: (v) => (v ? '75:25 banner shown' : '75:25 banner hidden'),
  softEliminated: (v) => (v ? 'Soft Eliminate turned on' : 'Soft Eliminate turned off'),
  showLeaderboard: (v) => (v ? 'Leaderboard shown on big screen' : 'Leaderboard hidden'),
  leaderboardScope: (v) => `Leaderboard view: ${v === 'all' ? 'overall' : `Q${v}`}`,
  leaderboardCorrectFilter: (v) => `Leaderboard filter: ${v}`,
  leaderboardOrder: (v) => `Leaderboard order: ${v}`,
};

const QUESTION_FIELDS: [keyof Question, string][] = [
  ['contestant_name', 'Contestant'],
  ['prize', 'Prize'],
  ['question', 'Question'],
  ['option_a', 'A'],
  ['option_b', 'B'],
  ['option_c', 'C'],
  ['option_d', 'D'],
  ['guest_answer', 'Answer'],
];

function optionText(q: Question | null, o: Option): string {
  if (!q) return o;
  const text = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }[o];
  return text ? `${o}: ${clip(text, 80)}` : o;
}

/** What the operator did, in words. Null = nothing worth a row. */
function describeAction(
  event: string,
  data: Record<string, unknown>,
  before: ServerState,
  after: ServerState,
): { event: string; details?: string; q?: string }[] {
  const b = before.game;
  const a = after.game;
  switch (event) {
    case OP.SET_FORMAT:
      return [{ event: 'Show format changed', details: data.format === 'oneShot' ? 'One Shot' : 'Classic', q: '' }];
    case OP.SELECT_QUESTION: {
      const q = a.currentQuestion;
      if (!q) return [];
      const who = isOneShot(a) ? `${q.contestant_name || 'Contestant'}${q.prize ? ` (prize: ${q.prize})` : ''} — ` : '';
      return [{ event: isOneShot(a) ? 'Contestant up' : 'Question selected', details: `${who}${clip(q.question)}` }];
    }
    case OP.SUBMIT_PANEL_GUESS:
      return [
        {
          event: 'Panel guess',
          details: `${optionText(a.currentQuestion, data.guess as Option)}${b.allOrNothingActive ? ` (All or Nothing, attempt ${b.allOrNothingAttempt})` : ''}`,
        },
      ];
    case OP.CHECK_PANEL_GUESS:
      return [{ event: 'Panel guess checked', details: a.needsManualReveal ? 'Panel wrong — reveal needed' : 'Panel right' }];
    case OP.REVEAL_GUEST_ANSWER:
      return [{ event: 'Guest answer revealed' }];
    case OP.PLACE_LOCK:
      return [{ event: 'Lock placed', details: `Level ${data.level} (${rupees(a.lockedMoney)})` }];
    case OP.HIDE_OPTION:
      return [{ event: 'Lifeline: option hidden', details: optionText(a.currentQuestion, data.option as Option) }];
    case OP.REVEAL_OPTION:
      return [{ event: 'Option revealed', details: optionText(a.currentQuestion, data.option as Option) }];
    case OP.UNREVEAL_OPTION:
      return [{ event: 'Option taken back off screen', details: data.option as string }];
    case OP.REVEAL_ALL_OPTIONS:
      return [{ event: 'All options revealed' }];
    case OP.RESET_QUESTION:
      return [{ event: 'Reset Question', details: 'Round taken back to step 1' }];
    case OP.START_ALL_OR_NOTHING:
      return [{ event: 'All or Nothing started' }];
    case OP.REVEAL_AON_RESULT:
      return [{ event: 'All or Nothing guess revealed', details: optionText(a.currentQuestion, b.panelGuess as Option) }];
    case OP.TOGGLE_AON_MODAL:
      return [{ event: a.allOrNothingModalVisible ? 'All or Nothing screen shown' : 'All or Nothing screen hidden' }];
    case OP.TOGGLE_GUEST_VICTORY:
      return [{ event: a.guestVictoryModalVisible ? 'Victory screen shown' : 'Victory screen hidden' }];
    case OP.TOGGLE_GUEST_LOST:
      return [{ event: a.guestLostModalVisible ? 'Guest-lost screen shown' : 'Guest-lost screen hidden' }];
    case OP.TRIGGER_GAME_OVER:
      return [{ event: 'Game over triggered' }];
    case OP.TRIGGER_BUZZER:
      return [{ event: 'Buzzer' }];
    case OP.SET_FLAGS: {
      const rows: { event: string }[] = [];
      for (const [k, text] of Object.entries(FLAG_TEXT)) {
        const was = (b as unknown as Record<string, unknown>)[k];
        const now = (a as unknown as Record<string, unknown>)[k];
        if (k in data && was !== now) rows.push({ event: text(now) });
      }
      return rows;
    }
    case OP.REPLACE_QUESTIONS:
      return [{ event: 'Questions uploaded', details: `${after.pool.length} rows from CSV`, q: '' }];
    case OP.EDIT_QUESTION: {
      const id = (data.question as { id?: string } | undefined)?.id;
      const old = before.pool.find((q) => q.id === id);
      const now = after.pool.find((q) => q.id === id);
      if (!old || !now) return [];
      const changes = QUESTION_FIELDS.filter(([k]) => (old[k] ?? '') !== (now[k] ?? '')).map(
        ([k, label]) => `${label}: "${clip(String(old[k] ?? ''), 60)}" → "${clip(String(now[k] ?? ''), 60)}"`,
      );
      const which = now.contestant_name || clip(now.question, 50);
      const live = before.game.currentQuestion?.id === id ? ' (on screen)' : '';
      return [{ event: `Question edited${live}`, details: `${which} — ${changes.join('; ') || 'no change'}`, q: live ? undefined : '' }];
    }
    case OP.RESET_GAME:
      return [{ event: 'Reset Game', details: 'Game, players and play-along answers cleared; questions kept', q: '' }];
    case OP.RESET_EVERYTHING:
      return [{ event: 'Reset Everything', details: 'New episode log started', q: '' }];
    case OP.EXPORT_DATA:
      return [{ event: 'Excel backup downloaded', q: '' }];
    default:
      return [];
  }
}

// ── What it led to ───────────────────────────────────────────────────────────

/** Counts of play-along answers for a question number. */
function playAlongSummary(s: ServerState, qNum: number, withCorrect: boolean): string | null {
  const bucket = s.answers[String(qNum)];
  const rows = bucket ? Object.values(bucket) : [];
  if (rows.length === 0) return null;
  const split: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of rows) split[r.answer]++;
  const parts = OPTIONS.map((o) => `${o} ${split[o]}`).join(' · ');
  let text = `${rows.length} answered — ${parts}`;
  const correct = withCorrect ? s.questionMeta[String(qNum)]?.correctAnswer : null;
  if (correct) text += ` — ${split[correct]} got it right (${correct})`;
  return text;
}

function describeOutcomes(before: ServerState, after: ServerState): { actor: string; event: string; details?: string }[] {
  const b = before.game;
  const a = after.game;
  const out: { actor: string; event: string; details?: string }[] = [];
  const sameQuestion = b.currentQuestion?.id && b.currentQuestion.id === a.currentQuestion?.id;

  if (b.playAlongAnswerWindowOpen && !a.playAlongAnswerWindowOpen && sameQuestion) {
    out.push({
      actor: 'Play-along',
      event: 'Answers closed',
      details: playAlongSummary(after, b.currentQuestionNumber, false) ?? 'No phone answers',
    });
  }
  if (!b.currentQuestionAnswerRevealed && a.currentQuestionAnswerRevealed && a.currentQuestion) {
    const letter = correctLetter(a.currentQuestion);
    out.push({ actor: 'Result', event: 'Answer revealed', details: letter ? optionText(a.currentQuestion, letter) : a.currentQuestion.guest_answer });
    const summary = playAlongSummary(after, a.currentQuestionNumber, true);
    if (summary) out.push({ actor: 'Play-along', event: 'Play-along result', details: summary });
  }

  if (!isOneShot(a)) {
    if (a.lives < b.lives) out.push({ actor: 'Result', event: 'Panel right — guest lost a life', details: `${a.lives} left` });
    if (a.questionsAnswered > b.questionsAnswered) {
      out.push({ actor: 'Result', event: 'Panel wrong — guest won the round', details: `${a.questionsAnswered} rounds won` });
    }
    if (a.currentQuestionNumber > b.currentQuestionNumber) {
      out.push({ actor: 'Result', event: 'Guest moved up the ladder', details: `Now playing for ${rupees(a.prize)}` });
    }
  }
  if (!b.guestVictoryPending && a.guestVictoryPending) {
    out.push({ actor: 'Result', event: 'Guest has won', details: a.lock.placed && a.lives === 0 ? `Locked amount ${rupees(a.lockedMoney)}` : rupees(a.prize) });
  }
  if (!b.guestLostPending && a.guestLostPending) out.push({ actor: 'Result', event: 'Guest has lost' });
  if (!b.allOrNothingComplete && a.allOrNothingComplete) {
    out.push({ actor: 'Result', event: a.allOrNothingWon ? 'All or Nothing: guest won ₹50,000' : 'All or Nothing: panel won, guest gets ₹0' });
  } else if (!b.allOrNothingPendingGuestWin && a.allOrNothingPendingGuestWin) {
    out.push({ actor: 'Result', event: 'All or Nothing: both panel attempts wrong — guest wins ₹50,000' });
  } else if (!b.allOrNothingPendingPanelWin && a.allOrNothingPendingPanelWin) {
    out.push({ actor: 'Result', event: 'All or Nothing: panel right — guest gets ₹0' });
  } else if (b.allOrNothingAttempt === 1 && a.allOrNothingAttempt === 2) {
    out.push({ actor: 'Result', event: 'All or Nothing: first attempt wrong — second attempt' });
  }
  if (!b.gameOver && a.gameOver) out.push({ actor: 'Result', event: 'Game over' });

  // One Shot: a contestant's result appeared, flipped (answer edited) or was undone.
  for (const q of after.pool) {
    const was = b.oneShotResults[q.id];
    const now = a.oneShotResults[q.id];
    if (was === now) continue;
    const name = q.contestant_name || clip(q.question, 40);
    if (now) out.push({ actor: 'Result', event: now === 'won' ? 'Contestant won' : 'Contestant lost', details: `${name}${now === 'won' && q.prize ? ` — ${q.prize}` : ''}` });
    else out.push({ actor: 'Result', event: 'Contestant result undone', details: name });
  }
  return out;
}

const NO_OUTCOMES = new Set<string>([OP.RESET_GAME, OP.RESET_EVERYTHING, OP.REPLACE_QUESTIONS, OP.SET_FORMAT]);

/** Log an operator action that went through, and whatever it led to. */
export function logOperatorAction(event: string, data: unknown, before: ServerState, after: ServerState): void {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  for (const row of describeAction(event, d, before, after)) appendLog(after, { actor: 'Operator', ...row });
  // A reset or new upload clears results wholesale; its own row says so.
  if (before === after || NO_OUTCOMES.has(event)) return;
  for (const row of describeOutcomes(before, after)) appendLog(after, row);
}

/** Log an operator action the server refused, and why. */
export function logRefused(s: ServerState, event: string, code: string): void {
  appendLog(s, { actor: 'Operator', event: `Refused: ${event.replace(/^op:/, '')}`, details: code }, { noise: true });
}

/** Connection and server events (logins, big screen joining, restarts). */
export function logSystem(s: ServerState, event: string, details = ''): void {
  appendLog(s, { actor: 'System', event, details, q: '' }, { noise: true });
}
