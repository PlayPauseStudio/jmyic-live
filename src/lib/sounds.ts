import type { SoundEffect } from './types';

export const SOUND_EFFECTS: Record<string, SoundEffect> = {
  questionSelection: {
    name: 'Question Selection',
    file: '/sounds/question-selection.mp3'
  },
  panelWrong: {
    name: 'Panel Wrong',
    file: '/sounds/Wrong.mp3'
  },
  panelCorrect: {
    name: 'Panel Correct',
    file: '/sounds/Correct.mp3'
  },
  revealAnswer: {
    name: 'Reveal Answer',
    file: '/sounds/team-answer-reveal.mp3'
  },
  lockPlaced: {
    name: 'Lock Placed',
    file: '/sounds/lock.mp3'
  },
  buzzer: {
    name: 'Buzzer',
    file: '/sounds/buzzer.wav'
  },
  whoosh: {
    name: 'Whoosh',
    file: '/sounds/whoosh.mp3'
  }
} as const;

export class SoundPlayer {
  private audioContext: AudioContext | null = null;
  private loadedSounds: Map<string, AudioBuffer> = new Map();

  constructor() {
    // Initialize audio context on first user interaction
    if (typeof window !== 'undefined') {
      document.addEventListener('click', this.initAudioContext.bind(this), { once: true });
    }
  }

  private initAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
  }

  async preloadSounds(): Promise<void> {
    if (typeof window === 'undefined') return;

    this.initAudioContext();
    if (!this.audioContext) return;

    const loadPromises = Object.entries(SOUND_EFFECTS).map(async ([key, sound]) => {
      try {
        const response = await fetch(sound.file);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
        this.loadedSounds.set(key, audioBuffer);
        console.log(`Preloaded sound: ${sound.name}`);
      } catch (error) {
        console.error(`Failed to preload sound ${sound.name}:`, error);
      }
    });

    await Promise.all(loadPromises);
    console.log('All sounds preloaded');
  }

  async playSound(soundKey: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const sound = SOUND_EFFECTS[soundKey];
      if (!sound) {
        console.error(`Sound not found: ${soundKey}`);
        return;
      }

      // Try to play immediately without await to reduce delay
      const audio = new Audio(sound.file);
      audio.volume = 0.7;

      // Fire and forget - don't await to reduce delay
      audio.play().catch(error => {
        console.error(`Failed to play sound ${soundKey}:`, error);
      });

      console.log(`Playing sound: ${sound.name}`);
    } catch (error) {
      console.error(`Failed to play sound ${soundKey}:`, error);
    }
  }

  setVolume(volume: number): void {
    // This would need more implementation for Web Audio API
    console.log(`Volume set to: ${volume}`);
  }
}

// Singleton instance
export const soundPlayer = new SoundPlayer();

// Preload sounds when module loads
if (typeof window !== 'undefined') {
  soundPlayer.preloadSounds().catch(console.error);
}