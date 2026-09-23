import React, { useState } from 'react';
import { getDoc, setDoc } from 'firebase/firestore';
import { questionsDocRef } from '@/lib/firebase';
import { gameStateManager } from '@/lib/gameState';
import { GameLogic } from '@/utils/gameLogic';
import type { GameState, Question } from '@/lib/types';

interface QuestionEditorProps {
  question: Question;
  gameState: GameState;
  onSaved: () => void;
  onCancel: () => void;
  onError: (error: string) => void;
}

/**
 * Inline editor for any question in the pool — not just the one on screen.
 *
 * Saving always writes the persisted pool. If the edited question also happens
 * to be the one currently live, the game state copy is updated too, so the
 * audience display picks the change up immediately instead of showing stale
 * text until the next selection.
 */
export default function QuestionEditor({
  question,
  gameState,
  onSaved,
  onCancel,
  onError,
}: QuestionEditorProps) {
  const isOneShot = GameLogic.isOneShot(gameState);
  const isLive = gameState.currentQuestion?.id === question.id;

  // Older rows sometimes store the answer TEXT rather than the letter.
  const resolveGuestAnswerLetter = (q: Question): 'A' | 'B' | 'C' | 'D' => {
    const raw = q.guest_answer?.toString().toUpperCase().trim();
    if (raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D') return raw;
    if (raw === q.option_a?.toUpperCase().trim()) return 'A';
    if (raw === q.option_b?.toUpperCase().trim()) return 'B';
    if (raw === q.option_c?.toUpperCase().trim()) return 'C';
    if (raw === q.option_d?.toUpperCase().trim()) return 'D';
    return 'A';
  };

  const [processing, setProcessing] = useState(false);
  const [showAnswerChangeWarning, setShowAnswerChangeWarning] = useState(false);
  const [editForm, setEditForm] = useState({
    question: question.question,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
    guest_answer: resolveGuestAnswerLetter(question),
    contestant_name: question.contestant_name || '',
    prize: question.prize || '',
  });

  const persistSaveEdit = async () => {
    setShowAnswerChangeWarning(false);

    try {
      setProcessing(true);

      const updatedQuestion: Question = {
        ...question,
        question: editForm.question.trim(),
        option_a: editForm.option_a.trim(),
        option_b: editForm.option_b.trim(),
        option_c: editForm.option_c.trim(),
        option_d: editForm.option_d.trim(),
        guest_answer: editForm.guest_answer,
      };

      // One Shot fields. Blank means "not set", and the key is removed rather
      // than written as undefined — both Firestore and RTDB reject undefined.
      const contestantName = editForm.contestant_name.trim();
      const prizeText = editForm.prize.trim();
      if (contestantName) updatedQuestion.contestant_name = contestantName;
      else delete updatedQuestion.contestant_name;
      if (prizeText) updatedQuestion.prize = prizeText;
      else delete updatedQuestion.prize;

      // Persisted pool
      const poolDoc = await getDoc(questionsDocRef);
      const poolData = poolDoc.data() || {};
      const questions: Question[] = poolData.questions || [];
      const updatedQuestions = questions.map((q: Question) =>
        q.id === updatedQuestion.id ? updatedQuestion : q
      );
      await setDoc(questionsDocRef, {
        questions: updatedQuestions,
        lastUpdated: new Date().toISOString(),
        totalQuestions: updatedQuestions.length,
      });

      // Only touch the live game state when this is the question on screen.
      if (isLive) {
        await gameStateManager.updateGameState({ currentQuestion: updatedQuestion });
      }

      onSaved();
    } catch (error) {
      onError('Failed to save question edits');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveEdit = async () => {
    if (processing) return;
    if (!editForm.question.trim() || !editForm.option_a.trim() || !editForm.option_b.trim() ||
      !editForm.option_c.trim() || !editForm.option_d.trim()) {
      onError('All fields are required');
      return;
    }

    // Changing the TEXT of the option that is the answer is usually a mistake,
    // so confirm rather than silently rewriting what the judge is guessing at.
    const pick = (src: { option_a: string; option_b: string; option_c: string; option_d: string }) => (
      editForm.guest_answer === 'A' ? src.option_a :
      editForm.guest_answer === 'B' ? src.option_b :
      editForm.guest_answer === 'C' ? src.option_c :
      src.option_d
    ).trim();

    if (pick(question) !== pick(editForm)) {
      setShowAnswerChangeWarning(true);
      return;
    }
    await persistSaveEdit();
  };

  const field = 'w-full px-3 py-2 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-3">
      {isLive && (
        <div className="text-xs text-blue-300 bg-blue-900 bg-opacity-40 border border-blue-700 rounded px-2 py-1">
          This is the question currently on the audience screen — saving updates it live.
        </div>
      )}

      {isOneShot && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Contestant</label>
            <input
              type="text"
              value={editForm.contestant_name}
              onChange={(e) => setEditForm(f => ({ ...f, contestant_name: e.target.value }))}
              className={field}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Prize</label>
            <input
              type="text"
              value={editForm.prize}
              onChange={(e) => setEditForm(f => ({ ...f, prize: e.target.value }))}
              className={field}
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-400 mb-1">Question</label>
        <textarea
          value={editForm.question}
          onChange={(e) => setEditForm(f => ({ ...f, question: e.target.value }))}
          rows={2}
          className={`${field} resize-none`}
        />
      </div>

      {(['a', 'b', 'c', 'd'] as const).map((letter) => {
        const key = `option_${letter}` as 'option_a' | 'option_b' | 'option_c' | 'option_d';
        return (
          <div key={letter}>
            <label className="block text-xs text-gray-400 mb-1">Option {letter.toUpperCase()}</label>
            <input
              type="text"
              value={editForm[key]}
              onChange={(e) => setEditForm(f => ({ ...f, [key]: e.target.value }))}
              className={field}
            />
          </div>
        );
      })}

      <div>
        <label className="block text-xs text-gray-400 mb-1">
          {isOneShot ? 'Contestant Answer' : 'Guest Answer'}
        </label>
        <select
          value={editForm.guest_answer}
          onChange={(e) => setEditForm(f => ({ ...f, guest_answer: e.target.value as 'A' | 'B' | 'C' | 'D' }))}
          className={field}
        >
          {(['A', 'B', 'C', 'D'] as const).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {showAnswerChangeWarning && (
        <div className="bg-yellow-800 border border-yellow-500 rounded p-3 text-sm text-yellow-200">
          <p className="font-semibold mb-2">
            ⚠️ You changed the text of Option {editForm.guest_answer}, which is the
            {isOneShot ? ' contestant' : ' guest'} answer. Save anyway?
          </p>
          <div className="flex gap-2">
            <button
              onClick={persistSaveEdit}
              disabled={processing}
              className="px-3 py-1 bg-yellow-600 text-white rounded text-sm font-semibold hover:bg-yellow-500 disabled:opacity-50 transition-colors"
            >
              {processing ? 'Saving...' : 'Yes, save'}
            </button>
            <button
              onClick={() => setShowAnswerChangeWarning(false)}
              disabled={processing}
              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-500 disabled:opacity-50 transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSaveEdit}
          disabled={processing}
          className="px-4 py-2 bg-green-600 text-white rounded font-semibold text-sm hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? 'Saving...' : '✅ Save'}
        </button>
        <button
          onClick={() => { setShowAnswerChangeWarning(false); onCancel(); }}
          disabled={processing}
          className="px-4 py-2 bg-gray-600 text-white rounded font-semibold text-sm hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
