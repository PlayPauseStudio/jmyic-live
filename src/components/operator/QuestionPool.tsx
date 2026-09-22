import React, { useState } from 'react';
import type { GameState, Question } from '@/lib/types';
import { gameStateManager } from '@/lib/gameState';
import { GameLogic } from '@/utils/gameLogic';

interface QuestionPoolProps {
  questions: Question[];
  gameState: GameState;
  onError: (error: string) => void;
  onQuestionSelected: () => void;
  loading?: boolean;
}

export default function QuestionPool({ 
  questions, 
  gameState, 
  onError, 
  onQuestionSelected,
  loading = false 
}: QuestionPoolProps) {
  const [processing, setProcessing] = useState(false);

  const handleSelectQuestion = async (question: Question) => {
    if (processing) return;

    try {
      setProcessing(true);
      
      // Calculate updates including potential advancement
      const updates = GameLogic.calculateQuestionSelection(gameState, question);
      
      // Update game state with calculated changes
      await gameStateManager.updateGameState(updates);

      onQuestionSelected();
    } catch (error) {
      onError('Failed to select question');
    } finally {
      setProcessing(false);
    }
  };

  const getAvailableQuestions = () => {
    return questions.filter(q => !GameLogic.isQuestionUsed(gameState, q.id));
  };

  const getUsedQuestions = () => {
    return questions.filter(q => GameLogic.isQuestionUsed(gameState, q.id));
  };

  const availableQuestions = getAvailableQuestions();
  const usedQuestions = getUsedQuestions();

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Question Pool</h2>
        <div className="text-gray-300 text-sm">
          Available: {availableQuestions.length} | Used: {usedQuestions.length} | Total: {questions.length}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-blue-400 text-lg mb-4">🔄 Loading questions...</div>
          <p className="text-gray-400">Please wait while questions are being loaded</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-4">No questions available</div>
          <p className="text-gray-500">Upload a CSV file to add questions to the pool</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Available Questions */}
          <div>
            <h3 className="text-lg font-semibold text-green-400 mb-3">
              Available Questions ({availableQuestions.length})
            </h3>
            {availableQuestions.length === 0 ? (
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-gray-400">All questions have been used</p>
                <p className="text-gray-500 text-sm">Reset the game to reuse questions</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {availableQuestions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index + 1}
                    isUsed={false}
                    isSelected={gameState.currentQuestion?.id === question.id}
                    processing={processing}
                    onSelect={() => handleSelectQuestion(question)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Used Questions */}
          {usedQuestions.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-400 mb-3">
                Used Questions ({usedQuestions.length})
              </h3>
              <div className="grid gap-3">
                {usedQuestions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index + 1}
                    isUsed={true}
                    isSelected={false}
                    processing={false}
                    onSelect={() => {}} // No action for used questions
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface QuestionCardProps {
  question: Question;
  index: number;
  isUsed: boolean;
  isSelected: boolean;
  processing: boolean;
  onSelect: () => void;
}

function QuestionCard({ 
  question, 
  index, 
  isUsed, 
  isSelected, 
  processing, 
  onSelect 
}: QuestionCardProps) {
  return (
    <div className={`rounded-lg p-4 border-2 transition-all ${
      isSelected 
        ? 'bg-blue-900 border-blue-500' 
        : isUsed 
        ? 'bg-gray-700 border-gray-600 opacity-60' 
        : 'bg-gray-700 border-gray-600 hover:border-gray-500'
    }`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h4 className="text-white font-medium mb-2">
            Question {index}: {question.question}
          </h4>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-300">A) {question.option_a}</div>
            <div className="text-gray-300">B) {question.option_b}</div>
            <div className="text-gray-300">C) {question.option_c}</div>
            <div className="text-gray-300">D) {question.option_d}</div>
          </div>
          
          <div className="mt-2 text-sm">
            <span className="text-yellow-400">Guest Answer: {question.guest_answer}</span>
          </div>
        </div>

        <div className="ml-4 flex flex-col gap-2">
          {isUsed ? (
            <span className="px-3 py-1 bg-gray-600 text-gray-300 rounded text-sm">
              ✓ Used
            </span>
          ) : isSelected ? (
            <span className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
              ⭐ Current
            </span>
          ) : (
            <button
              onClick={onSelect}
              disabled={processing}
              className="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? 'Selecting...' : 'Select'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}