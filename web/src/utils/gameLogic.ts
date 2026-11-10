import type { GameState, Question, PrizeTier } from '@/lib/types';
import { PRIZE_TIERS } from '@/lib/constants';

/**
 * Read-only game rules the pages need for rendering — which buttons are
 * available, how to colour an option. Everything that CHANGES the game lives
 * on the server now (server/src/game/logic.ts holds the full rules, unchanged
 * from what used to run here); the operator panel sends intents instead.
 */
export class GameLogic {
  /** True when this show is running the One Shot format. */
  static isOneShot(gameState: GameState): boolean {
    return gameState.gameFormat === 'oneShot';
  }

  /** Which contestant this is, counted by how many have already finished (1-based). */
  static getOneShotPlayerNumber(gameState: GameState): number {
    return Object.keys(gameState.oneShotResults || {}).length + 1;
  }

  static getPrizeForLevel(level: number): number {
    const tier = PRIZE_TIERS.find(t => t.level === level);
    return tier ? tier.amount : 0;
  }

  static getCurrentPrizeTier(gameState: GameState): PrizeTier | null {
    return PRIZE_TIERS.find(t => t.level === gameState.currentQuestionNumber) || null;
  }

  /** Convert a full-text guest answer to its letter using the question's options. */
  static normalizeGuestAnswer(guestAnswer: string, question: Question): string {
    const normalized = (guestAnswer ?? '').toString().trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(normalized)) return normalized;
    const options = [
      { letter: 'A', text: (question.option_a ?? '').trim().toUpperCase() },
      { letter: 'B', text: (question.option_b ?? '').trim().toUpperCase() },
      { letter: 'C', text: (question.option_c ?? '').trim().toUpperCase() },
      { letter: 'D', text: (question.option_d ?? '').trim().toUpperCase() },
    ];
    const match = options.find(opt => opt.text && opt.text === normalized);
    return match ? match.letter : normalized;
  }

  /**
   * Does the panel's guess match the guest answer? On the big screen and the
   * phones the server blanks the answer until it's revealed, so before then
   * this is simply false there.
   */
  static isPanelGuessCorrectWithContext(panelGuess: string, guestAnswer: string, question: Question): boolean {
    if (!panelGuess || !guestAnswer) return false;
    return panelGuess.toUpperCase() === this.normalizeGuestAnswer(guestAnswer, question);
  }

  static isQuestionUsed(gameState: GameState, questionId: string): boolean {
    return !!gameState.usedQuestions?.[questionId];
  }

  static canPlaceLock(gameState: GameState): boolean {
    if (this.isOneShot(gameState)) return false;
    return !gameState.lock.placed && !gameState.gameOver;
  }

  static canStartAllOrNothing(gameState: GameState): boolean {
    if (this.isOneShot(gameState)) return false;
    return gameState.softEliminated && !gameState.allOrNothingActive && !gameState.allOrNothingComplete && !gameState.gameOver;
  }

  static canTriggerGameOver(gameState: GameState): boolean {
    return gameState.softEliminated
      && !gameState.gameOver
      && !gameState.allOrNothingActive
      && !gameState.guestLostPending
      && !gameState.guestVictoryPending;
  }
}
