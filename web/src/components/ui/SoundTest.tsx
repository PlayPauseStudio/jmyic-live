import React from 'react';
import { soundPlayer, SOUND_EFFECTS } from '@/lib/sounds';

export default function SoundTest() {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-white font-bold mb-3">Sound Test</h3>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(SOUND_EFFECTS).map(([key, sound]) => (
          <button
            key={key}
            onClick={() => soundPlayer.playSound(key)}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500"
          >
            {sound.name}
          </button>
        ))}
      </div>
    </div>
  );
}