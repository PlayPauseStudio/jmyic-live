import React, { useState } from 'react';
import { gameStateManager } from '@/lib/gameState';
import { GameLogic } from '@/utils/gameLogic';
import type { GameState, GameFormat } from '@/lib/types';

interface FormatToggleProps {
  gameState: GameState;
  onError: (error: string) => void;
}

const FORMATS: { value: GameFormat; label: string; blurb: string }[] = [
  { value: 'classic', label: 'Classic', blurb: 'One guest · prize ladder · lives · lock' },
  { value: 'oneShot', label: 'One Shot', blurb: 'One question each · fixed prize · sudden death' },
];

/**
 * Per-show format switch. A show picks one format and stays there, so this
 * confirms before switching once anything has actually happened — flipping
 * mid-show would strand the state the other format was tracking.
 */
export default function FormatToggle({ gameState, onError }: FormatToggleProps) {
  const [processing, setProcessing] = useState(false);
  const current = gameState.gameFormat;

  // "In progress" means something is on screen or results exist — not merely
  // that a pool has been uploaded.
  const showInProgress =
    !!gameState.currentQuestion ||
    Object.keys(gameState.oneShotResults || {}).length > 0 ||
    gameState.questionsAnswered > 0 ||
    Object.keys(gameState.usedQuestions || {}).length > 0;

  const handleSelect = async (format: GameFormat) => {
    if (processing || format === current) return;

    if (showInProgress) {
      const target = FORMATS.find(f => f.value === format)!.label;
      const ok = confirm(
        `This show is already in progress.\n\n` +
        `Switching to ${target} will not clear the game — the two formats track ` +
        `different things, so the screen may show leftover state from the current one. ` +
        `Reset the game after switching.\n\nSwitch anyway?`
      );
      if (!ok) return;
    }

    try {
      setProcessing(true);
      await gameStateManager.updateGameState({ gameFormat: format });
    } catch (error) {
      onError(`Failed to switch format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-white">Show Format</h2>
        {showInProgress && (
          <span className="text-xs text-yellow-400 uppercase tracking-wide">Show in progress</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {FORMATS.map(({ value, label, blurb }) => {
          const active = current === value;
          return (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              disabled={processing}
              className={`rounded-lg p-3 text-left transition-colors disabled:opacity-50 ${
                active
                  ? 'bg-blue-600 ring-2 ring-blue-300 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="font-bold text-sm mb-1">
                {active ? '● ' : '○ '}{label}
              </div>
              <div className="text-xs opacity-80 leading-snug">{blurb}</div>
            </button>
          );
        })}
      </div>

      {GameLogic.isOneShot(gameState) && (
        <p className="text-xs text-gray-400 mt-3">
          Upload the One Shot CSV (one row per contestant), then pick whoever comes on stage
          from the pool. Judge right = contestant loses, judge wrong = contestant wins the prize.
        </p>
      )}
    </div>
  );
}
