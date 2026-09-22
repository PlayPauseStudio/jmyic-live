import { get, set, update, onValue, remove } from 'firebase/database';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { gameRtdbRef, defaultGameState, db, playAlongRtdbRoot, playAlongAnswersRtdbRef } from './firebase';
import type { GameState } from './types';

function mergeWithDefaults(raw: any): GameState {
  return {
    ...defaultGameState,
    ...raw,
    // RTDB drops null/empty-array keys — restore defaults for these
    revealedOptions: raw?.revealedOptions || [],
    aonRevealedOptions: raw?.aonRevealedOptions || [],
    playAlongDisplayEntries: raw?.playAlongDisplayEntries || [],
    lock: { ...defaultGameState.lock, ...(raw?.lock || {}) },
  };
}

export class GameStateManager {
  private listeners: (() => void)[] = [];
  private currentState: GameState | null = null;

  async initializeGame(): Promise<void> {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RTDB connection timeout')), 10000)
      );

      const snapshot = await Promise.race([get(gameRtdbRef), timeoutPromise]) as any;

      if (!snapshot.exists()) {
        await set(gameRtdbRef, {
          ...defaultGameState,
          lastActivity: new Date().toISOString()
        });
      } else {
        this.currentState = mergeWithDefaults(snapshot.val());
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error('Firebase connection timeout. Please check your internet connection.');
        } else if (error.message.includes('permission-denied') || error.message.includes('PERMISSION_DENIED')) {
          throw new Error('Firebase access denied. Please check permissions.');
        } else {
          throw new Error(`Failed to initialize game: ${error.message}`);
        }
      } else {
        throw new Error('Failed to initialize game');
      }
    }
  }

  async updateGameState(updates: Partial<GameState>): Promise<void> {
    try {
      if (this.currentState) {
        this.currentState = { ...this.currentState, ...updates };
      }
      await update(gameRtdbRef, {
        ...updates,
        lastActivity: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating game state:', error);
      throw new Error('Failed to update game state');
    }
  }

  updateGameStateBackground(updates: Partial<GameState>): void {
    if (this.currentState) {
      this.currentState = { ...this.currentState, ...updates };
    }
    update(gameRtdbRef, updates)
      .catch(err => console.error('Background update failed:', err));
  }

  async getCurrentGameState(): Promise<GameState | null> {
    try {
      const snapshot = await get(gameRtdbRef);
      return snapshot.exists() ? mergeWithDefaults(snapshot.val()) : null;
    } catch (error) {
      console.error('Error getting game state:', error);
      return null;
    }
  }

  subscribeToGameState(callback: (gameState: GameState | null) => void): () => void {
    const unsubscribe = onValue(
      gameRtdbRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const newState = mergeWithDefaults(snapshot.val());
          this.currentState = newState;
          callback(newState);
        } else {
          this.currentState = null;
          callback(null);
        }
      },
      (error) => {
        console.error('Error in game state subscription:', error);
        callback(null);
      }
    );

    this.listeners.push(unsubscribe);
    return unsubscribe;
  }

  getCurrentLocalState(): GameState | null {
    return this.currentState;
  }

  async resetPlayAlongAnswers(): Promise<void> {
    await remove(playAlongRtdbRoot);
  }

  async resetGame(): Promise<void> {
    try {
      const currentState = await this.getCurrentGameState();
      // Delete play-along answers AND registered users (old audience is cleared out)
      await this.resetPlayAlongData();
      await this.updateGameState({
        ...defaultGameState,
        usedQuestions: {},
        playersResetAt: Date.now(), // signals /play clients to sign out
        documentVersion: currentState?.documentVersion || '3.0'
      });
    } catch (error) {
      console.error('Error resetting game:', error);
      throw new Error('Failed to reset game');
    }
  }

  async resetEverything(): Promise<void> {
    try {
      await set(gameRtdbRef, {
        ...defaultGameState,
        playersResetAt: Date.now(), // signals /play clients to sign out
        lastActivity: new Date().toISOString(),
        documentVersion: '3.0'
      });
    } catch (error) {
      console.error('Error resetting game state:', error);
      throw new Error('Failed to reset game state');
    }
  }

  async resetPlayAlongData(): Promise<void> {
    try {
      // Wipe RTDB play-along node (answers + question metadata)
      await remove(playAlongRtdbRoot);

      // Also clean up old Firestore play-along data (legacy, one-time migration)
      const answersSnap = await getDocs(collection(db, 'playAlongAnswers'));
      for (const qDoc of answersSnap.docs) {
        const responsesSnap = await getDocs(collection(db, 'playAlongAnswers', qDoc.id, 'responses'));
        for (const rDoc of responsesSnap.docs) await deleteDoc(rDoc.ref);
        await deleteDoc(qDoc.ref);
      }
      const usersSnap = await getDocs(collection(db, 'playAlongUsers'));
      for (const uDoc of usersSnap.docs) await deleteDoc(uDoc.ref);
    } catch (error) {
      console.error('Error resetting play along data:', error);
      throw new Error('Failed to reset play along data');
    }
  }

  startKeepAlive(): () => void {
    const interval = setInterval(async () => {
      try {
        await this.updateGameState({ lastActivity: new Date().toISOString() });
      } catch (error) {
        console.error('Keep-alive error:', error);
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }

  cleanup(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
  }
}

export const gameStateManager = new GameStateManager();
