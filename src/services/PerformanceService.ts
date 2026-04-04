/**
 * Client-side scoring reference — mirrors the ScoringEngine in complete-game edge function.
 * Used only for local preview/estimation; authoritative scoring is server-side.
 */

export interface DealBenchmarks {
  avgTime: number | null;
  avgMoves: number | null;
  poolAttempts: number;
  minSolutionLength: number;
}

interface ModeConfig {
  timeWeight: number;
  movesWeight: number;
  undoPenaltyPerUndo: number;
  baseCompletionFraction: number;
  lossPenalty: number;
  winFloor: number | null;
}

const MODE_CONFIGS: Record<string, ModeConfig> = {
  realm: {
    timeWeight: 20,
    movesWeight: 0,
    undoPenaltyPerUndo: 2,
    baseCompletionFraction: 0.4,
    lossPenalty: -20,
    winFloor: null,
  },
  freecell: {
    timeWeight: 20,
    movesWeight: 10,
    undoPenaltyPerUndo: 0,
    baseCompletionFraction: 0.5,
    lossPenalty: -20,
    winFloor: 1,
  },
  klondike: {
    timeWeight: 10,
    movesWeight: 20,
    undoPenaltyPerUndo: 0,
    baseCompletionFraction: 0.6,
    lossPenalty: -20,
    winFloor: 1,
  },
};

export class PerformanceService {
  static computeModifier(
    signals: { timeSeconds: number; moves: number; hintsUsed: number },
    benchmarks: DealBenchmarks,
    gameMode: string = 'klondike',
  ): number {
    const config = MODE_CONFIGS[gameMode] ?? MODE_CONFIGS.klondike;
    const avgTime = benchmarks.avgTime ?? 200;
    const avgMoves = benchmarks.avgMoves ?? 100;

    const timeRatio = avgTime / Math.max(signals.timeSeconds, 1);
    const timeDelta = config.timeWeight * (Math.pow(timeRatio, 1.3) - 1);

    let movesDelta = 0;
    if (config.movesWeight > 0 && avgMoves > 0) {
      const movesRatio = avgMoves / Math.max(signals.moves, 1);
      movesDelta = config.movesWeight * (Math.pow(movesRatio, 1.3) - 1);
    }

    const hintPenalty = Math.max(0.7, 1 - signals.hintsUsed * 0.05);

    // Return a modifier-like value for backward compat
    const raw = (timeDelta + movesDelta) * hintPenalty;
    return Math.max(0.5, Math.min(2.0, 1.0 + raw / 20));
  }

  static computeRealmDelta(
    baseDelta: number,
    actualTime: number,
    avgTime: number,
    undosUsed: number,
    hintsUsed: number,
  ): number {
    const config = MODE_CONFIGS.realm;
    const baseCompletion = Math.round(baseDelta * config.baseCompletionFraction);
    const timeRatio = avgTime / Math.max(actualTime, 1);
    const timeBonus = Math.round(config.timeWeight * (Math.pow(timeRatio, 1.3) - 1));
    const undoPenalty = config.undoPenaltyPerUndo * undosUsed;
    const hintPenaltyFraction = Math.max(0.7, 1 - hintsUsed * 0.05);
    const hintPenaltyPts = Math.round(baseCompletion * (1 - hintPenaltyFraction));
    const raw = baseCompletion + timeBonus - undoPenalty - hintPenaltyPts;
    return Math.max(config.lossPenalty + 1, raw);
  }
}
