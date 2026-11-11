// Thin Socket.IO client for talking to jmyic-server. Mirrors the server's wire
// protocol (server/src/protocol/events.ts) — change both together. The server
// is the authority for game state; pages emit intent and receive redacted state.

import { io, type Socket } from 'socket.io-client';

export type Role = 'operator' | 'display' | 'audience';

// The realtime server URL (https in prod). Falls back to localhost in dev.
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080';

if (
  typeof window !== 'undefined' &&
  !process.env.NEXT_PUBLIC_WS_URL &&
  !['localhost', '127.0.0.1'].includes(window.location.hostname)
) {
  // eslint-disable-next-line no-console
  console.error('NEXT_PUBLIC_WS_URL was not set when this site was built — it is trying to reach a game server on localhost.');
}

export const OP = {
  SET_FORMAT: 'op:setFormat',
  SELECT_QUESTION: 'op:selectQuestion',
  SUBMIT_PANEL_GUESS: 'op:submitPanelGuess',
  CHECK_PANEL_GUESS: 'op:checkPanelGuess',
  REVEAL_GUEST_ANSWER: 'op:revealGuestAnswer',
  PLACE_LOCK: 'op:placeLock',
  HIDE_OPTION: 'op:hideOption',
  REVEAL_OPTION: 'op:revealOption',
  UNREVEAL_OPTION: 'op:unrevealOption',
  REVEAL_ALL_OPTIONS: 'op:revealAllOptions',
  RESET_QUESTION: 'op:resetQuestion',
  START_ALL_OR_NOTHING: 'op:startAllOrNothing',
  REVEAL_AON_RESULT: 'op:revealAonResult',
  TOGGLE_AON_MODAL: 'op:toggleAonModal',
  TOGGLE_GUEST_VICTORY: 'op:toggleGuestVictory',
  TOGGLE_GUEST_LOST: 'op:toggleGuestLost',
  TRIGGER_GAME_OVER: 'op:triggerGameOver',
  SET_FLAGS: 'op:setFlags',
  TRIGGER_BUZZER: 'op:triggerBuzzer',
  REPLACE_QUESTIONS: 'op:replaceQuestions',
  EDIT_QUESTION: 'op:editQuestion',
  RESET_GAME: 'op:resetGame',
  RESET_EVERYTHING: 'op:resetEverything',
  EXPORT_DATA: 'op:exportData',
  STATUS: 'op:status',
  REHEARSAL_ADD: 'op:rehearsalAdd',
  REHEARSAL_CLEAR: 'op:rehearsalClear',
  REHEARSAL_AUTO: 'op:rehearsalAuto',
} as const;

export const AUD = {
  REGISTER: 'aud:register',
  ANSWER: 'aud:answer',
} as const;

export const SRV = {
  STATE_FULL: 'state:full',
  STATE_PATCH: 'state:patch',
} as const;

export interface Ack {
  ok: boolean;
  error?: string;
  classicNeedsReset?: boolean;
  data?: unknown;
  status?: unknown;
}

export type TokenProvider = () => Promise<string | null> | string | null;

/**
 * Create a socket for a role. `getToken` is re-run on every (re)connect: the
 * operator's JWT, a phone's fresh Firebase ID token, or the optional display key.
 */
export function createGameSocket(role: Role, getToken?: TokenProvider): Socket {
  return io(WS_URL, {
    // Polling first, then upgrade: some mobile networks (Jio) mangle the
    // websocket upgrade, and pinning websocket-only left those phones with no
    // connection at all. Same setting as bachelor-gameshow-live.
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    auth: (cb) => {
      Promise.resolve(getToken ? getToken() : null)
        .then((token) => cb({ role, token: token ?? undefined }))
        .catch(() => cb({ role }));
    },
  });
}

/** Promise-based emit that resolves the server ack. */
export function emitAck(socket: Socket, event: string, payload?: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload ?? {}, (err: unknown, ack: Ack) => {
      if (err) resolve({ ok: false, error: 'timeout' });
      else resolve(ack ?? { ok: false, error: 'no_ack' });
    });
  });
}

/** POST the operator password to the server; returns a JWT, or an error code. */
export async function operatorLogin(password: string): Promise<{ token?: string; error?: string }> {
  try {
    const res = await fetch(`${WS_URL}/auth/operator/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok) return { error: data.error ?? `http_${res.status}` };
    return { token: data.token };
  } catch {
    return { error: 'server_unreachable' };
  }
}
