import { PuzzleEngine, Deal, VerificationResult, GameMode } from './PuzzleEngine';
import {
  createFreeCellGame,
  moveToFreeCell,
  moveFreeCellToFoundation,
  moveFreeCellToTableau,
  moveTableauToFoundation as fcMoveTableauToFoundation,
  moveTableauToTableau as fcMoveTableauToTableau,
  canMoveToFoundation as fcCanMoveToFoundation,
  canMoveToTableau as fcCanMoveToTableau,
  maxMovableCards,
  getValidSequenceLength,
} from '@/game/freecell';

function hashMoveSequence(moves: string[]): string {
  return moves.slice(0, 20).join('|');
}

class FreeCellEngineImpl implements PuzzleEngine {
  gameMode: GameMode = 'freecell';

  generateDeal(seed: number): Deal {
    const state = createFreeCellGame(seed);
    return { seed, gameMode: 'freecell', data: state };
  }

  verifySolvable(deal: Deal, simulations: number): VerificationResult {
    let bestMoves = Infinity;
    let completing = 0;
    let partial = 0;
    const winPathHashes = new Set<string>();

    for (let sim = 0; sim < simulations; sim++) {
      const result = this.runSim(deal.seed);
      if (result.won) {
        completing++;
        bestMoves = Math.min(bestMoves, result.moves);
        winPathHashes.add(hashMoveSequence(result.moveLog));
      } else if (result.foundationCards >= 47) {
        partial++;
      }
    }

    const solvable = completing > 0;
    const confidence = (completing / simulations) * 0.7 + (partial / simulations) * 0.3;
    const minSolutionLength = solvable ? bestMoves : 0;
    const uniqueWinningPaths = winPathHashes.size;
    const pathDiversityScore = completing > 0 ? Math.min(1, uniqueWinningPaths / completing) : 0;

    return {
      solvable,
      complexityScore: solvable ? this.getComplexityScore(minSolutionLength) : 0,
      minSolutionLength,
      confidence,
      simulations,
      uniqueWinningPaths,
      pathDiversityScore,
    };
  }

  getComplexityScore(minSolutionLength: number): number {
    if (minSolutionLength < 125) return Math.round((minSolutionLength / 125) * 25);
    if (minSolutionLength < 175) return Math.round(26 + ((minSolutionLength - 125) / (175 - 125)) * 29);
    if (minSolutionLength < 250) return Math.round(56 + ((minSolutionLength - 175) / (250 - 175)) * 24);
    return Math.round(Math.min(100, 81 + ((minSolutionLength - 250) / 100) * 19));
  }

  private runSim(seed: number): { won: boolean; moves: number; foundationCards: number; moveLog: string[] } {
    let state = createFreeCellGame(seed);
    let moves = 0;
    const MAX = 600;
    let stale = 0;
    let lastFT = 0;
    const moveLog: string[] = [];

    while (moves < MAX && !state.isWon) {
      const ft = state.foundation.reduce((s, p) => s + p.length, 0);
      if (ft > lastFT) { lastFT = ft; stale = 0; } else { stale++; if (stale > 120) break; }

      let acted = false;

      // 1. Foundation from tableau
      for (let i = 0; i < 8 && !acted; i++) {
        const col = state.tableau[i];
        if (!col.length) continue;
        const card = col[col.length - 1];
        if (fcCanMoveToFoundation(card, state.foundation) !== -1) {
          const r = fcMoveTableauToFoundation(state, i);
          if (r) { moveLog.push(`tf${i}`); state = r; moves++; acted = true; }
        }
      }
      if (acted) continue;

      // 2. Foundation from free cells
      for (let i = 0; i < 4 && !acted; i++) {
        const card = state.freeCells[i];
        if (!card) continue;
        if (fcCanMoveToFoundation(card, state.foundation) !== -1) {
          const r = moveFreeCellToFoundation(state, i);
          if (r) { moveLog.push(`ff${i}`); state = r; moves++; acted = true; }
        }
      }
      if (acted) continue;

      // 3. Tableau → tableau
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
        if (r) { moveLog.push(`t${fi}${fj}${fk}`); state = r; moves++; continue; }
      }

      // 4. Move to free cell
      const freeIdx = state.freeCells.findIndex(c => c === null);
      if (freeIdx !== -1 && Math.random() > 0.3) {
        const candidates: number[] = [];
        for (let i = 0; i < 8; i++) {
          if (state.tableau[i].length > 0) candidates.push(i);
        }
        if (candidates.length > 0) {
          const ci = candidates[Math.floor(Math.random() * candidates.length)];
          const r = moveToFreeCell(state, ci);
          if (r) { moveLog.push(`fc${ci}`); state = r; moves++; continue; }
        }
      }

      // 5. Move free cell cards to tableau
      let fcMoved = false;
      for (let i = 0; i < 4 && !fcMoved; i++) {
        const card = state.freeCells[i];
        if (!card) continue;
        for (let k = 0; k < 8; k++) {
          if (state.tableau[k].length === 0) continue;
          if (fcCanMoveToTableau(card, state.tableau[k])) {
            const r = moveFreeCellToTableau(state, i, k);
            if (r) { moveLog.push(`ft${i}${k}`); state = r; moves++; fcMoved = true; break; }
          }
        }
      }
      if (fcMoved) continue;

      break;
    }

    const foundationCards = state.foundation.reduce((s, p) => s + p.length, 0);
    return { won: state.isWon, moves, foundationCards, moveLog };
  }
}

export const FreeCellEngine = new FreeCellEngineImpl();
