import { PerformanceSignals } from '@/engines/PuzzleEngine';

export interface DealBenchmarks {
  avgTime: number | null;
  avgMoves: number | null;
  poolAttempts: number;
  minSolutionLength: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class PerformanceService {
  /**
   * Compute performance modifier for card games (klondike, freecell).
   * For Realm, use computeRealmDelta instead.
   */
  static computeModifier(signals: PerformanceSignals, benchmarks: DealBenchmarks): number {
    const hasPoolData = benchmarks.poolAttempts >= 10;

    const expectedTime = hasPoolData && benchmarks.avgTime
      ? benchmarks.avgTime
      : (benchmarks.minSolutionLength > 0 ? benchmarks.minSolutionLength * 4 : 300);

    const expectedMoves = hasPoolData && benchmarks.avgMoves
      ? benchmarks.avgMoves
      : (benchmarks.minSolutionLength > 0 ? benchmarks.minSolutionLength * 1.8 : 150);

    const timeEfficiency = clamp(Math.max(expectedTime, 30) / Math.max(signals.timeSeconds, 10), 0.5, 1.5);
    const moveEfficiency = clamp(Math.max(expectedMoves, 20) / Math.max(signals.moves, 10), 0.5, 1.5);
    const hintPenalty = Math.max(0.7, 1 - signals.hintsUsed * 0.05);

    return clamp(
      (timeEfficiency * 0.4 + moveEfficiency * 0.4) * hintPenalty,
      0.5,
      1.5
    );
  }

  /**
   * Realm-specific scoring: exponential time curve, no moves, undo penalty, +60 cap.
   * Returns the final clamped delta (not a modifier).
   */
  static computeRealmDelta(
    baseDelta: number,
    actualTime: number,
    avgTime: number,
    undosUsed: number,
    hintsUsed: number,
  ): number {
    const baseCompletion = Math.round(baseDelta * 0.4);
    const timeRatio = avgTime / Math.max(actualTime, 1);
    const timeBonus = Math.round(baseCompletion * (Math.pow(timeRatio, 1.8) - 1));
    const undoPenalty = Math.round(baseCompletion * 0.3) * undosUsed;
    const hintPenalty = Math.max(0.7, 1 - hintsUsed * 0.05);
    const hintPenaltyPts = Math.round(baseCompletion * (1 - hintPenalty));

    const raw = baseCompletion + timeBonus - undoPenalty - hintPenaltyPts;
    // Cap protection: clamp to [-20, +60], then apply win floor
    return Math.max(1, clamp(raw, -20, 60));
  }
}
