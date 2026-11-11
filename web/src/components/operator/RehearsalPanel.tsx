'use client';

import { useState } from 'react';
import { gameStateManager } from '@/lib/gameState';
import { OP } from '@/lib/realtime';
import type { GameState } from '@/lib/types';

interface Props {
  gameState: GameState;
  onError: (msg: string) => void;
}

const BATCHES = [50, 200, 1000];

/**
 * Rehearsal mode: fake players that answer by themselves, so the play-along
 * table and the big-screen leaderboard can be tried without real phones.
 */
export default function RehearsalPanel({ gameState, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const bots = gameState.rehearsal?.bots ?? 0;
  const autoAnswer = gameState.rehearsal?.autoAnswer ?? true;

  const send = async (event: string, payload?: unknown) => {
    setBusy(true);
    try {
      await gameStateManager.sendOrThrow(event, payload);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Rehearsal action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-lg p-6 border-2 ${bots > 0 ? 'bg-amber-950/60 border-amber-500' : 'bg-gray-800 border-transparent'}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-bold text-lg">Rehearsal mode</h2>
        <span className={`text-sm font-semibold ${bots > 0 ? 'text-amber-300' : 'text-gray-400'}`}>
          {bots > 0 ? `${bots} fake players` : 'Off'}
        </span>
      </div>
      <p className="text-gray-400 text-sm mb-4">
        Adds fake players who answer on their own a few seconds after two or more options are up — about half pick the
        right answer. Use it to try the play-along table and the leaderboard screen.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {BATCHES.map((n) => (
          <button
            key={n}
            disabled={busy}
            onClick={() => send(OP.REHEARSAL_ADD, { count: n })}
            className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-black text-sm font-bold"
          >
            + {n} fake
          </button>
        ))}
      </div>

      {bots > 0 && (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-200 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAnswer}
              disabled={busy}
              onChange={(e) => send(OP.REHEARSAL_AUTO, { on: e.target.checked })}
              className="w-4 h-4"
            />
            Fake players answer automatically
          </label>

          {confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-200">Remove all {bots} fake players and their answers?</span>
              <button
                disabled={busy}
                onClick={async () => {
                  await send(OP.REHEARSAL_CLEAR);
                  setConfirmRemove(false);
                }}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-bold"
              >
                Remove
              </button>
              <button onClick={() => setConfirmRemove(false)} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm">
                Cancel
              </button>
            </div>
          ) : (
            <button
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
              className="w-full px-3 py-2 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-bold"
            >
              Remove all fake players
            </button>
          )}
          <p className="text-gray-400 text-xs mt-3">
            Real phones are never touched. Reset Game and Reset Everything also remove fake players.
          </p>
        </>
      )}
    </div>
  );
}
