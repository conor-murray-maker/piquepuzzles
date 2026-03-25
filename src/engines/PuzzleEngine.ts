export interface Deal {
  seed: number;
  gameMode: GameMode;
  data: unknown; // game-specific deal representation
}

export interface VerificationResult {
  solvable: boolean;
  complexityScore: number; // 0-100, game-agnostic difficulty proxy
  minSolutionLength: number; // number of atomic moves in shortest solution
  confidence: number; // placeholder — caller computes Wilson confidence
  simulations: number; // how many simulations were run
  wins: number; // number of winning simulations
  uniqueWinningPaths: number; // count of distinct winning move sequences
  pathDiversityScore: number; // uniqueWinningPaths / totalWins, clamped 0-1
}

export interface PerformanceSignals {
  moves: number;
  timeSeconds: number;
  hintsUsed: number;
}

export interface GameState {
  dealId: string;
  gameMode: GameMode;
  isComplete: boolean;
  data: unknown; // game-specific state
}

export interface PuzzleEngine {
  gameMode: GameMode;
  generateDeal(seed: number): Deal;
  verifySolvable(deal: Deal, simulations: number): VerificationResult;
  getComplexityScore(minSolutionLength: number): number; // maps solution length to 0-100
}

export type GameMode = 'klondike' | 'freecell' | 'realm' | string; // extensible
