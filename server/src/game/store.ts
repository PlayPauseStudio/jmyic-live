import { initialServerState, normalizeGame, type ServerState } from './state';

export interface Snapshot {
  version: number;
  state: ServerState;
}

/**
 * Authoritative in-memory store for one show. Holds the ServerState plus a
 * monotonic version counter (bumped on every change; the snapshot timer and
 * clients use it to tell whether anything moved).
 */
export class RoomStore {
  private state: ServerState = initialServerState();
  private _version = 0;

  get version(): number {
    return this._version;
  }

  getState(): ServerState {
    return this.state;
  }

  /** Replace the state with the next one (reducers never mutate) and bump the version. */
  commit(next: ServerState): number {
    if (next === this.state) return this._version;
    this.state = next;
    return ++this._version;
  }

  /**
   * Something outside the broadcast state changed (an episode log row), so the
   * snapshot timer should save even though no game state moved.
   */
  markChanged(): void {
    this._version++;
  }

  snapshot(): Snapshot {
    return { version: this._version, state: this.state };
  }

  restore(snap: Snapshot): void {
    // A snapshot can come from an older server; fill anything it lacks.
    const raw = (snap.state ?? {}) as Partial<ServerState> & { rehearsal?: unknown };
    // Rehearsal mode was removed: drop its settings and any fake players
    // (uid rehearsal_N) a snapshot from that version still holds.
    const { rehearsal: _removed, ...s } = raw;
    void _removed;
    const isFake = (uid: string) => uid.startsWith('rehearsal_');
    const players = Object.fromEntries(Object.entries(s.players ?? {}).filter(([uid]) => !isFake(uid)));
    const answers = Object.fromEntries(
      Object.entries(s.answers ?? {}).map(([q, bucket]) => [
        q,
        Object.fromEntries(Object.entries(bucket).filter(([uid]) => !isFake(uid))),
      ]),
    );
    const base = initialServerState();
    this.state = {
      ...base,
      ...s,
      game: normalizeGame(s.game),
      roundStart: s.roundStart ? normalizeGame(s.roundStart) : null,
      pool: s.pool ?? [],
      players,
      answers,
      questionMeta: s.questionMeta ?? {},
      log: Array.isArray(s.log) ? s.log : [],
    };
    this._version = snap.version ?? 0;
  }
}
