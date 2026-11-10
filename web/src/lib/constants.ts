// Prize ladder. The server has the same table (server/src/game/state.ts) and is
// the one that actually awards it; this copy is for rendering.
export const PRIZE_TIERS = [
  { level: 1, amount: 2000, displayText: '₹2K' },
  { level: 2, amount: 4000, displayText: '₹4K' },
  { level: 3, amount: 8000, displayText: '₹8K' },
  { level: 4, amount: 12000, displayText: '₹12K' },
  { level: 5, amount: 20000, displayText: '₹20K' },
  { level: 6, amount: 30000, displayText: '₹30K' },
  { level: 7, amount: 50000, displayText: '₹50K' },
] as const;
