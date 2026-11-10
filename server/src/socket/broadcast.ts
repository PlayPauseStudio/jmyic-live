import type { RoomStore } from '../game/store';
import { audienceSharedView, audienceView, displayView, operatorView, participantCount, type View } from '../game/redact';
import { SRV } from '../protocol/events';
import { type AppServer, type AppSocket, ROOM_OPERATOR, ROOM_DISPLAY, ROOM_AUDIENCE } from './types';

/** How often new play-along answers go out to the operator panel and leaderboard. */
const ANSWER_FLUSH_MS = 400;

/** The last thing each room was sent, per key, as JSON — what patches diff against. */
type Sent = Map<string, string>;

/**
 * Owns all server→client emission and role-based redaction.
 *
 * A socket gets one full state when it connects. After that every update is a
 * patch carrying only the keys whose value changed since the last broadcast to
 * that room. The whole game is a few KB, so comparing JSON per key is cheap and
 * keeps the patches small.
 *
 * Phone answers don't broadcast one by one: they mark the state dirty and a
 * timer sends the moved response table (operator) and leaderboard (display) a
 * few times a second, so a thousand phones answering at once is a handful of
 * messages, not a thousand.
 */
export class Broadcaster {
  private sent: Record<'operator' | 'display' | 'audience', Sent> = {
    operator: new Map(),
    display: new Map(),
    audience: new Map(),
  };
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPlayerCount = 0;

  constructor(
    private readonly io: AppServer,
    private readonly store: RoomStore,
  ) {}

  start(): void {
    if (this.timer) return;
    // Every socket gets a full state on connect, so whatever the store holds
    // now is the baseline the first patch is measured against.
    const s = this.store.getState();
    this.remember('operator', operatorView(s));
    this.remember('display', displayView(s));
    this.remember('audience', audienceSharedView(s));
    this.lastPlayerCount = participantCount(s);
    this.timer = setInterval(() => {
      if (!this.dirty) return;
      this.dirty = false;
      this.broadcastAll();
    }, ANSWER_FLUSH_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Send the appropriate full state to one freshly-connected socket. */
  sendFullTo(socket: AppSocket): void {
    const s = this.store.getState();
    const version = this.store.version;
    const role = socket.data.role;
    const state = role === 'audience' ? audienceView(s, socket.data.uid) : role === 'display' ? displayView(s) : operatorView(s);
    socket.emit(SRV.STATE_FULL, { version, state });
  }

  /** A phone's own profile/answers changed: send that phone (only) its record. */
  sendOwnTo(socket: AppSocket): void {
    const s = this.store.getState();
    socket.emit(SRV.STATE_PATCH, { version: this.store.version, changed: { you: audienceView(s, socket.data.uid).you } });
  }

  /** Play-along answers changed; the next flush sends the summaries. */
  markAnswersDirty(): void {
    this.dirty = true;
  }

  /** Push whatever changed to every room, as small patches. */
  broadcastAll(): void {
    const s = this.store.getState();
    const version = this.store.version;

    const op = this.diff('operator', operatorView(s));
    const disp = this.diff('display', displayView(s));
    const phones = this.diff('audience', audienceSharedView(s));

    // Players were wiped (a reset): every phone's own record is gone.
    const players = participantCount(s);
    if (players < this.lastPlayerCount && players === 0) phones.you = null;
    this.lastPlayerCount = players;

    if (Object.keys(op).length) this.io.to(ROOM_OPERATOR).emit(SRV.STATE_PATCH, { version, changed: op });
    if (Object.keys(disp).length) this.io.to(ROOM_DISPLAY).emit(SRV.STATE_PATCH, { version, changed: disp });
    // Phones go out on the next tick so the operator's ack and the big screen
    // don't queue behind writes to a full room of phones.
    if (Object.keys(phones).length) {
      setImmediate(() => this.io.to(ROOM_AUDIENCE).emit(SRV.STATE_PATCH, { version, changed: phones }));
    }
  }

  private remember(room: keyof Broadcaster['sent'], view: View): void {
    const sent = this.sent[room];
    sent.clear();
    for (const [k, v] of Object.entries(view)) sent.set(k, JSON.stringify(v ?? null));
  }

  /** Keys whose value differs from what the room last got; records the new values. */
  private diff(room: keyof Broadcaster['sent'], view: View): View {
    const sent = this.sent[room];
    const changed: View = {};
    for (const [k, v] of Object.entries(view)) {
      const json = JSON.stringify(v ?? null);
      if (sent.get(k) !== json) {
        sent.set(k, json);
        changed[k] = v ?? null;
      }
    }
    return changed;
  }
}
