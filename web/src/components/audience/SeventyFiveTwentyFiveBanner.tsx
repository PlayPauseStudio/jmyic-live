import React from 'react';
import type { GameState } from '@/lib/types';

interface SeventyFiveTwentyFiveBannerProps {
    gameState: GameState;
}

export default function SeventyFiveTwentyFiveBanner({ gameState }: SeventyFiveTwentyFiveBannerProps) {
    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-in-out ${gameState.show75_25Banner ? 'translate-y-0' : 'translate-y-full'
                }`}
        >
            <div className="bg-black bg-opacity-70 backdrop-blur-sm py-6 px-8">
                <div className="text-center">
                    <p className="text-white text-5xl font-bold font-bebas tracking-wider">
                        75:25 ACTIVATED
                    </p>
                </div>
            </div>
        </div>
    );
}
