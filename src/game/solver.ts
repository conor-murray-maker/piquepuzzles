import { KlondikeState, FreeCellState, DrawMode, Difficulty } from './types';
import { createKlondikeGame, drawFromStock, moveWasteToTableau, moveWasteToFoundation, moveTableauToFoundation, moveTableauToTableau, canMoveToFoundation, canMoveToTableau } from './klondike';
import {
  createFreeCellGame,
  moveToFreeCell,
  moveFreeCellToFoundation,
  moveTableauToFoundation as fcMoveTableauToFoundation,
  moveTableauToTableau as fcMoveTableauToTableau,
  canMoveToFoundation as fcCanMoveToFoundation,
  canMoveToTableau as fcCanMoveToTableau,
  maxMovableCards,
  getValidSequenceLength,
} from './freecell';
import { generateSeed } from './deck';

export interface SolverResult {
  solvable: boolean;
  minMoves: number;
}

// ─── Klondike Monte Carlo Solver ────────────────────────────────────────────

export function solveKlondike(seed: number, drawMode: DrawMode, maxSims = 15): SolverResult {
  let bestMoves = Infinity;
  for (let sim = 0; sim < maxSims; sim++) {
    const result = runKlondikeSim(seed, drawMode);
    if (result !== null) bestMoves = Math.min(bestMoves, result);
  }
  return { solvable: bestMoves < Infinity, minMoves: bestMoves === Infinity ? 0 : bestMoves };
}

function runKlondikeSim(seed: number, drawMode: DrawMode): number | null {
  let state = createKlondikeGame(drawMode, seed);
  let moves = 0;
  const MAX = 500;
  let stockResets = 0;
  let lastFT = 0;
  let stale = 0;

  while (moves < MAX && !state.isWon) {
    const ft = state.foundation.reduce((s, p) => s + p.length, 0);
    if (ft > lastFT) { lastFT = ft; stale = 0; } else { stale++; if (stale > 120) break; }

    let acted = false;

    // 1. Foundation from tableau
    for (let i = 0; i < 7 && !acted; i++) {
      const col = state.tableau[i];
      if (!col.length) continue;
      const card = col[col.length - 1];
      if (!card.faceUp) continue;
      if (canMoveToFoundation(card, state.foundation) !== -1) {
        const r = moveTableauToFoundation(state, i);
        if (r) { state = r; moves++; acted = true; }
      }
    }
    if (acted) continue;

    // 2. Foundation from waste
    if (state.waste.length > 0) {
      const card = state.waste[state.waste.length - 1];
      if (canMoveToFoundation(card, state.foundation) !== -1) {
        const r = moveWasteToFoundation(state);
        if (r) { state = r; moves++; continue; }
      }
    }

    // 3. Expose face-down cards
    const exposeMoves: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const col = state.tableau[i];
      for (let j = 0; j < col.length; j++) {
        if (!col[j].faceUp) continue;
        if (j > 0 && !col[j - 1].faceUp) {
          for (let k = 0; k < 7; k++) {
            if (k === i) continue;
            if (canMoveToTableau(col[j], state.tableau[k])) {
              exposeMoves.push([i, j, k]);
            }
          }
        }
        break;
      }
    }
    if (exposeMoves.length > 0) {
      const [fi, fj, fk] = exposeMoves[Math.floor(Math.random() * exposeMoves.length)];
      const r = moveTableauToTableau(state, fi, fj, fk);
      if (r) { state = r; moves++; continue; }
    }

    // 4. Waste to tableau
    if (state.waste.length > 0) {
      const card = state.waste[state.waste.length - 1];
      const targets: number[] = [];
      for (let k = 0; k < 7; k++) {
        if (canMoveToTableau(card, state.tableau[k])) targets.push(k);
      }
      if (targets.length > 0) {
        const k = targets[Math.floor(Math.random() * targets.length)];
        const r = moveWasteToTableau(state, k);
        if (r) { state = r; moves++; continue; }
      }
    }

    // 5. Other tableau moves (random, probabilistic)
    if (Math.random() > 0.35) {
      const otherMoves: [number, number, number][] = [];
      for (let i = 0; i < 7; i++) {
        const col = state.tableau[i];
        for (let j = 0; j < col.length; j++) {
          if (!col[j].faceUp) continue;
          for (let k = 0; k < 7; k++) {
            if (k === i) continue;
            if (col[j].rank === 'K' && j === 0 && state.tableau[k].length === 0) continue;
            if (canMoveToTableau(col[j], state.tableau[k])) {
              otherMoves.push([i, j, k]);
            }
          }
        }
      }
      if (otherMoves.length > 0) {
        const [fi, fj, fk] = otherMoves[Math.floor(Math.random() * otherMoves.length)];
        const r = moveTableauToTableau(state, fi, fj, fk);
        if (r) { state = r; moves++; continue; }
      }
    }

    // 6. Draw from stock / reset
    if (state.stock.length > 0) {
      state = drawFromStock(state);
      moves++;
      continue;
    }
    if (state.waste.length > 0) {
      stockResets++;
      if (stockResets > 4) break;
      state = drawFromStock(state); // resets waste → stock
      moves++;
      continue;
    }

    break;
  }

  return state.isWon ? moves : null;
}

// ─── FreeCell Monte Carlo Solver ────────────────────────────────────────────

export function solveFreecell(seed: number, maxSims = 12): SolverResult {
  let bestMoves = Infinity;
  for (let sim = 0; sim < maxSims; sim++) {
    const result = runFreecellSim(seed);
    if (result !== null) bestMoves = Math.min(bestMoves, result);
  }
  return { solvable: bestMoves < Infinity, minMoves: bestMoves === Infinity ? 0 : bestMoves };
}

function runFreecellSim(seed: number): number | null {
  let state = createFreeCellGame(seed);
  let moves = 0;
  const MAX = 400;
  let stale = 0;
  let lastFT = 0;

  while (moves < MAX && !state.isWon) {
    const ft = state.foundation.reduce((s, p) => s + p.length, 0);
    if (ft > lastFT) { lastFT = ft; stale = 0; } else { stale++; if (stale > 80) break; }

    let acted = false;

    // 1. Foundation from tableau
    for (let i = 0; i < 8 && !acted; i++) {
      const col = state.tableau[i];
      if (!col.length) continue;
      const card = col[col.length - 1];
      if (fcCanMoveToFoundation(card, state.foundation) !== -1) {
        const r = fcMoveTableauToFoundation(state, i);
        if (r) { state = r; moves++; acted = true; }
      }
    }
    if (acted) continue;

    // 2. Foundation from free cells
    for (let i = 0; i < 4 && !acted; i++) {
      const card = state.freeCells[i];
      if (!card) continue;
      if (fcCanMoveToFoundation(card, state.foundation) !== -1) {
        const r = moveFreeCellToFoundation(state, i);
        if (r) { state = r; moves++; acted = true; }
      }
    }
    if (acted) continue;

    // 3. Tableau → tableau (build sequences)
    const tabMoves: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const col = state.tableau[i];
      if (!col.length) continue;
      const seqLen = getValidSequenceLength(col);
      const seqStart = col.length - seqLen;
      for (let j = seqStart; j < col.length; j++) {
        const numCards = col.length - j;
        for (let k = 0; k < 8; k++) {
          if (k === i) continue;
          if (state.tableau[k].length === 0 && j === 0) continue;
          if (fcCanMoveToTableau(col[j], state.tableau[k]) && numCards <= maxMovableCards(state, k)) {
            tabMoves.push([i, j, k]);
          }
        }
      }
    }
    if (tabMoves.length > 0) {
      const [fi, fj, fk] = tabMoves[Math.floor(Math.random() * tabMoves.length)];
      const r = fcMoveTableauToTableau(state, fi, fj, fk);
      if (r) { state = r; moves++; continue; }
    }

    // 4. Move to free cell
    const freeIdx = state.freeCells.findIndex(c => c === null);
    if (freeIdx !== -1 && Math.random() > 0.4) {
      const candidates: number[] = [];
      for (let i = 0; i < 8; i++) {
        if (state.tableau[i].length > 0) candidates.push(i);
      }
      if (candidates.length > 0) {
        const ci = candidates[Math.floor(Math.random() * candidates.length)];
        const r = moveToFreeCell(state, ci);
        if (r) { state = r; moves++; continue; }
      }
    }

    break;
  }

  return state.isWon ? moves : null;
}

// ─── DDS Mapping ────────────────────────────────────────────────────────────

export function minMovesToDDS(minMoves: number, gameMode: 'klondike' | 'freecell'): number {
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

export function ddsToLabel(dds: number): Difficulty {
  if (dds <= 25) return 'Easy';
  if (dds <= 55) return 'Medium';
  if (dds <= 80) return 'Hard';
  return 'Expert';
}

// ─── Verified Deal Creation ─────────────────────────────────────────────────

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
    if (seed !== undefined) break; // Can't change a specified seed
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
  const game = createFreeCellGame(seed);
  return { ...game, minMoves: 0 };
}
