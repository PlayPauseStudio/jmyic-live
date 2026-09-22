'use client';

import React, { useState, useEffect } from 'react';
import { onValue } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';
import { db, playAlongAnswersRtdbRef, playAlongQuestionsMetaRtdbRef } from '@/lib/firebase';
import type { GameState } from '@/lib/types';

interface QuestionMeta {
  questionNumber: number;
  questionText: string;
  correctAnswer: string | null;
}

interface UserAnswer {
  answer: string;
  timestamp: number;
}

interface UserRow {
  uid: string;
  name: string;
  answers: Record<string, UserAnswer>; // keyed by questionNumber string
}

interface LeaderboardModalProps {
  gameState: GameState;
}

/**
 * Full-screen, broadcast-styled leaderboard shown on the audience screen.
 * Read-only: what it shows is driven entirely by operator-controlled game state
 * (showLeaderboard / leaderboardScope / leaderboardCorrectFilter / leaderboardOrder).
 * Phase-aware gating is ported verbatim from the old /leaderboard page.
 */
export default function LeaderboardModal({ gameState }: LeaderboardModalProps) {
  const [answersData, setAnswersData] = useState<Record<string, Record<string, any>>>({});
  const [questionsMetaData, setQuestionsMetaData] = useState<Record<string, any>>({});
  const [participantCount, setParticipantCount] = useState(0);

  // Subscribe to RTDB play-along answers (all questions, live)
  useEffect(() => {
    const unsub = onValue(playAlongAnswersRtdbRef, (snapshot) => {
      setAnswersData(snapshot.val() ?? {});
    });
    return () => unsub();
  }, []);

  // Subscribe to RTDB question metadata (questionText, correctAnswer per question number)
  useEffect(() => {
    const unsub = onValue(playAlongQuestionsMetaRtdbRef, (snapshot) => {
      setQuestionsMetaData(snapshot.val() ?? {});
    });
    return () => unsub();
  }, []);

  // Fetch total registered participant count from Firestore (one-time, not real-time)
  useEffect(() => {
    getDocs(collection(db, 'playAlongUsers'))
      .then(snap => setParticipantCount(snap.size))
      .catch(() => {});
  }, []);

  // ── Operator-driven controls ─────────────────────────────────────────────
  const scope = gameState.leaderboardScope ?? 'all';
  const correctFilter = gameState.leaderboardCorrectFilter ?? 'all';
  const order = gameState.leaderboardOrder ?? 'fastest';
  const selectedQuestion = scope === 'all' ? 'all' : String(scope);

  // ── Derived state (ported from the leaderboard page) ─────────────────────

  // Build question list from RTDB metadata + any question numbers that have answers
  const questions: QuestionMeta[] = React.useMemo(() => {
    const numSet = new Set<number>([
      ...Object.keys(questionsMetaData).map(Number),
      ...Object.keys(answersData).map(Number),
    ].filter(n => !isNaN(n)));
    return Array.from(numSet)
      .sort((a, b) => a - b)
      .map(num => ({
        questionNumber: num,
        questionText: questionsMetaData[num]?.questionText ?? `Question ${num}`,
        correctAnswer: questionsMetaData[num]?.correctAnswer ?? null,
      }));
  }, [questionsMetaData, answersData]);

  // Questions visible in the "All Questions" table — hides current live question until answer is revealed
  const visibleQuestions = React.useMemo(() =>
    questions.filter(q =>
      q.questionNumber !== (gameState?.currentQuestionNumber ?? -1) ||
      (gameState?.currentQuestionAnswerRevealed ?? false)
    ),
    [questions, gameState?.currentQuestionNumber, gameState?.currentQuestionAnswerRevealed]
  );

  // Build user rows for "All Questions" view
  const userRows: UserRow[] = React.useMemo(() => {
    const userMap = new Map<string, UserRow>();
    for (const [qNumStr, responses] of Object.entries(answersData)) {
      if (!responses || typeof responses !== 'object') continue;
      for (const [uid, r] of Object.entries(responses as Record<string, any>)) {
        if (!userMap.has(uid)) {
          userMap.set(uid, { uid, name: r.name ?? uid, answers: {} });
        }
        const user = userMap.get(uid)!;
        const existing = user.answers[qNumStr];
        if (!existing || r.timestamp > existing.timestamp) {
          user.answers[qNumStr] = { answer: r.answer, timestamp: r.timestamp };
          if (r.name) user.name = r.name;
        }
      }
    }
    // Sort by correct count on visible (revealed) questions only
    return Array.from(userMap.values()).sort((a, b) => {
      const aCorrect = visibleQuestions.filter(q =>
        q.correctAnswer && a.answers[String(q.questionNumber)]?.answer === q.correctAnswer
      ).length;
      const bCorrect = visibleQuestions.filter(q =>
        q.correctAnswer && b.answers[String(q.questionNumber)]?.answer === q.correctAnswer
      ).length;
      return bCorrect - aCorrect;
    });
  }, [answersData, visibleQuestions]);

  const getCorrectCount = (user: UserRow) =>
    visibleQuestions.filter(q =>
      q.correctAnswer && user.answers[String(q.questionNumber)]?.answer === q.correctAnswer
    ).length;

  const selectedMeta = selectedQuestion !== 'all'
    ? questions.find(q => String(q.questionNumber) === selectedQuestion) ?? null
    : null;

  // Synthesize meta from gameState for the live question if not in RTDB yet
  const liveMeta: QuestionMeta | null = React.useMemo(() => {
    if (!gameState?.currentQuestion || !gameState.currentQuestionNumber) return null;
    const num = gameState.currentQuestionNumber;
    if (questions.some(q => q.questionNumber === num)) return null;
    return {
      questionNumber: num,
      questionText: gameState.currentQuestion.question,
      correctAnswer: null,
    };
  }, [gameState?.currentQuestion, gameState?.currentQuestionNumber, questions]);

  const allQuestions: QuestionMeta[] = liveMeta
    ? [...questions, liveMeta].sort((a, b) => a.questionNumber - b.questionNumber)
    : questions;

  const effectiveSelectedMeta = selectedMeta ??
    (selectedQuestion !== 'all' && liveMeta && String(liveMeta.questionNumber) === selectedQuestion ? liveMeta : null);

  // Single-question rows — combinable filter: correctness first, then order by time
  const singleQuestionRows = React.useMemo(() => {
    if (!effectiveSelectedMeta) return null;
    const key = String(effectiveSelectedMeta.questionNumber);
    const qAnswers = answersData[key] ?? {};
    let rows = Object.entries(qAnswers as Record<string, any>).map(([uid, r]) => ({
      uid,
      name: r.name ?? uid,
      answer: r.answer as string,
      timestamp: r.timestamp as number,
      responseTimeMs: (r.responseTimeMs as number) ?? 0,
    }));

    // Correctness filter
    if (correctFilter === 'correct' && effectiveSelectedMeta.correctAnswer) {
      rows = rows.filter(r => r.answer === effectiveSelectedMeta.correctAnswer);
    } else if (correctFilter === 'incorrect' && effectiveSelectedMeta.correctAnswer) {
      rows = rows.filter(r => r.answer !== effectiveSelectedMeta.correctAnswer);
    }

    // Order by answer time
    if (order === 'slowest') {
      rows.sort((a, b) => b.timestamp - a.timestamp);
    } else {
      rows.sort((a, b) => a.timestamp - b.timestamp);
    }

    return rows;
  }, [effectiveSelectedMeta, answersData, correctFilter, order]);

  // Whether the selected question's table should be visible (gating)
  const isCurrentQuestion = (qNum: number) => qNum === (gameState?.currentQuestionNumber ?? -1);
  const showTable = (qNum: number) => !isCurrentQuestion(qNum) || (gameState?.currentQuestionAnswerRevealed ?? false);

  const filterLabel = correctFilter === 'all'
    ? (order === 'slowest' ? 'Slowest' : 'Fastest')
    : `${order === 'slowest' ? 'Slowest' : 'Fastest'} ${correctFilter === 'correct' ? 'Correct' : 'Incorrect'}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-indigo-950 px-10 py-10 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-7xl font-bold text-white font-bebas tracking-wide">Play Along Leaderboard</h1>
          <p className="text-purple-300 mt-3 text-2xl">
            Judge Me If You Can
            {participantCount > 0 && (
              <span className="ml-4 text-purple-400">· {participantCount} registered participants</span>
            )}
          </p>
        </div>

        {allQuestions.length === 0 ? (
          <div className="text-center py-32 text-white/30 text-3xl">
            Waiting for the first question…
          </div>
        ) : selectedQuestion === 'all' ? (
          // ── Overall ranking table ──────────────────────────────────────────
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-xl">
              <thead>
                <tr className="bg-white/10 text-white/60 text-base uppercase tracking-wide">
                  <th className="text-left px-5 py-4">Rank</th>
                  <th className="text-left px-5 py-4">Name</th>
                  {visibleQuestions.map(q => (
                    <th key={q.questionNumber} className="text-center px-4 py-4">Q{q.questionNumber}</th>
                  ))}
                  <th className="text-center px-5 py-4">Correct</th>
                </tr>
              </thead>
              <tbody>
                {userRows.map((user, i) => {
                  const totalCorrect = getCorrectCount(user);
                  return (
                    <tr key={user.uid} className={`border-t border-white/5 ${i % 2 === 0 ? 'bg-white/5' : ''}`}>
                      <td className="px-5 py-4 text-white/50 font-bold">{i + 1}</td>
                      <td className="px-5 py-4 text-white font-semibold">{user.name}</td>
                      {visibleQuestions.map(q => {
                        const ans = user.answers[String(q.questionNumber)];
                        if (!ans) return (
                          <td key={q.questionNumber} className="px-4 py-4 text-center">
                            <span className="text-white/20">—</span>
                          </td>
                        );
                        const isCorrect = q.correctAnswer ? ans.answer === q.correctAnswer : null;
                        return (
                          <td key={q.questionNumber} className="px-4 py-4 text-center">
                            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${
                              isCorrect === true ? 'bg-green-600 text-white' :
                              isCorrect === false ? 'bg-red-700 text-white' :
                              'bg-yellow-700 text-white'
                            }`}>
                              {ans.answer}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-5 py-4 text-center">
                        <span className={`font-bold text-2xl ${totalCorrect > 0 ? 'text-green-400' : 'text-white/30'}`}>
                          {totalCorrect}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {userRows.length === 0 && (
                  <tr>
                    <td colSpan={visibleQuestions.length + 3} className="px-5 py-14 text-center text-white/30 text-2xl">
                      No play along data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          // ── Per-question spotlight ──────────────────────────────────────────
          <div>
            {effectiveSelectedMeta && (
              <div className="bg-yellow-400 rounded-xl p-6 mb-8 text-center">
                <p className="text-sm text-yellow-900 uppercase tracking-wide font-semibold mb-1">
                  Question {effectiveSelectedMeta.questionNumber}
                  {showTable(effectiveSelectedMeta.questionNumber) && (
                    <span className="ml-3 text-yellow-800">· {filterLabel}</span>
                  )}
                </p>
                <p className="text-green-900 font-bold text-2xl">{effectiveSelectedMeta.questionText}</p>
                {effectiveSelectedMeta.correctAnswer && (
                  <p className="text-green-800 text-lg mt-2">
                    Correct Answer: <strong>{effectiveSelectedMeta.correctAnswer}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Live question: show count only until guest answer is revealed */}
            {effectiveSelectedMeta && !showTable(effectiveSelectedMeta.questionNumber) && (
              <div className="text-center py-20">
                <p className="text-9xl font-bold text-white font-bebas mb-3">
                  {Object.keys(answersData[selectedQuestion] ?? {}).length}
                </p>
                <p className="text-purple-300 text-2xl">responses received</p>
                <p className="text-white/30 text-lg mt-4">Results shown after guest answer is revealed</p>
              </div>
            )}

            {/* Full table for past questions OR after answer is revealed */}
            {effectiveSelectedMeta && showTable(effectiveSelectedMeta.questionNumber) && (
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full text-xl">
                  <thead>
                    <tr className="bg-white/10 text-white/60 text-base uppercase tracking-wide">
                      <th className="text-left px-5 py-4">Rank</th>
                      <th className="text-left px-5 py-4">Name</th>
                      <th className="text-center px-5 py-4">Answer</th>
                      <th className="text-center px-5 py-4">Time</th>
                      <th className="text-center px-5 py-4">Correct?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(singleQuestionRows ?? []).map((row, i) => {
                      const isCorrect = effectiveSelectedMeta?.correctAnswer
                        ? row.answer === effectiveSelectedMeta.correctAnswer
                        : null;
                      return (
                        <tr key={row.uid} className={`border-t border-white/5 ${i % 2 === 0 ? 'bg-white/5' : ''}`}>
                          <td className="px-5 py-4 text-white/50 font-bold">{i + 1}</td>
                          <td className="px-5 py-4 text-white font-semibold">{row.name}</td>
                          <td className="px-5 py-4 text-center">
                            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${
                              isCorrect === true ? 'bg-green-600 text-white' :
                              isCorrect === false ? 'bg-red-700 text-white' :
                              'bg-yellow-700 text-white'
                            }`}>
                              {row.answer}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center text-white/80 tabular-nums">
                            {row.responseTimeMs > 0 ? `${(row.responseTimeMs / 1000).toFixed(1)}s` : '—'}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {isCorrect === true ? <span className="text-green-400 text-2xl">✓</span> :
                             isCorrect === false ? <span className="text-red-400 text-2xl">✗</span> :
                             <span className="text-white/30">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {(singleQuestionRows ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-14 text-center text-white/30 text-2xl">
                          {correctFilter !== 'all'
                            ? `No ${correctFilter} responses for this question.`
                            : 'No responses yet — waiting for players to answer.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
