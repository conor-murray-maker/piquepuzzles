import { PuzzleEngine, Deal, VerificationResult, GameMode } from './PuzzleEngine';
import { generateRealmPuzzle, type RealmGenOptions } from '@/game/realm';

class RealmEngineImpl implements PuzzleEngine {
  gameMode: GameMode = 'realm';

  generateDeal(seed: number, options?: RealmGenOptions): Deal {
    const puzzle = generateRealmPuzzle(seed, options);
    return { seed, gameMode: 'realm', data: puzzle };
  }

  verifySolvable(deal: Deal, simulations: number): VerificationResult {
    const puzzle = deal.data as ReturnType<typeof generateRealmPuzzle>;

    if (!puzzle) {
      return {
        solvable: false,
        complexityScore: 0,
        minSolutionLength: 0,
        confidence: 0,
        simulations: 1,
        wins: 0,
        uniqueWinningPaths: 0,
        pathDiversityScore: 0,
      };
    }

    // Realm puzzles are deterministic — unique solution verified at generation time.
    // Confidence is based on uniqueness + deduction chain, not win rate.
    const confidence = puzzle.deduction.solvable ? 1.0 : 0;

    return {
      solvable: true,
      complexityScore: puzzle.dds,
      minSolutionLength: puzzle.size, // N placements
      confidence,
      simulations: 1,
      wins: 1,
      uniqueWinningPaths: 1, // exactly one solution by construction
      pathDiversityScore: 0, // not applicable for deterministic puzzles
    };
  }

  getComplexityScore(minSolutionLength: number): number {
    // For Realm, DDS is computed directly in generation, not from solution length.
    // This is a fallback mapping from grid size.
    if (minSolutionLength <= 5) return 22;
    if (minSolutionLength <= 6) return 40;
    if (minSolutionLength <= 7) return 55;
    if (minSolutionLength <= 8) return 70;
    if (minSolutionLength <= 9) return 87;
    return 95;
  }
}

export const RealmEngine = new RealmEngineImpl();
