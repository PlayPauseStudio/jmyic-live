'use client';

/**
 * Socket-backed game state manager.
 *
 * This replaces the old Realtime Database manager. Nothing is written by the
 * browser any more: every change is an intent sent to jmyic-server, which
 * checks it, applies the game rules and broadcasts the result back. Pages
 * subscribe exactly as before and receive a GameState — redacted by the server
 * for their role (see server/src/game/redact.ts).
 */

import type { Socket } from 'socket.io-client';
import { createGameSocket, emitAck, SRV, type Ack, type Role, type TokenProvider } from './realtime';
import type { GameState, LeaderboardData, QuestionMeta, ResponseRow } from './types';

interface StateMsg {
  version: number;
  state: GameState;
}

interface PatchMsg {
  version: number;
  changed: Partial<GameState>;
}

// Play-along answers arrive as compact rows (see server/src/game/redact.ts).
type ResponseTuple = [string, string, ResponseRow['answer'], number, number];
type LeaderboardTuple = [string, ResponseRow['answer'], number, number];
type LeaderboardAnswers = LeaderboardData['answers'];

// Rows that are already objects pass through, so the site keeps working for the
// moment a deploy has the new site talking to the previous server.
function expandResponses(rows: (ResponseTuple | ResponseRow)[] | null | undefined): ResponseRow[] {
  return (rows ?? []).map((r) =>
    Array.isArray(r) ? { uid: r[0], name: r[1], answer: r[2], timestamp: r[3], responseTimeMs: r[4] } : r,
  );
}

function expandBucket(rows: Record<string, LeaderboardTuple | LeaderboardAnswers[string][string]>): LeaderboardAnswers[string] {
  const out: LeaderboardAnswers[string] = {};
  for (const [uid, r] of Object.entries(rows)) {
    out[uid] = Array.isArray(r) ? { name: r[0], answer: r[1], timestamp: r[2], responseTimeMs: r[3] } : r;
  }
  return out;
}

type Listener = () => void;

/** Readable messages for the server's error codes. */
const ERROR_TEXT: Record<string, string> = {
  timeout: 'The server did not answer — check the connection.',
  not_connected: 'Not connected to the server.',
  forbidden: 'Not allowed — sign in again.',
  bad_payload: 'The server rejected that request.',
  no_question: 'Select a question first.',
  question_used: 'That question has already been used.',
  unknown_question: 'That question no longer exists — the pool may have changed.',
  already_checked: 'The panel guess has already been checked.',
  no_guess: 'Pick a panel guess first.',
  nothing_to_reveal: 'There is nothing to reveal right now.',
  lock_unavailable: 'The lock is not available.',
  hide_used: 'The hide-option lifeline has already been used.',
  aon_unavailable: 'All or Nothing is not available yet.',
  aon_active: 'Not available during All or Nothing.',
  aon_complete: 'All or Nothing is already over.',
  already_guessed: 'The panel already tried that option.',
  game_over_unavailable: 'Game over is not available right now.',
  too_many_fake: 'The fake-player limit (2000) is reached.',
  server_error: 'Server error — try again.',
};

export function errorText(code: string | undefined): string {
  return (code && ERROR_TEXT[code]) || code || 'Unknown error';
}

class GameStateManager {
  private socket: Socket | null = null;
  private role: Role | null = null;
  private state: GameState | null = null;
  // The leaderboard arrives as grading plus one `lb:<question>` key per
  // question; these are put back together into gameState.leaderboard.
  private lbMeta: { meta: Record<string, QuestionMeta> } | null = null;
  private lbAnswers: LeaderboardAnswers = {};
  private connected = false;
  private lastError: string | null = null;
  private listeners = new Set<Listener>();
  private teardown: (() => void) | null = null;

  /**
   * Open (or reuse) the socket for a role. Calling it again with the same role
   * is a no-op, so pages can call it from an effect without churn.
   */
  connect(role: Role, getToken?: TokenProvider): void {
    if (this.role === role && this.socket) return;
    this.closeSocket();
    this.state = null;
    this.role = role;
    this.openSocket(role, getToken);
  }

  disconnect(): void {
    this.closeSocket();
    this.role = null;
    this.state = null;
  }

  private closeSocket(): void {
    this.teardown?.();
    this.teardown = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.socket = null;
    this.connected = false;
  }

  private openSocket(role: Role, getToken?: TokenProvider): void {
    const socket = createGameSocket(role, getToken);
    this.socket = socket;

    socket.on('connect', () => {
      this.connected = true;
      this.lastError = null;
      this.emitChange();
    });
    socket.on('disconnect', () => {
      this.connected = false;
      this.emitChange();
    });
    // Handshake rejected (bad/expired token). Socket.IO stops retrying after a
    // middleware error, so the page decides what to do (e.g. show the login).
    socket.on('connect_error', (err: Error) => {
      this.lastError = err.message;
      this.emitChange();
    });
    socket.on(SRV.STATE_FULL, (msg: StateMsg) => {
      this.lbMeta = null;
      this.lbAnswers = {};
      this.state = this.apply({} as GameState, msg.state as unknown as Record<string, unknown>, true);
      this.emitChange();
    });
    socket.on(SRV.STATE_PATCH, (msg: PatchMsg) => {
      if (!this.state) return; // a full state always comes first
      this.state = this.apply(this.state, msg.changed as Record<string, unknown>, false);
      this.emitChange();
    });

    // Phones drop the socket when the screen locks. Reconnect the moment the
    // page is visible again; the server answers with a fresh full state.
    if (typeof document !== 'undefined') {
      const resume = () => {
        if (document.visibilityState !== 'visible') return;
        if (!socket.connected) socket.connect();
      };
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('online', resume);
      window.addEventListener('focus', resume);
      this.teardown = () => {
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('online', resume);
        window.removeEventListener('focus', resume);
      };
    }
  }

  /** Merge server keys into the state, expanding the compact play-along rows. */
  private apply(base: GameState, changed: Record<string, unknown>, full: boolean): GameState {
    const next: Record<string, unknown> = { ...base };
    let leaderboardTouched = full;
    for (const [k, v] of Object.entries(changed)) {
      if (k.startsWith('lb:')) {
        const q = k.slice(3);
        if (v) this.lbAnswers = { ...this.lbAnswers, [q]: expandBucket(v as Record<string, LeaderboardTuple>) };
        else {
          const rest = { ...this.lbAnswers };
          delete rest[q];
          this.lbAnswers = rest;
        }
        leaderboardTouched = true;
      } else if (k === 'leaderboard') {
        const lb = v as { meta: Record<string, QuestionMeta>; answers?: LeaderboardAnswers } | null;
        this.lbMeta = lb ? { meta: lb.meta } : null;
        // The previous server sent every question's answers inside this key.
        if (lb?.answers) this.lbAnswers = lb.answers;
        leaderboardTouched = true;
      } else if (k === 'responses') {
        next.responses = expandResponses(v as ResponseTuple[] | null);
      } else {
        next[k] = v;
      }
    }
    if (leaderboardTouched) {
      next.leaderboard = this.lbMeta ? { meta: this.lbMeta.meta, answers: this.lbAnswers } : null;
    }
    return next as unknown as GameState;
  }

  private emitChange(): void {
    this.listeners.forEach((fn) => fn());
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** The last handshake error ('unauthorized' when a token was refused). */
  getLastError(): string | null {
    return this.lastError;
  }

  getCurrentLocalState(): GameState | null {
    return this.state;
  }

  /** Called with the latest state now (if any) and on every server update. */
  subscribeToGameState(cb: (state: GameState) => void): () => void {
    const deliver = () => {
      if (this.state) cb(this.state);
    };
    this.listeners.add(deliver);
    deliver();
    return () => {
      this.listeners.delete(deliver);
    };
  }

  /** Connection status + last handshake error, for banners and the login gate. */
  subscribeToConnection(cb: (connected: boolean, error: string | null) => void): () => void {
    const deliver = () => cb(this.connected, this.lastError);
    this.listeners.add(deliver);
    deliver();
    return () => {
      this.listeners.delete(deliver);
    };
  }

  /** Send an intent and get the server's answer. Never throws. */
  async send(event: string, payload?: unknown): Promise<Ack> {
    if (!this.socket) return { ok: false, error: 'not_connected' };
    return emitAck(this.socket, event, payload);
  }

  /** Send an intent; throws an Error with a readable message if it was refused. */
  async sendOrThrow(event: string, payload?: unknown): Promise<Ack> {
    const ack = await this.send(event, payload);
    if (!ack.ok) throw new Error(errorText(ack.error));
    return ack;
  }
}

export const gameStateManager = new GameStateManager();
