import React, { useEffect, useRef } from 'react';
import type { GameState } from '@/lib/types';
import { soundPlayer } from '@/lib/sounds';
import { GameLogic } from '@/utils/gameLogic';

interface QuestionDisplayProps {
  gameState: GameState;
}

export default function QuestionDisplay({ gameState }: QuestionDisplayProps) {
  const lastAudioPlayedRef = useRef<string>('');
  const processedLockEvents = useRef<Set<string>>(new Set());

  // Play audio when panel guess is checked (synced with visual highlighting)
  useEffect(() => {
    if (gameState.panelGuessChecked && gameState.panelGuess && gameState.currentQuestion) {
      // Create a unique key for this guess to prevent duplicate audio
      const guessKey = `${gameState.currentQuestion.id}-${gameState.panelGuess}-${gameState.panelGuessChecked}`;

      // Only play audio if we haven't already played it for this specific guess
      if (lastAudioPlayedRef.current !== guessKey) {
        const isCorrect = GameLogic.isPanelGuessCorrectWithContext(
          gameState.panelGuess,
          gameState.currentQuestion.guest_answer,
          gameState.currentQuestion
        );
        console.log('🔊 Playing panel result audio:', isCorrect ? 'Correct.mp3' : 'Wrong.mp3');
        soundPlayer.playSound(isCorrect ? 'panelCorrect' : 'panelWrong');
        lastAudioPlayedRef.current = guessKey;
      }
    }

    // Reset when a new question is selected
    if (!gameState.panelGuessChecked) {
      lastAudioPlayedRef.current = '';
    }
  }, [gameState.panelGuessChecked, gameState.panelGuess, gameState.currentQuestion]);

  // Guest answer revealed audio effect
  useEffect(() => {
    if (gameState.currentQuestionAnswerRevealed) {
      console.log('🔊 Guest answer revealed - playing revealAnswer sound');
      soundPlayer.playSound('revealAnswer');
    }
  }, [gameState.currentQuestionAnswerRevealed]);

  // Lock placed audio effect
  useEffect(() => {
    if (gameState.lock.placed && gameState.lock.level !== null) {
      const lockKey = `lock-${gameState.lock.level}`;

      if (!processedLockEvents.current.has(lockKey)) {
        console.log('🔒 Lock placed audio triggered for level', gameState.lock.level);
        soundPlayer.playSound('lockPlaced');

        processedLockEvents.current.add(lockKey);
      }
    }
  }, [gameState.lock.placed, gameState.lock.level]);

  // Question selection audio effect
  useEffect(() => {
    if (gameState.currentQuestion && !gameState.panelGuessSubmitted) {
      console.log('🎵 Playing question selection audio');
      soundPlayer.playSound('questionSelection');
    }
  }, [gameState.currentQuestion?.id]);

  // Play audio when panel selects an option (synced with option selection)
  useEffect(() => {
    if (gameState.panelGuessSubmitted && gameState.panelGuess && !gameState.panelGuessChecked) {
      console.log('🎵 Playing panel option selection audio');
      soundPlayer.playSound('questionSelection');
    }
  }, [gameState.panelGuessSubmitted, gameState.panelGuess]);

  // Play whoosh sound when an option is hidden
  useEffect(() => {
    if (gameState.hiddenOption) {
      console.log('🌬️ Playing whoosh sound for hidden option:', gameState.hiddenOption);
      soundPlayer.playSound('whoosh');
    }
  }, [gameState.hiddenOption]);

  // Play question selection sound when an option is revealed
  useEffect(() => {
    const revealedCount = (gameState.revealedOptions || []).length;
    if (revealedCount > 0) {
      console.log('🎵 Playing option reveal sound for option:', gameState.revealedOptions?.[revealedCount - 1]);
      soundPlayer.playSound('questionSelection');
    }
  }, [(gameState.revealedOptions || []).length]);

  if (!gameState.currentQuestion) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-6">🎭</div>
        <div className="text-white text-7xl mb-4 font-bebas tracking-wider">WELCOME TO JUDGE ME IF YOU CAN!</div>
        <div className="text-yellow-400 text-5xl font-bebas tracking-wide">
          THE MOST HILARIOUS GAME SHOW
        </div>
        <div className="text-gray-300 text-4xl font-bebas mt-4">
          Waiting for the first question...
        </div>
      </div>
    );
  }

  const question = gameState.currentQuestion;

  return (
    <div className="h-full flex flex-col overflow-hidden justify-center">
      <div className="w-full mx-auto">
        {/* Question Card with Golden Border and Gradient Background */}
        <div className="game-card-gradient border-2 border-yellow-400 rounded-lg px-4 py-3">

          {/* Question Text - Responsive sizing */}
          <div className="text-yellow-400 font-bebas leading-tight mb-3 text-center text-4xl xl:text-6xl">
            <div className="line-clamp-3">
              {question.question}
            </div>
          </div>

          {/* Options Grid - fixed A/B/C/D positions, slots appear as they are revealed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(['A', 'B', 'C', 'D'] as const).map((optionKey) => {
              const isRevealed = (gameState.revealedOptions || []).includes(optionKey);
              const isHidden = gameState.hiddenOption === optionKey;
              const optionText = optionKey === 'A' ? question.option_a :
                optionKey === 'B' ? question.option_b :
                optionKey === 'C' ? question.option_c :
                question.option_d;

              const isPanelGuess = gameState.panelGuess === optionKey;
              const guestAnswerText = question.guest_answer?.toString().toUpperCase().trim();
              const optionTextUpper = optionText?.toUpperCase().trim();
              // guest_answer may be stored as letter ("A") or as the actual text ("Bartending")
              const isGuestAnswer = guestAnswerText === optionKey || guestAnswerText === optionTextUpper;
              const guestAnswerRevealed = gameState.currentQuestionAnswerRevealed;
              const panelGuessChecked = gameState.panelGuessChecked;

              // Force visible when answer is revealed (show all options),
              // or when the panel's chosen option needs a highlight
              const isVisible = isRevealed ||
                guestAnswerRevealed ||
                (panelGuessChecked && isPanelGuess) ||
                (gameState.panelGuessSubmitted && isPanelGuess);

              // Unrevealed slot — invisible placeholder to hold the grid position
              if (!isVisible) {
                return (
                  <div key={optionKey} className="invisible border-2 rounded-lg border-yellow-600 bg-yellow-400">
                    <div className="flex items-center m-1 p-2 rounded-sm overflow-hidden h-[80px] xl:h-[100px]" />
                  </div>
                );
              }

              let optionClasses = 'border-yellow-600 bg-yellow-400';
              let textColor = 'text-green-900';

              if (guestAnswerRevealed) {
                if (isGuestAnswer) {
                  optionClasses = 'bg-green-500 border-green-600 shadow-lg shadow-green-500/50';
                  textColor = 'text-white';
                } else if (isPanelGuess) {
                  optionClasses = 'bg-red-500 border-red-600 shadow-lg shadow-red-500/50';
                  textColor = 'text-white';
                } else {
                  optionClasses = 'bg-green-900 border-green-800 opacity-75';
                  textColor = 'text-gray-300';
                }
              } else if (panelGuessChecked && isPanelGuess) {
                optionClasses = isGuestAnswer
                  ? 'bg-green-500 border-green-600 shadow-lg shadow-green-500/50'
                  : 'bg-red-500 border-red-600 shadow-lg shadow-red-500/50';
                textColor = 'text-white';
              } else if (isPanelGuess && gameState.panelGuessSubmitted) {
                optionClasses = 'bg-blue-400 border-blue-500 shadow-lg shadow-blue-500/50';
                textColor = 'text-blue-900';
              }

              if (isHidden) {
                return (
                  <div key={optionKey} className={`border-2 rounded-lg pointer-events-none animate-whoosh-out ${optionClasses}`}>
                    <div className="flex items-center m-1 p-2 rounded-sm overflow-hidden h-[80px] xl:h-[100px]">
                      <span className={`text-3xl xl:text-4xl font-bebas tracking-wide line-clamp-2 ${textColor}`}>{optionText}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={optionKey} className={`border-2 rounded-lg transition-all duration-500 animate-fade-in ${optionClasses}`}>
                  <div className="flex items-center m-1 p-2 rounded-sm overflow-hidden h-[80px] xl:h-[120px]">
                    <span className={`text-3xl xl:text-5xl font-bebas tracking-wide line-clamp-2 ${textColor}`}>{optionText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>


      </div>

      {/* Game Status Messages */}
      {/* <div className="text-center space-y-3">
        {!gameState.panelGuessSubmitted && (
          <div className="text-yellow-400 text-lg font-semibold animate-pulse">
            🎤 Panel is discussing...
          </div>
        )}

        {gameState.panelGuessSubmitted && !gameState.panelGuessChecked && (
          <div className="text-orange-400 text-lg font-semibold">
            🎯 Panel guessed: {gameState.panelGuess} • Waiting to check panel guess...
          </div>
        )}

        {gameState.panelGuessChecked && !gameState.currentQuestionAnswerRevealed && (
          <div className="space-y-2">
            {gameState.panelGuess === question.guest_answer ? (
              <div className="text-green-400 text-lg font-semibold">
                ✅ Panel got it right! Round complete.
              </div>
            ) : (
              <div className="text-red-400 text-lg font-semibold">
                ❌ Panel was wrong! Waiting for guest answer reveal...
              </div>
            )}
          </div>
        )}

        {gameState.currentQuestionAnswerRevealed && (
          <div className="space-y-2">
            <div className="text-green-400 text-lg font-semibold">
              🎉 Guest answer revealed: {question.guest_answer}
            </div>
            {gameState.panelGuess === question.guest_answer ? (
              <div className="text-green-300 text-base">
                ✅ Panel got it right!
              </div>
            ) : (
              <div className="text-gray-300 text-base">
                Panel: {gameState.panelGuess} (❌) • Guest: {question.guest_answer} (✅) • Guest advances!
              </div>
            )}
          </div>
        )}
      </div> */}
    </div>
  );
}