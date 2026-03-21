// Legacy solver — delegates to engine implementations for backward compatibility.
// New code should use EngineRegistry and PuzzleEngine directly.

import { KlondikeState, FreeCellState, DrawMode, Difficulty } from './types';
import { createKlondikeGame } from './klondike';
import { createFreeCellGame } from './freecell';
import { generateSeed } from './deck';
import { EngineRegistry } from '@/engines/EngineRegistry';

export interface SolverResult {
  solvable: boolean;
  minMoves: number;
}

export function solveKlondike(seed: number, drawMode: DrawMode, maxSims = 15): SolverResult {
  try {
    const engine = EngineRegistry.get('klondike');
    const deal = engine.generateDeal(seed);
    const result = engine.verifySolvable(deal, maxSims);
    return { solvable: result.solvable, minMoves: result.minSolutionLength };
  } catch {
    return { solvable: false, minMoves: 0 };
  }
}

export function solveFreecell(seed: number, maxSims = 12): SolverResult {
  try {
    const engine = EngineRegistry.get('freecell');
    const deal = engine.generateDeal(seed);
    const result = engine.verifySolvable(deal, maxSims);
    return { solvable: result.solvable, minMoves: result.minSolutionLength };
  } catch {
    return { solvable: false, minMoves: 0 };
  }
}

export function minMovesToDDS(minMoves: number, gameMode: 'klondike' | 'freecell'): number {
  try {
    const engine = EngineRegistry.get(gameMode);
    return engine.getComplexityScore(minMoves);
  } catch {
    // Fallback if engine not registered
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
}

export function ddsToLabel(dds: number): Difficulty {
  if (dds <= 25) return 'Easy';
  if (dds <= 55) return 'Medium';
  if (dds <= 80) return 'Hard';
  return 'Expert';
}

export function createVerifiedKlondikeGame(drawMode: DrawMode, seed?: number): KlondikeState {
  const MAX_ATTEMPTS = 8;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const s = seed ?? generateSeed();
    const game = createKlondikeGame(drawMode, s);
    const result = solveKlondike(s, drawMode, 15);
    if (result.solvable) {
      const dds = minMovesToDDS(result.minMoves, 'klondike');
      return {
        ...game,
        difficulty: ddsToLabel(dds),
        difficultyScore: dds,
        minMoves: result.minMoves,
      };
    }
    if (seed !== undefined) break;
    seed = undefined;
  }
  throw new Error('Could not generate verified solvable Klondike deal after ' + MAX_ATTEMPTS + ' attempts');
}

export function createVerifiedFreeCellGame(seed?: number): FreeCellState {
  const MAX_ATTEMPTS = 5;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const s = seed ?? generateSeed();
    const game = createFreeCellGame(s);
    const result = solveFreecell(s, 12);
    if (result.solvable) {
      const dds = minMovesToDDS(result.minMoves, 'freecell');
      return {
        ...game,
        difficulty: ddsToLabel(dds),
        difficultyScore: dds,
        minMoves: result.minMoves,
      };
    }
    if (seed !== undefined) break;
    seed = undefined;
  }
  throw new Error('Could not generate verified solvable FreeCell deal after ' + MAX_ATTEMPTS + ' attempts');
}
