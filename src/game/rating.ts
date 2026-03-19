import { Difficulty } from './types';

// Client-side rating display utilities only.
// Actual ELO calculation happens server-side in the complete-game edge function.
// Undo penalty is removed — undos only affect move count.

export function estimateDDS(minMoves: number, gameMode: 'klondike' | 'freecell'): number {
  if (gameMode === 'klondike') {
    if (minMoves < 60) return Math.round((minMoves / 60) * 25);
    if (minMoves < 90) return Math.round(26 + ((minMoves - 60) / 30) * 29);
    if (minMoves < 120) return Math.round(56 + ((minMoves - 90) / 30) * 24);
    return Math.round(Math.min(100, 81 + ((minMoves - 120) / 50) * 19));
  }
  if (minMoves < 50) return Math.round((minMoves / 50) * 25);
  if (minMoves < 80) return Math.round(26 + ((minMoves - 50) / 30) * 29);
  if (minMoves < 110) return Math.round(56 + ((minMoves - 80) / 30) * 24);
  return Math.round(Math.min(100, 81 + ((minMoves - 110) / 40) * 19));
}

export function dealRatingFromDDS(dds: number): number {
  return 800 + (dds / 100) * 1200;
}

export function getPerformancePercentile(moves: number, timeSeconds: number, difficulty: Difficulty): number {
  const optMoves = difficulty === 'Easy' ? 75 : difficulty === 'Medium' ? 90 : difficulty === 'Hard' ? 110 : 130;
  const moveScore = Math.min(1, optMoves / moves);
  const timeScore = Math.min(1, (difficulty === 'Easy' ? 120 : difficulty === 'Medium' ? 180 : 240) / timeSeconds);
  const combined = (moveScore * 0.6 + timeScore * 0.4) * 100;
  return Math.max(1, Math.min(99, Math.round(combined)));
}
