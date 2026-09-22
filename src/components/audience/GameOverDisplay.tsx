import React from 'react';
import type { GameState } from '@/lib/types';
import { PRIZE_TIERS } from '@/lib/firebase';

interface GameOverDisplayProps {
  gameState: GameState;
}

export default function GameOverDisplay({ gameState }: GameOverDisplayProps) {
  const finalPrize = gameState.lock.placed ? gameState.lockedMoney : gameState.prize;
  const isWin = finalPrize > 0;

  return (
    <div className="min-h-screen bg-cover flex items-center justify-center" 
         style={{ backgroundImage: "url('/images/backgrounds/BG-1.jpg')", backgroundColor: "#1a3a2e" }}>
      <div className="text-center px-6">
        {/* Thank You */}
        <div>
          <div className="text-7xl font-bebas mb-2 text-gray-300">Thank you for watching</div>
          <div className="text-9xl font-bebas text-yellow-400">Judge Me If You Can!</div>
        </div>

        {/* Prize Display 
        <div className="bg-gray-900 bg-opacity-80 backdrop-blur-sm rounded-3xl p-12 mb-8 max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="text-gray-400 text-xl uppercase tracking-wide">Final Prize</div>
            <div className={`text-8xl font-bold mt-4 ${
              isWin ? 'text-green-400' : 'text-red-400'
            }`}>
              ₹{finalPrize.toLocaleString()}
            </div>
          </div>*/}

          {/* Prize Status
          {gameState.lock.placed && (
            <div className="mb-6 p-4 bg-purple-900 bg-opacity-50 rounded-lg border border-purple-500">
              <div className="text-purple-300 text-lg">🔒 Lock Saved the Day!</div>
              <div className="text-purple-200 text-sm">
                Secured at level {gameState.lock.level}
              </div>
            </div>
          )} */}

          {/* Game Statistics
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-gray-400 text-sm uppercase">Questions Answered</div>
              <div className="text-white text-2xl font-bold">{gameState.questionsAnswered}</div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-gray-400 text-sm uppercase">Highest Level</div>
              <div className="text-white text-2xl font-bold">{gameState.currentQuestionNumber}</div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-gray-400 text-sm uppercase">Lives Used</div>
              <div className="text-white text-2xl font-bold">
                {gameState.lifeUsed ? 1 : 0}/1
              </div>
            </div>
          </div>
        </div> */}

        {/* Prize Ladder Summary 
        <div className="bg-gray-900 bg-opacity-60 backdrop-blur-sm rounded-2xl p-6 max-w-md mx-auto mb-8">
          <h3 className="text-white text-xl font-bold mb-4">Prize Journey</h3>
          <div className="space-y-2">
            {PRIZE_TIERS.map((tier) => {
              const isReached = tier.level <= gameState.currentQuestionNumber;
              const isLocked = gameState.lock.placed && tier.level === gameState.lock.level;
              
              return (
                <div
                  key={tier.level}
                  className={`flex justify-between items-center p-2 rounded ${
                    isLocked
                      ? 'bg-purple-600 text-white'
                      : isReached
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  <span>Level {tier.level}</span>
                  <span>{tier.displayText}</span>
                  {isLocked && <span>🔒</span>}
                  {isReached && !isLocked && <span>✓</span>}
                </div>
              );
            })}
          </div>
        </div>*/}

        {/* Celebration/Condolence 
        <div className="text-center">
          {isWin ? (
            <div>
              <div className="text-6xl mb-4">🎉</div>
              <div className="text-9xl text-green-400 font-bebas mb-2">Congratulations!</div>
              <div className="text-gray-300">
                What an amazing performance! The audience loved every moment.
              </div>
            </div>
          ) : (
            <div>
              <div className="text-6xl mb-4">😅</div>
              <div className="text-5xl text-yellow-400 font-bebas mb-2">Better Luck Next Time!</div>
              <div className="text-gray-300">
                Thanks for playing! The laughs were worth more than any prize.
              </div>
            </div>
          )}
        </div>*/}

        
      </div>
    </div>
  );
}