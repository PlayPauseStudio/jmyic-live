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
    <div className={`rounded-lg px-6 py-6 transition-all duration-500 ${toneClasses}`}>
      <div className="text-center leading-tight">
        <span className="text-white text-5xl xl:text-7xl font-bold font-bebas">
          {name || 'Contestant'}
        </span>
        <span className="text-white text-4xl xl:text-6xl font-bebas opacity-70 mx-3">
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

/** Small header counter: which contestant is currently up. */
export function OneShotPlayerCount({ gameState }: OneShotBannerProps) {
  const played = Object.keys(gameState.oneShotResults || {}).length;
  const current = gameState.currentQuestion
    ? (gameState.oneShotOutcome ? played : played + 1)
    : played;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="text-gray-400 text-2xl xl:text-3xl uppercase tracking-widest font-bebas leading-none">
        Player
      </div>
      <div className="text-white text-4xl xl:text-5xl font-bold font-bebas leading-none">
        {Math.max(current, 1)}
      </div>
    </div>
  );
}
