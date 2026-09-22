import type { GameState } from '@/lib/types';

interface PlayAlongDisplayProps {
  gameState: GameState;
}

const MODE_CONFIG = {
  quickest: { label: 'Fastest Fingers', color: 'text-green-400', bg: 'bg-green-900/80' },
  slowest: { label: 'Slowest Responses', color: 'text-orange-400', bg: 'bg-orange-900/80' },
  correct: { label: 'Correct Answers!', color: 'text-blue-400', bg: 'bg-blue-900/80' },
  incorrect: { label: 'Wrong Answers', color: 'text-red-400', bg: 'bg-red-900/80' },
  none: { label: '', color: '', bg: '' }
};

export default function PlayAlongDisplay({ gameState }: PlayAlongDisplayProps) {
  const visible = gameState.playAlongDisplayMode !== 'none';
  const config = MODE_CONFIG[gameState.playAlongDisplayMode];
  const entries = gameState.playAlongDisplayEntries ?? [];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-500 ease-in-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className={`${config.bg} backdrop-blur-sm border-t border-white/10 py-4 px-8`}>
        <p className={`font-bebas text-3xl tracking-wider text-center ${config.color} mb-3`}>
          {config.label}
        </p>
        <div className="flex justify-center gap-4 flex-wrap">
          {entries.map((entry, i) => (
            <div
              key={entry.uid}
              className="flex items-center gap-3 bg-black/30 rounded-xl px-4 py-2"
            >
              <span className="text-white/50 font-bold text-sm w-5 text-right">{i + 1}.</span>
              <span className="text-white font-semibold text-lg">{entry.name}</span>
              {entry.responseTimeMs > 0 && (
                <span className="text-white/50 text-sm tabular-nums">
                  {(entry.responseTimeMs / 1000).toFixed(1)}s
                </span>
              )}
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${config.color} bg-black/20`}>
                {entry.answer}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
