import type { RoomStore } from './store';
import type { Broadcaster } from '../socket/broadcast';
import { FAKE_UID_PREFIX, recordAnswer } from './reducers';
import type { Option, ServerState } from './state';
import { logger } from '../util/logger';

/** How often fake players get a chance to answer. */
const TICK_MS = 300;
/** Chance per tick that a fake player who hasn't answered does — about 3 s on average. */
const ANSWER_CHANCE = 0.08;
/** How often a fake player picks the right answer when it's on screen. */
const RIGHT_CHANCE = 0.55;

/**
 * Rehearsal mode: fake players answer the question on screen by themselves,
 * through the same recordAnswer path as real phones, so the operator table and
 * big-screen leaderboard behave exactly as on show day. They wait until at
 * least two options are up, then trickle in over a few seconds.
 */
export class FakePlayers {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: RoomStore,
    private readonly broadcaster: Broadcaster,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (e) {
        logger.warn({ err: e instanceof Error ? e.message : e }, 'Fake player tick failed');
      }
    }, TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const s = this.store.getState();
    if (s.rehearsal.bots === 0 || !s.rehearsal.autoAnswer) return;
    const gs = s.game;
    if (!gs.currentQuestion || !gs.playAlongAnswerWindowOpen || gs.currentQuestionAnswerRevealed) return;
    const shown = (gs.allOrNothingActive ? gs.aonRevealedOptions : gs.revealedOptions) ?? [];
    const visible = shown.filter((o) => o !== gs.hiddenOption);
    if (visible.length < 2) return;

    const qKey = String(gs.currentQuestionNumber);
    const correct = s.questionMeta[qKey]?.correctAnswer ?? null;
    let state: ServerState = s;
    let changed = false;
    for (const uid of Object.keys(s.players)) {
      if (!uid.startsWith(FAKE_UID_PREFIX)) continue;
      if (state.answers[qKey]?.[uid]) continue;
      if (Math.random() > ANSWER_CHANCE) continue;
      const pick: Option =
        correct && visible.includes(correct) && Math.random() < RIGHT_CHANCE
          ? correct
          : visible[Math.floor(Math.random() * visible.length)];
      state = recordAnswer(state, uid, pick);
      changed = true;
    }
    if (changed) {
      this.store.commit(state);
      this.broadcaster.markAnswersDirty();
    }
  }
}
