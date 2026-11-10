import type { z } from 'zod';
import type { AppSocket } from '../types';
import type { HandlerCtx } from './operator';
import type { TokenBucketLimiter } from '../../util/rateLimit';
import { logger } from '../../util/logger';
import { AUD, type Ack } from '../../protocol/events';
import { answerSchema, registerSchema } from '../../validation/schemas';
import { OpError, recordAnswer, registerPlayer } from '../../game/reducers';
import type { ServerState } from '../../game/state';

/**
 * Play-along phones. The uid always comes from the verified Firebase token
 * stamped on the socket at handshake — never from the payload — so a phone can
 * only ever register or answer as itself.
 */
export function registerAudienceHandlers(socket: AppSocket, ctx: HandlerCtx, limiter: TokenBucketLimiter): void {
  const { store, broadcaster } = ctx;

  function on<T>(
    event: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body: (uid: string, data: T) => ServerState,
    badPayload: (field: string | undefined) => string = () => 'bad_payload',
  ): void {
    socket.on(event, (payload: unknown, ack?: (a: Ack) => void) => {
      const cb = typeof ack === 'function' ? ack : () => {};
      const uid = socket.data.uid;
      if (socket.data.role !== 'audience' || !uid) {
        cb({ ok: false, error: 'forbidden' });
        return;
      }
      if (!limiter.take(uid)) {
        cb({ ok: false, error: 'rate_limited' });
        return;
      }
      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        cb({ ok: false, error: badPayload(parsed.error.issues[0]?.path[0]?.toString()) });
        return;
      }
      try {
        store.commit(body(uid, parsed.data));
        broadcaster.markAnswersDirty();
        // Echo this phone's own record straight back, so its screen shows what
        // the server accepted rather than what it hoped it sent.
        broadcaster.sendOwnTo(socket);
        cb({ ok: true });
      } catch (e) {
        if (e instanceof OpError) {
          cb({ ok: false, error: e.code });
          return;
        }
        logger.error({ event, err: e instanceof Error ? e.message : e }, 'Audience handler error');
        cb({ ok: false, error: 'server_error' });
      }
    });
  }

  on(
    AUD.REGISTER,
    registerSchema,
    (uid, d) => {
      const next = registerPlayer(store.getState(), uid, d.name, `+91${d.phone}`);
      logger.info({ uid }, 'aud:register');
      return next;
    },
    (field) => (field === 'phone' ? 'bad_phone' : field === 'name' ? 'bad_name' : 'bad_payload'),
  );

  on(AUD.ANSWER, answerSchema, (uid, d) => recordAnswer(store.getState(), uid, d.answer));
}
