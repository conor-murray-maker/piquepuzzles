import { Difficulty } from './types';

interface GameResult {
  won: boolean;
  moves: number;
  timeSeconds: number;
  hintsUsed: number;
  undosUsed: number;
  difficultyScore: number;
  difficulty: Difficulty;
}

const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  Easy: 0.8,
  Medium: 1.0,
  Hard: 1.3,
  Expert: 1.6,
};

// Estimated optimal moves by difficulty
const OPTIMAL_MOVES: Record<Difficulty, number> = {
  Easy: 75,
  Medium: 90,
  Hard: 110,
  Expert: 130,
};

export function calculateRatingChange(currentRating: number, result: GameResult): number {
  if (!result.won) {
    // Loss: small penalty scaled by difficulty (harder deals = smaller penalty)
    const basePenalty = -15;
    const diffMultiplier = 1 / DIFFICULTY_MULTIPLIER[result.difficulty];
    return Math.round(basePenalty * diffMultiplier);
  }

  // Win: calculate performance score
  const optimalMoves = OPTIMAL_MOVES[result.difficulty];
  const moveEfficiency = Math.max(0.3, Math.min(1.5, optimalMoves / result.moves));

  // Time factor: normalize by difficulty, diminishing returns
  const expectedTime = result.difficultyScore * 3; // ~seconds
  const timeFactor = Math.max(0.5, Math.min(1.3, expectedTime / Math.max(result.timeSeconds, 30)));

  // Hint penalty
  const hintPenalty = Math.max(0.5, 1 - result.hintsUsed * 0.1);

  // Undo penalty: 1-2 undos minimal, heavy usage tanks
  const undoPenalty = result.undosUsed <= 2 ? 1 : Math.max(0.4, 1 - (result.undosUsed - 2) * 0.08);

  const baseGain = 25;
  const diffMult = DIFFICULTY_MULTIPLIER[result.difficulty];
  const performanceScore = moveEfficiency * timeFactor * hintPenalty * undoPenalty;

  // K-factor: higher for lower ratings (faster climb)
  const kFactor = currentRating < 1000 ? 1.5 : currentRating < 1500 ? 1.0 : 0.7;

  const change = Math.round(baseGain * diffMult * performanceScore * kFactor);
  return Math.max(1, change); // Always gain at least 1 on a win
}

export function getPerformancePercentile(moves: number, timeSeconds: number, difficulty: Difficulty): number {
  // Simulated percentile based on performance
  const optMoves = OPTIMAL_MOVES[difficulty];
  const moveScore = Math.min(1, optMoves / moves);
  const timeScore = Math.min(1, (difficulty === 'Easy' ? 120 : difficulty === 'Medium' ? 180 : 240) / timeSeconds);
  const combined = (moveScore * 0.6 + timeScore * 0.4) * 100;
  return Math.max(1, Math.min(99, Math.round(combined)));
}
