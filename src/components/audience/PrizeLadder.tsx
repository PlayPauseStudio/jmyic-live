import React from 'react';
import type { GameState } from '@/lib/types';
import { PRIZE_TIERS } from '@/lib/firebase';
import { LockClosedIcon } from '@heroicons/react/24/solid';

interface PrizeLadderProps {
  gameState: GameState;
}

export default function PrizeLadder({ gameState }: PrizeLadderProps) {
  return (
    <div className="game-card-gradient rounded-lg px-6 py-8 h-full flex flex-col">

      {/* Horizontal Prize Tier */}
      <div className="flex justify-between flex-1 items-center gap-6">
        {PRIZE_TIERS.map((tier) => {
          const isCurrent = tier.level === gameState.currentQuestionNumber;
          const isCompleted = tier.level < gameState.currentQuestionNumber;
          const isLocked = gameState.lock.placed && tier.level === gameState.lock.level;
          
          // Check if guest won the current round (should show green)
          const guestWonCurrentRound = isCurrent && 
            gameState.currentQuestionAnswerRevealed && 
            gameState.pendingAdvancement;
          
          return (
            <div key={tier.level} className="flex flex-col items-center w-full">
              {/* Reserve label height on all cards so inactive ones stay vertically centered */}
              <div className={`text-xs xl:text-4xl uppercase tracking-widest font-bebas leading-none mb-1 ${isCurrent ? 'text-white' : 'invisible'}`}>
                Playing For
              </div>

              <div
                className={`relative px-3 py-6 rounded-lg transition-all duration-500 w-full flex items-center justify-center ${
                  isLocked ? 'ring-6 ring-purple-400' : ''
                } ${
                  guestWonCurrentRound
                    ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-xl shadow-green-500/50'
                    : isCurrent
                    ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 text-black shadow-xl shadow-yellow-500/50 scale-105'
                    : isCompleted
                    ? 'bg-gradient-to-r from-green-600 to-green-500 text-white'
                    : 'game-card-gradient text-gray-300'
                }`}
              >
                {/* Lock icon pinned to left edge */}
                {isLocked && (
                  <LockClosedIcon className="absolute left-3 w-8 h-8 text-white" />
                )}

                {/* Prize amount — always centered */}
                <div className={`text-3xl xl:text-6xl font-bold font-bebas leading-none ${
                  isCurrent ? 'text-white' : isCompleted ? 'text-white' : 'text-gray-300'
                }`}>
                  {tier.displayText}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      
    </div>
  );
}