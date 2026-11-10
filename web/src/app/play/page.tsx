'use client';

import { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, signOutUser } from '@/lib/firebaseAuth';
import { gameStateManager, errorText } from '@/lib/gameState';
import { AUD } from '@/lib/realtime';
import type { GameState } from '@/lib/types';
import AuthScreen from '@/components/playAlong/AuthScreen';
import ProfileSetup from '@/components/playAlong/ProfileSetup';
import AnswerScreen from '@/components/playAlong/AnswerScreen';
import WaitingScreen from '@/components/playAlong/WaitingScreen';

type OptionKey = 'A' | 'B' | 'C' | 'D';

export default function PlayPage() {
  // authChecked: true once onAuthStateChanged fires (or 5s timeout elapses)
  const [authChecked, setAuthChecked] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  // The answer just tapped, shown until the server's copy arrives.
  const [pendingAnswer, setPendingAnswer] = useState<{ questionId: string; answer: OptionKey } | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  // Baseline of the reset signal seen at load; if it later increases, the operator
  // reset the game and this client must sign out.
  const acceptedResetRef = useRef<number | null>(null);

  // Firebase Auth — 5s timeout so a slow/broken auth SDK never blocks the page forever
  useEffect(() => {
    const timeout = setTimeout(() => setAuthChecked(true), 5000);

    let unsub: (() => void) | undefined;
    try {
      unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
        clearTimeout(timeout);
        setFirebaseUser(user);
        setAuthChecked(true);
      });
    } catch (err) {
      console.error('Auth init error:', err);
      clearTimeout(timeout);
      setAuthChecked(true);
    }

    return () => {
      clearTimeout(timeout);
      unsub?.();
    };
  }, []);

  // Once signed in, connect to the game server. The server verifies the
  // Firebase ID token on every (re)connect and only ever acts as this uid.
  useEffect(() => {
    if (!firebaseUser) return;
    gameStateManager.connect('audience', () => firebaseUser.getIdToken());
    const unsubState = gameStateManager.subscribeToGameState(setGameState);
    const unsubConn = gameStateManager.subscribeToConnection((_connected, err) => setConnectError(err));
    return () => {
      unsubState();
      unsubConn();
      gameStateManager.disconnect();
      setGameState(null);
    };
  }, [firebaseUser]);

  // Force sign-out when the operator resets the game (registered players are removed).
  useEffect(() => {
    const reset = gameState?.playersResetAt;
    if (reset == null) return;
    if (acceptedResetRef.current === null) {
      acceptedResetRef.current = reset; // baseline on first reading
      return;
    }
    if (reset > acceptedResetRef.current) {
      acceptedResetRef.current = reset;
      signOutUser().catch(() => {}); // onAuthStateChanged → null → AuthScreen
      setFirebaseUser(null);
    }
  }, [gameState?.playersResetAt]);

  const question = gameState?.currentQuestion ?? null;
  const you = gameState?.you ?? null;
  const profile = you?.profile ?? null;

  // This phone's answer to the question on screen, as the server recorded it.
  const ownAnswer = (() => {
    if (!question || !you) return null;
    const a = you.answers[String(gameState!.currentQuestionNumber)];
    return a && a.questionId === question.id ? a.answer : null;
  })();
  const existingAnswer: OptionKey | null =
    pendingAnswer && question && pendingAnswer.questionId === question.id ? pendingAnswer.answer : ownAnswer;

  // Drop the optimistic answer once the server has confirmed it or the question moved on.
  useEffect(() => {
    if (!pendingAnswer) return;
    if (!question || pendingAnswer.questionId !== question.id || ownAnswer === pendingAnswer.answer) {
      setPendingAnswer(null);
    }
  }, [ownAnswer, question?.id, pendingAnswer]);

  const handleRegister = async (name: string, phone: string): Promise<string | null> => {
    const ack = await gameStateManager.send(AUD.REGISTER, { name, phone });
    if (ack.ok) return null;
    if (ack.error === 'duplicate_phone') return 'This phone number is already registered with another account.';
    if (ack.error === 'bad_phone') return 'Please enter a valid 10-digit Indian mobile number.';
    if (ack.error === 'bad_name') return 'Please enter your name.';
    return 'Failed to save profile. Please try again.';
  };

  const handleAnswerSubmit = async (answer: OptionKey) => {
    if (!profile || !question) return;
    setAnswerError(null);
    setPendingAnswer({ questionId: question.id, answer });
    const ack = await gameStateManager.send(AUD.ANSWER, { answer });
    if (!ack.ok) {
      setPendingAnswer(null);
      setAnswerError(ack.error === 'window_closed' ? 'Answers are closed for this question.' : errorText(ack.error));
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  // 1. Waiting for onAuthStateChanged (max 5s before timeout kicks in)
  if (!authChecked) {
    return <WaitingScreen message="Connecting..." />;
  }

  // 2. Not signed in
  if (!firebaseUser) {
    return <AuthScreen onAuthSuccess={user => setFirebaseUser(user)} />;
  }

  // 3. Signed in, waiting for the game server
  if (!gameState) {
    return (
      <WaitingScreen
        message={connectError === 'unauthorized' ? 'Could not verify your sign-in' : 'Connecting to the show...'}
        subMessage={connectError === 'unauthorized' ? 'Please refresh the page.' : undefined}
      />
    );
  }

  // 4. Signed in, no game profile yet
  if (!profile) {
    return <ProfileSetup user={firebaseUser} onRegister={handleRegister} />;
  }

  // 5. Game over
  if (gameState.gameOver) {
    return (
      <WaitingScreen
        message="Game Over!"
        subMessage="Thanks for playing along."
      />
    );
  }

  // 6. Waiting for next question
  if (!question) {
    return (
      <WaitingScreen
        message="Waiting for the next question..."
        subMessage={`Playing as ${profile.name}`}
      />
    );
  }

  // 7. Answer screen
  return (
    <>
      <AnswerScreen
        gameState={gameState}
        existingAnswer={existingAnswer}
        onAnswerSubmit={handleAnswerSubmit}
      />
      {answerError && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white text-sm text-center rounded-xl px-4 py-3">
          {answerError}
        </div>
      )}
    </>
  );
}
