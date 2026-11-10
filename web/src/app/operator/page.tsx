'use client';

import React, { useState, useEffect } from 'react';
import { gameStateManager } from '@/lib/gameState';
import type { GameState } from '@/lib/types';
import GameControls from '@/components/operator/GameControls';
import QuestionPool from '@/components/operator/QuestionPool';
import CSVUpload from '@/components/operator/CSVUpload';
import FormatToggle from '@/components/operator/FormatToggle';
import PlayAlongPanel from '@/components/operator/PlayAlongPanel';
import PasswordGate, { OPERATOR_TOKEN_KEY } from '@/components/operator/PasswordGate';

export default function OperatorPanel() {
  // The operator JWT from the server. Survives a refresh, dies with the tab.
  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem(OPERATOR_TOKEN_KEY));
    setTokenChecked(true);
  }, []);

  // Connect as the operator. The server re-verifies the JWT on every
  // (re)connect; a refused or expired token sends us back to the login.
  useEffect(() => {
    if (!token) return;
    gameStateManager.connect('operator', () => token);
    const unsubState = gameStateManager.subscribeToGameState(setGameState);
    const unsubConn = gameStateManager.subscribeToConnection((isConnected, lastError) => {
      setConnected(isConnected);
      if (lastError === 'unauthorized') {
        sessionStorage.removeItem(OPERATOR_TOKEN_KEY);
        gameStateManager.disconnect();
        setGameState(null);
        setToken(null);
      }
    });
    return () => {
      unsubState();
      unsubConn();
    };
  }, [token]);

  useEffect(() => () => gameStateManager.disconnect(), []);

  const handleError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000); // Auto-clear after 5 seconds
  };

  if (!tokenChecked) return null;

  if (!token) {
    return <PasswordGate onAuthenticated={setToken} />;
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Connecting to the game server...</div>
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

      {/* Connection lost — buttons won't do anything until it comes back */}
      {!connected && (
        <div className="mb-6 mx-6 p-4 bg-yellow-600 text-white rounded-lg font-semibold">
          Reconnecting to the game server… changes won&apos;t go through until it&apos;s back.
        </div>
      )}

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
          <FormatToggle gameState={gameState} onError={handleError} />
          <CSVUpload
            onSuccess={() => {}}
            onError={handleError}
            gameState={gameState}
          />
          <PlayAlongPanel gameState={gameState} onError={handleError} />
        </div>

        {/* Center Column: Question Pool */}
        <div className="w-[30%] flex-shrink-0">
          <QuestionPool
            questions={gameState.pool ?? []}
            gameState={gameState}
            onError={handleError}
          />
        </div>

        {/* Right Column: Game Controls */}
        <div className="w-[30%] flex-shrink-0">
          <GameControls
            gameState={gameState}
            onError={handleError}
          />
        </div>
      </div>

    </div>
  );
}
