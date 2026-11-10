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

  snapshot(): Snapshot {
    return { version: this._version, state: this.state };
  }

  restore(snap: Snapshot): void {
    // A snapshot can come from an older server; fill anything it lacks.
    const s = snap.state ?? ({} as Partial<ServerState>);
    const base = initialServerState();
    this.state = {
      ...base,
      ...s,
      game: normalizeGame(s.game),
      roundStart: s.roundStart ? normalizeGame(s.roundStart) : null,
      pool: s.pool ?? [],
      players: s.players ?? {},
      answers: s.answers ?? {},
      questionMeta: s.questionMeta ?? {},
    };
    this._version = snap.version ?? 0;
  }
}
