import React from 'react';
import type { GameState } from '@/lib/types';
import { GameLogic } from '@/utils/gameLogic';

interface LivesDisplayProps {
  gameState: GameState;
}

export default function LivesDisplay({ gameState }: LivesDisplayProps) {
  return (
    <div className="bg-transparent">
        {/* Lives Status */}
        <div className="text-center flex flex-row justify-center">
          <div className="text-gray-400 text-5xl uppercase tracking-wide font-bebas mr-3">Lives</div>
          <div className="flex justify-center space-x-1 mb-3">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className={`text-5xl transition-all duration-500 ${
                  i < gameState.lives 
                    ? 'text-red-500 drop-shadow-lg' 
                    : 'text-gray-600 opacity-50'
                }`}
              >
                ❤️
              </div>
            ))}
          </div>
          {/*<div className="text-xs text-gray-400 mt-1">
            {gameState.lives > 0 
              ? `${gameState.lives === 2 ? 'Full health' : `${gameState.lives} life remaining`}`
              : 'No lives left'
            }
          </div>*/}
        </div>

      {gameState.lifeUsed && !gameState.lock.placed && GameLogic.canPlaceLock(gameState) && (
        <div className="mt-6 p-4 bg-yellow-900 bg-opacity-50 rounded-lg border border-yellow-500">
          <div className="text-center">
            <div className="text-yellow-300 text-lg font-bold">💡 Lock Available</div>
            <div className="text-yellow-200 text-sm">
              Guest can now place a lock to secure their current prize
            </div>
          </div>
        </div>
      )}
    </div>
  );
}