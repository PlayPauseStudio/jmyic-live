import { z } from 'zod';
import type { RoomStore } from '../../game/store';
import type { ServerState } from '../../game/state';
import type { Broadcaster } from '../broadcast';
import type { AppSocket } from '../types';
import { logger } from '../../util/logger';
import { OP, type Ack } from '../../protocol/events';
import * as R from '../../game/reducers';
import * as S from '../../validation/schemas';

const empty = z.object({}).default({});

export interface HandlerCtx {
  store: RoomStore;
  broadcaster: Broadcaster;
}

export function registerOperatorHandlers(socket: AppSocket, ctx: HandlerCtx): void {
  const { store, broadcaster } = ctx;
  const gs = (): ServerState => store.getState();

  /** Commit the next state and push it to every room. */
  const apply = (next: ServerState): void => {
    if (next === store.getState()) return;
    store.commit(next);
    broadcaster.broadcastAll();
  };

  /**
   * Register an operator event: role guard + zod validation + ack + errors.
   * The body may return extra ack fields.
   */
  function on<T>(
    event: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body: (data: T) => void | Partial<Ack>,
  ): void {
    socket.on(event, (payload: unknown, ack?: (a: Ack) => void) => {
      const cb = typeof ack === 'function' ? ack : () => {};
      // Every handler re-checks the role, so a display/phone socket emitting
      // op:* gets an explicit `forbidden` ack and can never change the game.
      if (socket.data.role !== 'operator') {
        cb({ ok: false, error: 'forbidden' });
        return;
      }
      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        cb({ ok: false, error: 'bad_payload' });
        return;
      }
      try {
        const extra = body(parsed.data);
        cb({ ok: true, ...(extra ?? {}) });
      } catch (e) {
        if (e instanceof R.OpError) {
          cb({ ok: false, error: e.code });
          return;
        }
        logger.error({ event, err: e instanceof Error ? e.message : e }, 'Operator handler error');
        cb({ ok: false, error: 'server_error' });
      }
    });
  }

  // ── Format + question selection ────────────────────────────────────────────
  on(OP.SET_FORMAT, S.formatSchema, (d) => apply(R.setFormat(gs(), d.format)));
  on(OP.SELECT_QUESTION, S.questionRefSchema, (d) => apply(R.selectQuestion(gs(), d.questionId)));

  // ── Round flow ─────────────────────────────────────────────────────────────
  on(OP.SUBMIT_PANEL_GUESS, S.guessSchema, (d) => apply(R.submitPanelGuess(gs(), d.guess)));
  on(OP.CHECK_PANEL_GUESS, empty, () => apply(R.checkPanelGuess(gs())));
  on(OP.REVEAL_GUEST_ANSWER, empty, () => apply(R.revealGuestAnswer(gs())));
  on(OP.RESET_QUESTION, empty, () => apply(R.resetQuestion(gs())));

  // ── Options + lifelines ────────────────────────────────────────────────────
  on(OP.REVEAL_OPTION, S.optionSchema, (d) => apply(R.revealOption(gs(), d.option)));
  on(OP.UNREVEAL_OPTION, S.optionSchema, (d) => apply(R.unrevealOption(gs(), d.option)));
  on(OP.REVEAL_ALL_OPTIONS, empty, () => apply(R.revealAllOptions(gs())));
  on(OP.HIDE_OPTION, S.optionSchema, (d) => apply(R.hideOption(gs(), d.option)));
  on(OP.PLACE_LOCK, S.lockSchema, (d) => apply(R.placeLock(gs(), d.level)));

  // ── All or Nothing + end of game ───────────────────────────────────────────
  on(OP.START_ALL_OR_NOTHING, empty, () => apply(R.startAllOrNothing(gs())));
  on(OP.REVEAL_AON_RESULT, empty, () => apply(R.revealAllOrNothingResult(gs())));
  on(OP.TOGGLE_AON_MODAL, empty, () => apply(R.toggleAllOrNothingModal(gs())));
  on(OP.TOGGLE_GUEST_VICTORY, empty, () => apply(R.toggleGuestVictoryModal(gs())));
  on(OP.TOGGLE_GUEST_LOST, empty, () => apply(R.toggleGuestLostModal(gs())));
  on(OP.TRIGGER_GAME_OVER, empty, () => apply(R.triggerGameOver(gs())));

  // ── Screen toggles ─────────────────────────────────────────────────────────
  on(OP.SET_FLAGS, S.flagsSchema, (d) => apply(R.setFlags(gs(), d)));
  on(OP.TRIGGER_BUZZER, empty, () => apply(R.triggerBuzzer(gs())));

  // ── Question pool ──────────────────────────────────────────────────────────
  on(OP.REPLACE_QUESTIONS, S.replaceQuestionsSchema, (d) => {
    apply(R.replaceQuestions(gs(), d.questions));
    logger.info({ count: d.questions.length }, 'Operator uploaded questions');
  });
  on(OP.EDIT_QUESTION, S.editQuestionSchema, (d) => {
    const { next, classicNeedsReset } = R.editQuestion(gs(), d.question);
    apply(next);
    return { classicNeedsReset };
  });

  // ── Resets ─────────────────────────────────────────────────────────────────
  on(OP.RESET_GAME, empty, () => {
    apply(R.resetGame(gs()));
    logger.info('Operator reset the game');
  });
  on(OP.RESET_EVERYTHING, empty, () => {
    apply(R.resetEverything(gs()));
    logger.info('Operator reset everything');
  });

  // ── Export (read-only) ─────────────────────────────────────────────────────
  // The only place phone numbers leave the server: the operator's backup file.
  on(OP.EXPORT_DATA, empty, () => {
    const s = gs();
    return {
      data: {
        gameState: s.game,
        answers: s.answers,
        questionsMeta: s.questionMeta,
        questionsPool: s.pool,
        questionsPoolUpdated: s.poolUpdatedAt,
        participants: Object.values(s.players),
      },
    };
  });
}
