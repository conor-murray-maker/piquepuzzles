import { GameMode } from '@/engines/PuzzleEngine';

// Normalisation constants per game mode — no conditional logic, pure config
const NORMALISATION_CONFIG: Record<string, { movesMin: number; movesMax: number; timeMin: number; timeMax: number }> = {
  klondike: { movesMin: 50, movesMax: 200, timeMin: 60, timeMax: 600 },
  freecell: { movesMin: 40, movesMax: 180, timeMin: 60, timeMax: 540 },
  realm: { movesMin: 6, movesMax: 30, timeMin: 30, timeMax: 600 },
};

function getConfig(gameMode: string) {
  return NORMALISATION_CONFIG[gameMode] ?? NORMALISATION_CONFIG.klondike;
}

export interface PoolStats {
  winRate: number;
  avgMoves: number;
  avgTime: number;
  abandonRate: number;
  gameMode: string;
}

export interface DealRecord {
  ddsInitial: number;
  ddsEmpirical: number;
  poolAttempts: number;
}

export class DDSService {
  static computeBlendedDDS(deal: DealRecord): number {
    if (deal.poolAttempts < 30) return deal.ddsInitial;
    if (deal.poolAttempts >= 100) return deal.ddsEmpirical;
    const blend = (deal.poolAttempts - 30) / 70;
    return deal.ddsInitial * (1 - blend) + deal.ddsEmpirical * blend;
  }

  static computeEmpiricalDDS(stats: PoolStats): number {
    return (
      (1 - stats.winRate) * 25 +
      DDSService.normalise(stats.avgMoves, stats.gameMode, 'moves') * 25 +
      DDSService.normalise(stats.avgTime, stats.gameMode, 'time') * 25 +
      stats.abandonRate * 25
    );
  }

  static normalise(value: number, gameMode: string, type: 'moves' | 'time'): number {
    const cfg = getConfig(gameMode);
    const min = type === 'moves' ? cfg.movesMin : cfg.timeMin;
    const max = type === 'moves' ? cfg.movesMax : cfg.timeMax;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  /**
   * Map DDS to difficulty label.
   * Klondike and FreeCell are capped at "Master" — Grandmaster is reserved for Realm.
   */
  static ddsToLabel(dds: number, gameMode?: string): string {
    if (dds < 26) return 'Easy';
    if (dds < 51) return 'Medium';
    if (dds < 76) return 'Hard';
    if (dds < 101) return 'Expert';
    if (gameMode === 'klondike' || gameMode === 'freecell') return 'Master';
    if (dds < 131) return 'Master';
    return 'Grandmaster';
  }
}
