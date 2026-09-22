'use client';

import { useState, useEffect, useRef } from 'react';
import { onValue, set } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';
import { db, playAlongAnswersByQNumRef, playAlongQuestionMetaRtdbRef } from '@/lib/firebase';
import { gameStateManager } from '@/lib/gameState';
import { GameLogic } from '@/utils/gameLogic';
import type { GameState } from '@/lib/types';

interface PlayAlongPanelProps {
  gameState: GameState;
  onError: (msg: string) => void;
}

type Filter = 'all' | 'correct' | 'incorrect' | 'quickest' | 'slowest';

interface ResponseRow {
  uid: string;
  name: string;
  answer: string;
  timestamp: number;
  responseTimeMs: number;
  isCorrect: boolean | null;
}

export default function PlayAlongPanel({ gameState, onError }: PlayAlongPanelProps) {
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [processing, setProcessing] = useState(false);
  // Auto-follow the live question for the leaderboard scope (operator can pin/unpin)
  const [followingLive, setFollowingLive] = useState(true);
  const prevQNumRef = useRef<number | null>(null);

  const questionNumber = gameState.currentQuestionNumber;
  const question = gameState.currentQuestion;

  // Fetch participant count from Firestore (not real-time, just a count)
  useEffect(() => {
    getDocs(collection(db, 'playAlongUsers'))
      .then(snap => setParticipantCount(snap.size))
      .catch(() => {});
  }, []);

  // Write question metadata to RTDB so leaderboard can display it for past questions
  useEffect(() => {
    if (!question || !questionNumber) return;
    const correctAnswer = GameLogic.normalizeGuestAnswer(question.guest_answer, question);
    set(playAlongQuestionMetaRtdbRef(questionNumber), {
      questionText: question.question,
      correctAnswer,
      questionNumber,
    }).catch(() => {});
  }, [question?.id, questionNumber]);

  // Subscribe to RTDB answers for current question — live updates
  useEffect(() => {
    if (!questionNumber) return;

    const unsub = onValue(playAlongAnswersByQNumRef(questionNumber), (snapshot) => {
      const data = snapshot.val() as Record<string, any> | null;
      if (!data) { setResponses([]); return; }

      const startTime = gameState.currentQuestionStartTime ?? 0;
      const correctAnswer = question
        ? GameLogic.normalizeGuestAnswer(question.guest_answer, question)
        : null;

      const rows: ResponseRow[] = Object.entries(data).map(([uid, r]) => {
        const responseTimeMs = startTime > 0 ? r.timestamp - startTime : 0;
        const isCorrect = gameState.currentQuestionAnswerRevealed && correctAnswer
          ? r.answer === correctAnswer
          : null;
        return { uid, name: r.name, answer: r.answer, timestamp: r.timestamp, responseTimeMs, isCorrect };
      });

      rows.sort((a, b) => a.responseTimeMs - b.responseTimeMs);
      setResponses(rows);
    });

    return () => unsub();
  }, [questionNumber, gameState.currentQuestionAnswerRevealed, gameState.currentQuestionStartTime, question?.id]);

  // Auto-switch the leaderboard scope to the current question as the game advances.
  // Mirrors the old leaderboard page's "follow live" behaviour, now driven into game state
  // so the audience modal follows along too. Manually picking a scope unpins this.
  useEffect(() => {
    if (!question) { prevQNumRef.current = null; return; }
    if (questionNumber !== prevQNumRef.current) {
      prevQNumRef.current = questionNumber;
      if (followingLive && gameState.leaderboardScope !== questionNumber) {
        gameStateManager.updateGameStateBackground({
          leaderboardScope: questionNumber,
          leaderboardCorrectFilter: 'all',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, questionNumber, followingLive]);

  const getFiltered = (): ResponseRow[] => {
    switch (filter) {
      case 'correct': return responses.filter(r => r.isCorrect === true);
      case 'incorrect': return responses.filter(r => r.isCorrect === false);
      case 'slowest': return [...responses].sort((a, b) => b.responseTimeMs - a.responseTimeMs);
      default: return responses;
    }
  };

  // ── Leaderboard control (drives the full-screen audience modal via game state) ──
  const setLeaderboard = (updates: Partial<GameState>) => {
    gameStateManager.updateGameStateBackground(updates);
  };

  const scope = gameState.leaderboardScope ?? 'all';
  const correctFilter = gameState.leaderboardCorrectFilter ?? 'all';
  const order = gameState.leaderboardOrder ?? 'fastest';
  const answerRevealed = gameState.currentQuestionAnswerRevealed;
  // Question numbers the operator can spotlight: every question played up to the current one
  const playedQuestions = Array.from({ length: Math.max(questionNumber, 0) }, (_, i) => i + 1);

  const filtered = getFiltered();

  return (
    <div className="bg-gray-800 rounded-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-lg">Play Along</h2>
        <span className="text-gray-400 text-sm">
          {participantCount > 0 ? `${participantCount} participants · ` : ''}{responses.length} responses
        </span>
      </div>

      {/* Leaderboard Control — drives the full-screen audience leaderboard */}
      <div className="mb-5 p-3 bg-gray-900/60 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-300 text-xs uppercase tracking-wide font-semibold">Audience Leaderboard</p>
          <button
            onClick={() => setLeaderboard({ showLeaderboard: !gameState.showLeaderboard })}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
              gameState.showLeaderboard
                ? 'bg-green-600 text-white hover:bg-green-500'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {gameState.showLeaderboard ? '🟢 Showing — Hide' : 'Show Leaderboard'}
          </button>
        </div>

        {/* Scope: overall ranking or a specific question's spotlight */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-gray-500 text-[10px] uppercase tracking-wide">View</p>
          <button
            onClick={() => {
              setFollowingLive(true);
              if (questionNumber) setLeaderboard({ leaderboardScope: questionNumber, leaderboardCorrectFilter: 'all' });
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${
              followingLive ? 'bg-green-600 text-white cursor-default' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
            title={followingLive ? 'Following the live question' : 'Click to follow the live question'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${followingLive ? 'bg-green-300 animate-pulse' : 'bg-white/30'}`} />
            Live
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => { setFollowingLive(false); setLeaderboard({ leaderboardScope: 'all' }); }}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              scope === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            All Questions
          </button>
          {playedQuestions.map((n) => (
            <button
              key={n}
              onClick={() => { setFollowingLive(false); setLeaderboard({ leaderboardScope: n }); }}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                scope === n ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Q{n}
            </button>
          ))}
        </div>

        {/* Combinable filters — only relevant for a single-question spotlight */}
        {scope !== 'all' && (
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Show</p>
              <div className="flex gap-1.5">
                {(['all', 'correct', 'incorrect'] as const).map((f) => {
                  const disabled = f !== 'all' && scope === questionNumber && !answerRevealed;
                  return (
                    <button
                      key={f}
                      onClick={() => setLeaderboard({ leaderboardCorrectFilter: f })}
                      disabled={disabled}
                      title={disabled ? 'Reveal answer first' : ''}
                      className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors disabled:opacity-40 ${
                        correctFilter === f ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Order</p>
              <div className="flex gap-1.5">
                {(['fastest', 'slowest'] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setLeaderboard({ leaderboardOrder: o })}
                    className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${
                      order === o ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!question ? (
        <p className="text-gray-500 text-sm">No active question.</p>
      ) : (
        <>
          {/* Filter buttons */}
          <div className="flex gap-2 mb-3">
            {(['all', 'correct', 'incorrect', 'quickest', 'slowest'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                  filter === f ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Response table */}
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-sm">
              {responses.length === 0 ? 'No responses yet.' : 'No responses match this filter.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-gray-700">
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Name</th>
                    <th className="text-left py-2 pr-3">Answer</th>
                    <th className="text-left py-2 pr-3">Time</th>
                    {gameState.currentQuestionAnswerRevealed && (
                      <th className="text-left py-2">Correct?</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.uid} className="border-b border-gray-700/50">
                      <td className="py-1.5 pr-3 text-gray-500">{i + 1}</td>
                      <td className="py-1.5 pr-3 text-white">{r.name}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                          r.isCorrect === true ? 'bg-green-700 text-white' :
                          r.isCorrect === false ? 'bg-red-700 text-white' :
                          'bg-yellow-700 text-white'
                        }`}>
                          {r.answer}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-gray-300 tabular-nums">
                        {r.responseTimeMs > 0 ? `${(r.responseTimeMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      {gameState.currentQuestionAnswerRevealed && (
                        <td className="py-1.5">
                          {r.isCorrect === true ? <span className="text-green-400">✓</span> :
                           r.isCorrect === false ? <span className="text-red-400">✗</span> :
                           <span className="text-gray-600">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
