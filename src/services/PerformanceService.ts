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
}
