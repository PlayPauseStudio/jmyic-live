import type { GameState } from '@/lib/types';
import { GameLogic } from '@/utils/gameLogic';

type OptionKey = 'A' | 'B' | 'C' | 'D';

interface AnswerScreenProps {
  gameState: GameState;
  existingAnswer: OptionKey | null;
  onAnswerSubmit: (answer: OptionKey) => void;
}

const OPTION_LABELS: Record<OptionKey, string> = { A: 'A', B: 'B', C: 'C', D: 'D' };

export default function AnswerScreen({ gameState, existingAnswer, onAnswerSubmit }: AnswerScreenProps) {
  const question = gameState.currentQuestion!;
  const windowOpen = gameState.playAlongAnswerWindowOpen ??
    (!gameState.panelGuessSubmitted && gameState.currentQuestion !== null);
  const answerRevealed = gameState.currentQuestionAnswerRevealed;
  const correctAnswer = GameLogic.normalizeGuestAnswer(question.guest_answer, question) as OptionKey;
  const userWasCorrect = answerRevealed && existingAnswer !== null && existingAnswer === correctAnswer;
  const userWasWrong = answerRevealed && existingAnswer !== null && existingAnswer !== correctAnswer;

  const getOptionText = (key: OptionKey) => {
    if (key === 'A') return question.option_a;
    if (key === 'B') return question.option_b;
    if (key === 'C') return question.option_c;
    return question.option_d;
  };

  // When answer is revealed, show all options (mirrors QuestionDisplay.tsx behaviour).
  // Otherwise only show revealed options, excluding hidden option.
  const revealedOptions: OptionKey[] = gameState.allOrNothingActive
    ? (gameState.aonRevealedOptions as OptionKey[]) || []
    : (gameState.revealedOptions as OptionKey[]) || [];

  const visibleOptions = (['A', 'B', 'C', 'D'] as OptionKey[]).filter(key => {
    if (gameState.hiddenOption === key) return false;
    if (answerRevealed) return true; // show all when revealed
    return revealedOptions.includes(key);
  });

  const getOptionStyle = (key: OptionKey): string => {
    if (answerRevealed) {
      if (key === correctAnswer) {
        return 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-500/30';
      }
      if (key === existingAnswer) {
        // User's wrong pick
        return 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-500/30';
      }
      return 'bg-white/5 border-white/10 text-white/30 cursor-default';
    }
    if (existingAnswer === key) {
      return 'bg-purple-500 border-purple-400 text-white shadow-lg shadow-purple-500/40 scale-[1.02]';
    }
    if (windowOpen) {
      return 'bg-white/10 border-white/20 text-white hover:bg-white/20 active:scale-[0.98]';
    }
    return 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed';
  };

  const getBadgeStyle = (key: OptionKey): string => {
    if (answerRevealed) {
      if (key === correctAnswer) return 'bg-white text-green-700';
      if (key === existingAnswer) return 'bg-white text-red-700';
      return 'bg-white/10 text-white/30';
    }
    return existingAnswer === key ? 'bg-white text-purple-600' : 'bg-white/20 text-white';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex flex-col px-4 py-6">
      {/* Header */}
      <div className="text-center mb-2">
        <p className="text-purple-300 text-xs font-semibold uppercase tracking-widest">
          {gameState.allOrNothingActive
            ? `All or Nothing — Attempt ${gameState.allOrNothingAttempt}`
            : `Question ${gameState.currentQuestionNumber} of 7`}
        </p>
      </div>

      {/* Question */}
      <div className="bg-yellow-400 border-2 border-yellow-500 rounded-2xl p-4 mb-4">
        <p className="text-green-900 font-bold text-lg leading-snug text-center">
          {question.question}
        </p>
      </div>

      {/* Status line — changes meaning after reveal */}
      {!answerRevealed && (
        <div className={`text-center text-xs font-semibold uppercase tracking-wide mb-4 ${
          windowOpen ? 'text-green-400' : 'text-red-400'
        }`}>
          {windowOpen ? 'Answer window is OPEN' : 'Answer window is CLOSED'}
        </div>
      )}

      {/* Options */}
      {visibleOptions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/50 text-sm">Waiting for options to be revealed...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleOptions.map((key) => (
            <button
              key={key}
              onClick={() => { if (windowOpen && !answerRevealed) onAnswerSubmit(key); }}
              disabled={!windowOpen || answerRevealed}
              className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left font-semibold transition-all ${getOptionStyle(key)}`}
            >
              <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${getBadgeStyle(key)}`}>
                {OPTION_LABELS[key]}
              </span>
              <span className="text-sm leading-snug">{getOptionText(key)}</span>
              {answerRevealed && key === correctAnswer && (
                <span className="ml-auto text-white text-lg font-bold">✓</span>
              )}
              {answerRevealed && key === existingAnswer && key !== correctAnswer && (
                <span className="ml-auto text-white text-lg font-bold">✗</span>
              )}
              {!answerRevealed && existingAnswer === key && (
                <span className="ml-auto text-white/80 text-lg">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Result banner — appears after answer is revealed */}
      {answerRevealed && (
        <div className={`mt-6 rounded-2xl p-5 text-center ${
          userWasCorrect ? 'bg-green-600/90' :
          userWasWrong ? 'bg-red-600/90' :
          'bg-gray-700/90'
        }`}>
          {userWasCorrect && (
            <>
              <p className="text-white text-2xl font-bold">✓ Correct!</p>
              <p className="text-green-200 text-sm mt-1">You nailed it!</p>
            </>
          )}
          {userWasWrong && (
            <>
              <p className="text-white text-2xl font-bold">✗ Wrong!</p>
              <p className="text-red-200 text-sm mt-1">
                Correct answer was <strong>{correctAnswer}</strong>
              </p>
            </>
          )}
          {!existingAnswer && (
            <>
              <p className="text-white text-xl font-bold">You didn't answer</p>
              <p className="text-gray-300 text-sm mt-1">
                Correct answer was <strong>{correctAnswer}</strong>
              </p>
            </>
          )}
        </div>
      )}

      {/* Locked answer (before reveal, after window closed) */}
      {!windowOpen && !answerRevealed && existingAnswer && (
        <div className="mt-6 text-center">
          <p className="text-white/60 text-sm">
            Your answer: <span className="text-purple-300 font-bold">{existingAnswer}</span>
          </p>
        </div>
      )}
    </div>
  );
}
