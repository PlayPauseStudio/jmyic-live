'use client';

import React, { useState, useEffect } from 'react';
import { db, questionsDocRef, defaultGameState } from '@/lib/firebase';
import { getDoc } from 'firebase/firestore';
import { gameStateManager } from '@/lib/gameState';
import { soundPlayer } from '@/lib/sounds';
import type { GameState, Question } from '@/lib/types';
import GameControls from '@/components/operator/GameControls';
import QuestionPool from '@/components/operator/QuestionPool';
import CSVUpload from '@/components/operator/CSVUpload';
import PlayAlongPanel from '@/components/operator/PlayAlongPanel';
import PasswordGate from '@/components/operator/PasswordGate';

export default function OperatorPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem('operator_auth') === 'authenticated') {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let keepAliveCleanup: (() => void) | null = null;

    const initialize = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('Initializing operator panel...');

        // Initialize game state with retry logic
        let retries = 3;
        while (retries > 0) {
          try {
            await gameStateManager.initializeGame();
            console.log('Game state initialized successfully');
            break;
          } catch (initError) {
            retries--;
            console.error(`Game state init attempt failed (${3 - retries}/3):`, initError);

            if (retries === 0) {
              throw initError;
            }

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Subscribe to real-time updates with error handling
        try {
          unsubscribe = gameStateManager.subscribeToGameState((state) => {
            setGameState(state);
            setLoading(false);
          });
        } catch (subscribeError) {
          console.error('Failed to subscribe to game state:', subscribeError);
          // Continue without real-time updates
        }

        // Start keep-alive for long discussions
        try {
          keepAliveCleanup = gameStateManager.startKeepAlive();
        } catch (keepAliveError) {
          console.error('Failed to start keep-alive:', keepAliveError);
          // Continue without keep-alive
        }

        // Load questions with error handling
        await loadQuestions();

      } catch (err) {
        console.error('Error initializing operator panel:', err);

        if (err instanceof Error && err.message.includes('permission-denied')) {
          setError('Firebase access denied. Please check your permissions.');
        } else if (err instanceof Error && err.message.includes('network')) {
          setError('Network connection failed. Please check your internet connection.');
        } else {
          setError('Failed to initialize. Please refresh the page.');
        }

        setLoading(false);

        // Set a default game state to prevent crashes
        setGameState({ ...defaultGameState, lastActivity: new Date().toISOString() });
      }
    };

    initialize();

    return () => {
      if (unsubscribe) unsubscribe();
      if (keepAliveCleanup) keepAliveCleanup();
      gameStateManager.cleanup();
    };
  }, []);

  const loadQuestions = async (useCache: boolean = false) => {
    try {
      console.log('Attempting to load questions from Firebase...');

      // Check cache first if requested
      if (useCache && questions.length > 0) {
        console.log('Using cached questions');
        return;
      }

      setQuestionsLoading(true);

      // Add timeout and retry logic
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase timeout')), 8000) // Reduced timeout
      );

      const fetchPromise = getDoc(questionsDocRef);

      // Race between timeout and actual fetch
      const docSnap = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (docSnap.exists()) {
        const data = docSnap.data();
        const questions = data.questions || [];
        console.log('Successfully loaded questions from Firebase:', questions);
        setQuestions(questions);
      } else {
        console.log('No questions document found in Firebase');
        setQuestions([]);
      }
    } catch (err) {
      console.error('Error loading questions:', err);

      // Provide fallback empty state instead of failing completely
      setQuestions([]);

      // Show user-friendly error message
      if (err instanceof Error && err.message.includes('timeout')) {
        setError('Connection timeout. Please check your internet connection.');
      } else if (err instanceof Error && err.message.includes('permission-denied')) {
        setError('Access denied. Please check Firebase permissions.');
      } else {
        setError('Failed to load questions. Using offline mode.');
      }
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleError = (error: string) => {
    setError(error);
    setTimeout(() => setError(null), 5000); // Auto-clear after 5 seconds
  };

  if (!authenticated) {
    return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading Operator Panel...</div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Failed to load game state</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-6 justify-center">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Judge Me If You Can</h1>
        <p className="text-gray-300">Operator Control Panel</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-500 text-white rounded-lg">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* 3-Column Layout: CSV Upload (30%) | Question Pool (30%) | Game Controls (30%) */}
      <div className="flex gap-6 h-full justify-center">

        {/* Left Column: CSV Upload + Play Along */}
        <div className="w-[30%] flex-shrink-0 flex flex-col gap-6">
          <CSVUpload
            onSuccess={() => loadQuestions(false)}
            onError={handleError}
            gameState={gameState}
          />
          <PlayAlongPanel gameState={gameState} onError={handleError} />
        </div>

        {/* Center Column: Question Pool (50%) */}
        <div className="w-[30%] flex-shrink-0">
          <QuestionPool
            questions={questions}
            gameState={gameState}
            onError={handleError}
            onQuestionSelected={() => loadQuestions(true)}
            loading={questionsLoading}
          />
        </div>

        {/* Right Column: Game Controls (30%) */}
        <div className="w-[30%] flex-shrink-0">
          <GameControls
            gameState={gameState}
            onError={handleError}
            onQuestionUsed={loadQuestions}
          />
        </div>
      </div>

    </div>
  );
}