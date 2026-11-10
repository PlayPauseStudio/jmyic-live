import React from 'react';
import type { GameState } from '@/lib/types';

interface OneShotBannerProps {
  gameState: GameState;
}

/**
 * One Shot replacement for the prize ladder: who is up, and what they are
 * playing for. Once the round resolves it also carries the win/lose result,
 * so the operator does not need a separate reveal screen.
 */
export default function OneShotBanner({ gameState }: OneShotBannerProps) {
  const question = gameState.currentQuestion;
  const name = question?.contestant_name?.trim();
  const prize = question?.prize?.trim();
  const outcome = gameState.oneShotOutcome;

  // Which contestant this is. The result is recorded the moment the round
  // resolves, so once resolved the count already includes this player.
  const played = Object.keys(gameState.oneShotResults || {}).length;
  const playerNumber = Math.max(outcome ? played : played + 1, 1);

  // Nothing selected yet — hold the space so the layout doesn't jump when the
  // operator brings the first contestant up.
  if (!question) {
    return (
      <div className="game-card-gradient rounded-lg px-6 py-8 flex items-center justify-center">
        <div className="text-gray-400 text-4xl xl:text-5xl font-bebas uppercase tracking-widest">
          Waiting for the next player
        </div>
      </div>
    );
  }

  const toneClasses =
    outcome === 'won'
      ? 'bg-gradient-to-r from-green-600 to-green-500 shadow-xl shadow-green-500/40'
      : outcome === 'lost'
        ? 'bg-gradient-to-r from-red-700 to-red-600 shadow-xl shadow-red-500/40'
        : 'game-card-gradient';

  // Reads as one sentence: "Vivaan playing for iPhone 16".
  const verb = outcome === 'won' ? 'wins' : outcome === 'lost' ? 'played for' : 'playing for';

  return (
    <div className={`relative rounded-lg px-6 py-6 transition-all duration-500 ${toneClasses}`}>
      {/* Pinned to the left edge so the sentence stays optically centred in the
          box no matter how wide the number gets. */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white text-4xl xl:text-6xl font-bold font-bebas leading-none opacity-80">
        {playerNumber}.
      </div>

      <div className="text-center leading-tight px-20">
        <span className="text-white text-5xl xl:text-7xl font-bold font-bebas">
          {name || 'Contestant'}
        </span>
        <span className="text-white text-2xl xl:text-4xl font-bebas opacity-70 mx-3">
          {verb}
        </span>
        <span
          className={`text-5xl xl:text-7xl font-bold font-bebas ${
            outcome ? 'text-white' : 'text-yellow-300'
          }`}
        >
          {prize || 'Prize'}
        </span>
      </div>
    </div>
  );
}
