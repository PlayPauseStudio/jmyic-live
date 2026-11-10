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
import type { GameState } from './types';

interface StateMsg {
  version: number;
  state: GameState;
}

interface PatchMsg {
  version: number;
  changed: Partial<GameState>;
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
  server_error: 'Server error — try again.',
};

export function errorText(code: string | undefined): string {
  return (code && ERROR_TEXT[code]) || code || 'Unknown error';
}

class GameStateManager {
  private socket: Socket | null = null;
  private role: Role | null = null;
  private state: GameState | null = null;
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
      this.state = msg.state;
      this.emitChange();
    });
    socket.on(SRV.STATE_PATCH, (msg: PatchMsg) => {
      if (!this.state) return; // a full state always comes first
      this.state = { ...this.state, ...msg.changed };
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
