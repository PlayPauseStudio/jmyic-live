'use client';

import { useState, useRef, useEffect } from 'react';
import { operatorLogin } from '@/lib/realtime';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

/** sessionStorage key for the operator JWT (survives a refresh, dies with the tab). */
export const OPERATOR_TOKEN_KEY = 'operator_token';

interface PasswordGateProps {
  onAuthenticated: (token: string) => void;
}

/**
 * The password is checked by the server (bcrypt), never in the browser, and
 * exchanged for a short-lived token the socket presents on every connect.
 * The server also rate-limits attempts; the lockout here is just a courtesy.
 */

export default function PasswordGate({ onAuthenticated }: PasswordGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setCountdown(0);
        setAttempts(0);
        setError('');
      } else {
        setCountdown(remaining);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || checking || !password) return;

    setChecking(true);
    try {
      const result = await operatorLogin(password);

      if (result.token) {
        sessionStorage.setItem(OPERATOR_TOKEN_KEY, result.token);
        onAuthenticated(result.token);
      } else if (result.error === 'server_unreachable') {
        setError('Cannot reach the game server. Check the connection and try again.');
      } else if (result.error === 'too_many_attempts') {
        setPassword('');
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setError(`Too many wrong attempts. Locked for ${LOCKOUT_SECONDS} seconds.`);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPassword('');
        if (newAttempts >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setError(`Too many wrong attempts. Locked for ${LOCKOUT_SECONDS} seconds.`);
        } else {
          setError(`Incorrect password. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`);
        }
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Operator Panel</h1>
          <p className="text-gray-400 text-sm">Enter the operator password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isLocked || checking}
              placeholder="Enter operator password"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {isLocked ? `Too many wrong attempts. Try again in ${countdown}s.` : error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLocked || checking || !password}
            className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {checking ? 'Verifying...' : isLocked ? `Locked (${countdown}s)` : 'Unlock Panel'}
          </button>
        </form>
      </div>
    </div>
  );
}
