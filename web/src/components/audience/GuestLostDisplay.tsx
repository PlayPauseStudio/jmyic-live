'use client';

import React, { useEffect, useRef } from 'react';
import type { GameState } from '@/lib/types';
import { soundPlayer } from '@/lib/sounds';

interface GuestLostDisplayProps {
  gameState: GameState;
}

export default function GuestLostDisplay({ gameState }: GuestLostDisplayProps) {
  const hasTriggeredAudio = useRef(false);

  // Play wrong audio when modal becomes visible
  useEffect(() => {
    if (gameState.guestLostModalVisible && !hasTriggeredAudio.current) {
      hasTriggeredAudio.current = true;
      
      console.log('💀 Guest Lost: Playing elimination audio');
      soundPlayer.playSound('panelWrong').catch(err => {
        console.error('Failed to play elimination audio:', err);
      });
    }

    // Reset audio trigger when modal closes
    if (!gameState.guestLostModalVisible && hasTriggeredAudio.current) {
      hasTriggeredAudio.current = false;
    }
  }, [gameState.guestLostModalVisible]);

  if (!gameState.guestLostModalVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="text-center animate-fadeIn">
        {/* Elimination Title */}
        <div className="mb-8">
          <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-red-400 to-red-600 mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            💀 Contestant ELIMINATED 💀
          </h1>
          <p className="text-4xl text-white font-semibold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            ALL LIVES LOST WITHOUT PLACING THE LOCK!
          </p>
        </div>

        {/* Prize Amount - Zero */}
        <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 p-8 rounded-2xl shadow-2xl mb-8 border-4 border-red-600">
          <p className="text-3xl text-gray-300 font-bold mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            FINAL PRIZE
          </p>
          <p className="text-9xl font-extrabold text-red-500" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            ₹0
          </p>
          <p className="text-xl text-gray-400 mt-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            No Lock Placed - No Safety Net
          </p>
        </div>

        {/* Sad Message */}
        <div className="text-3xl text-red-400 font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          💔 BETTER LUCK NEXT TIME! 💔
        </div>
      </div>
    </div>
  );
}
