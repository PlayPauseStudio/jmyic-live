import React from 'react';
import type { GameState } from '@/lib/types';

interface SoftEliminationBannerProps {
  gameState: GameState;
}

export default function SoftEliminationBanner({ gameState }: SoftEliminationBannerProps) {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-in-out ${
        gameState.softEliminated ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-red-900 bg-opacity-90 backdrop-blur-sm py-6 px-8 border-t border-red-500">
        <div className="flex items-baseline gap-4 justify-center">
          <span className="text-red-300 text-5xl font-bold font-bebas tracking-wider whitespace-nowrap">⚠️ Soft Elimination</span>
          <span className="text-red-200 text-5xl font-bebas tracking-wide">Guest is eliminated but can still win their locked money</span>
        </div>
      </div>
    </div>
  );
}
