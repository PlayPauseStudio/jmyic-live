'use client';

import React, { useEffect, useRef } from 'react';
import type { GameState } from '@/lib/types';
import confetti from 'canvas-confetti';
import { soundPlayer } from '@/lib/sounds';

interface GuestVictoryDisplayProps {
  gameState: GameState;
}

export default function GuestVictoryDisplay({ gameState }: GuestVictoryDisplayProps) {
  const hasTriggeredConfetti = useRef(false);
  const hasTriggeredAudio = useRef(false);

  // Trigger confetti celebration when modal becomes visible
  useEffect(() => {
    if (gameState.guestVictoryModalVisible && !hasTriggeredConfetti.current) {
      hasTriggeredConfetti.current = true;
      
      console.log('🎊 Guest Victory: Triggering confetti celebration');
      
      // Multiple confetti bursts for maximum celebration
      const duration = 15 * 1000;
      const end = Date.now() + duration;
      const defaults = {
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 1000,
      };

      function randomInRange(min: number, max: number) {
              return Math.random() * (max - min) + min;
            }
      
            const interval = setInterval(function () {
              const timeLeft = end - Date.now();
      
              if (timeLeft <= 0) {
                return clearInterval(interval);
              }
      
              const particleCount = 50 * (timeLeft / duration);
              // Multiple confetti bursts from different positions
              confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
              });
              confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
              });
            }, 250);
      
    }

    // Reset confetti trigger when modal closes
    if (!gameState.guestVictoryModalVisible && hasTriggeredConfetti.current) {
      hasTriggeredConfetti.current = false;
    }
  }, [gameState.guestVictoryModalVisible]);

  // Play victory music when modal becomes visible
  useEffect(() => {
    if (gameState.guestVictoryModalVisible && !hasTriggeredAudio.current) {
      hasTriggeredAudio.current = true;
      
      console.log('🎵 Guest Victory: Playing victory audio');
      soundPlayer.playSound('panelCorrect').catch(err => {
        console.error('Failed to play victory audio:', err);
      });
    }

    // Reset audio trigger when modal closes
    if (!gameState.guestVictoryModalVisible && hasTriggeredAudio.current) {
      hasTriggeredAudio.current = false;
    }
  }, [gameState.guestVictoryModalVisible]);

  if (!gameState.guestVictoryModalVisible) {
    return null;
  }

  // Determine victory type and prize
  const isLockVictory = gameState.lives === 0 && gameState.lock.placed;
  const prizeAmount = isLockVictory ? gameState.lockedMoney : gameState.prize;
  const victoryMessage = isLockVictory 
    ? 'LOCK SAVED YOU! YOU WIN YOUR LOCKED AMOUNT!'
    : 'ALL 7 QUESTIONS ANSWERED';

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="text-center animate-fadeIn">
        {/* Victory Title */}
        <div className="mb-8">
          <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 animate-pulse mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            🏆 Contestant WINS! 🏆
          </h1>
          <p className="text-4xl text-white font-semibold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {victoryMessage}
          </p>
        </div>

        {/* Prize Amount */}
        <div className="bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600 p-8 rounded-2xl shadow-2xl mb-8 transform hover:scale-105 transition-transform">
          <p className="text-3xl text-gray-900 font-bold mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            PRIZE WON
          </p>
          <p className="text-9xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-yellow-900 to-yellow-700" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            ₹{prizeAmount.toLocaleString()}
          </p>
        </div>

        {/* Celebration Message */}
        <div className="text-3xl text-green-400 font-bold animate-bounce" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          🎉 CONGRATULATIONS! 🎉
        </div>
      </div>
    </div>
  );
}
