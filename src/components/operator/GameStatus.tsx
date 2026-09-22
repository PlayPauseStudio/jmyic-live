import React from 'react';
import type { GameState } from '@/lib/types';
import { PRIZE_TIERS } from '@/lib/firebase';
import { GameLogic } from '@/utils/gameLogic';

interface GameStatusProps {
  gameState: GameState;
}

export default function GameStatus({ gameState }: GameStatusProps) {
  const currentPrize = GameLogic.getPrizeForLevel(gameState.currentQuestionNumber);
  const currentTier = GameLogic.getCurrentPrizeTier(gameState);

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Game Status</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Current Level */}
        <div className="bg-blue-600 rounded-lg p-4 text-center">
          <div className="text-blue-100 text-sm">Current Level</div>
          <div className="text-2xl font-bold text-white">{gameState.currentQuestionNumber}</div>
        </div>

        {/* Current Prize */}
        <div className="bg-green-600 rounded-lg p-4 text-center">
          <div className="text-green-100 text-sm">Current Prize</div>
          <div className="text-2xl font-bold text-white">₹{currentPrize.toLocaleString()}</div>
        </div>

        {/* Lives */}
        <div className={`rounded-lg p-4 text-center ${
          gameState.lives > 0 ? 'bg-yellow-600' : 'bg-red-600'
        }`}>
          <div className="text-yellow-100 text-sm">Lives</div>
          <div className="text-2xl font-bold text-white">{gameState.lives}</div>
          {gameState.lifeUsed && (
            <div className="text-xs text-yellow-100">Immunity Used</div>
          )}
        </div>

        {/* Lock Status */}
        <div className={`rounded-lg p-4 text-center ${
          gameState.lock.placed ? 'bg-purple-600' : 'bg-gray-600'
        }`}>
          <div className="text-gray-100 text-sm">Lock Status</div>
          <div className="text-xl font-bold text-white">
            {gameState.lock.placed ? `₹${gameState.lockedMoney.toLocaleString()}` : 'Not Placed'}
          </div>
        </div>
      </div>

      {/* Prize Ladder */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-white mb-3">Prize Ladder</h3>
        <div className="grid grid-cols-7 gap-2">
          {PRIZE_TIERS.map((tier) => (
            <div
              key={tier.level}
              className={`p-3 rounded-lg text-center text-sm ${
                tier.level === gameState.currentQuestionNumber
                  ? 'bg-yellow-500 text-black font-bold'
                  : tier.level < gameState.currentQuestionNumber
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-600 text-gray-300'
              } ${
                gameState.lock.placed && tier.level === gameState.lock.level
                  ? 'ring-2 ring-purple-400'
                  : ''
              }`}
            >
              <div className="font-semibold">L{tier.level}</div>
              <div>{tier.displayText}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Game State Indicators */}
      <div className="mt-4 flex flex-wrap gap-2">
        {gameState.softEliminated && (
          <span className="px-3 py-1 bg-red-500 text-white rounded-full text-sm">
            Soft Eliminated
          </span>
        )}
        {gameState.gameOver && (
          <span className="px-3 py-1 bg-gray-500 text-white rounded-full text-sm">
            Game Over
          </span>
        )}
        {GameLogic.canPlaceLock(gameState) && (
          <span className="px-3 py-1 bg-purple-500 text-white rounded-full text-sm">
            Can Place Lock
          </span>
        )}
      </div>
    </div>
  );
}