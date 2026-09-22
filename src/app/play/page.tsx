'use client';

import { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { set, get } from 'firebase/database';
import { getFirebaseAuth, signOutUser } from '@/lib/firebaseAuth';
import { playAlongUserAnswerRtdbRef } from '@/lib/firebase';
import { gameStateManager } from '@/lib/gameState';
import type { GameState, PlayAlongUser } from '@/lib/types';
import AuthScreen from '@/components/playAlong/AuthScreen';
import ProfileSetup from '@/components/playAlong/ProfileSetup';
import AnswerScreen from '@/components/playAlong/AnswerScreen';
import WaitingScreen from '@/components/playAlong/WaitingScreen';

export default function PlayPage() {
  // authChecked: true once onAuthStateChanged fires (or 5s timeout elapses)
  const [authChecked, setAuthChecked] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayAlongUser | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [existingAnswer, setExistingAnswer] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastQuestionIdRef = useRef<string | null>(null);
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

  // RTDB game state — subscribe once, no initializeGame needed (read-only page)
  useEffect(() => {
    const unsub = gameStateManager.subscribeToGameState(setGameState);
    return () => unsub();
  }, []);

  // Force sign-out when the operator resets the game (deletes registered users).
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
      setProfile(null);
      setFirebaseUser(null);
    }
  }, [gameState?.playersResetAt]);

  // Fetch existing answer when question changes — only restore if questionId matches
  useEffect(() => {
    if (!profile || !gameState?.currentQuestion) {
      lastQuestionIdRef.current = null;
      setExistingAnswer(null);
      return;
    }
    const questionId = gameState.currentQuestion.id;
    if (questionId === lastQuestionIdRef.current) return;
    lastQuestionIdRef.current = questionId;
    setExistingAnswer(null);
    get(playAlongUserAnswerRtdbRef(gameState.currentQuestionNumber, profile.uid))
      .then(snap => {
        if (snap.exists() && snap.val().questionId === questionId) {
          setExistingAnswer(snap.val().answer as 'A' | 'B' | 'C' | 'D');
        }
      })
      .catch(() => {});
  }, [gameState?.currentQuestion?.id, profile, gameState?.currentQuestionNumber]);

  const handleAnswerSubmit = async (answer: 'A' | 'B' | 'C' | 'D') => {
    if (!profile || !gameState?.currentQuestion || submitting) return;
    setExistingAnswer(answer);
    setSubmitting(true);
    try {
      const qNum = gameState.currentQuestionNumber;
      const now = Date.now();
      const startTime = gameState.currentQuestionStartTime ?? 0;
      await set(playAlongUserAnswerRtdbRef(qNum, profile.uid), {
        answer,
        timestamp: now,
        responseTimeMs: startTime > 0 ? now - startTime : 0, // time taken to answer (ms)
        name: profile.name,
        phone: profile.phone,
        questionNumber: qNum,
        questionId: gameState.currentQuestion.id,
      });
    } catch {
      setExistingAnswer(null);
    } finally {
      setSubmitting(false);
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

  // 3. Signed in, no game profile yet — ProfileSetup auto-loads existing profiles from Firestore
  if (!profile) {
    return <ProfileSetup user={firebaseUser} onProfileComplete={p => setProfile(p)} />;
  }

  // 4. Profile ready, RTDB not loaded yet or game not started
  if (!gameState) {
    return (
      <WaitingScreen
        message="Waiting for the show to start..."
        subMessage={`Ready to play as ${profile.name}`}
      />
    );
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
  if (!gameState.currentQuestion) {
    return (
      <WaitingScreen
        message="Waiting for the next question..."
        subMessage={`Playing as ${profile.name}`}
      />
    );
  }

  // 7. Answer screen
  return (
    <AnswerScreen
      gameState={gameState}
      existingAnswer={existingAnswer}
      onAnswerSubmit={handleAnswerSubmit}
    />
  );
}
