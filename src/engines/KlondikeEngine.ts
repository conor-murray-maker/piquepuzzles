import { PuzzleEngine, Deal, VerificationResult, GameMode } from './PuzzleEngine';
import { createKlondikeGame, drawFromStock, moveWasteToTableau, moveWasteToFoundation, moveTableauToFoundation, moveTableauToTableau, canMoveToFoundation, canMoveToTableau } from '@/game/klondike';
import { KlondikeState } from '@/game/types';

// Hash first N moves of a winning sequence for path diversity
function hashMoveSequence(moves: string[]): string {
  // Use first 20 moves as fingerprint — enough to distinguish paths
  return moves.slice(0, 20).join('|');
}

class KlondikeEngineImpl implements PuzzleEngine {
  gameMode: GameMode = 'klondike';

  generateDeal(seed: number): Deal {
    const state = createKlondikeGame(3, seed);
    return { seed, gameMode: 'klondike', data: state };
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
    if (minSolutionLength < 100) return Math.round((minSolutionLength / 100) * 25);
    if (minSolutionLength < 130) return Math.round(26 + ((minSolutionLength - 100) / (130 - 100)) * 29);
    if (minSolutionLength < 160) return Math.round(56 + ((minSolutionLength - 130) / (160 - 130)) * 24);
    return Math.round(Math.min(100, 81 + ((minSolutionLength - 160) / 60) * 19));
  }

  private runSim(seed: number): { won: boolean; moves: number; foundationCards: number; moveLog: string[] } {
    let state = createKlondikeGame(3, seed);
    let moves = 0;
    const MAX = 500;
    let stockResets = 0;
    let lastFT = 0;
    let stale = 0;
    const moveLog: string[] = [];

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
          if (r) { moveLog.push(`tf${i}`); state = r; moves++; acted = true; }
        }
      }
      if (acted) continue;

      // 2. Foundation from waste
      if (state.waste.length > 0) {
        const card = state.waste[state.waste.length - 1];
        if (canMoveToFoundation(card, state.foundation) !== -1) {
          const r = moveWasteToFoundation(state);
          if (r) { moveLog.push('wf'); state = r; moves++; continue; }
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
        if (r) { moveLog.push(`t${fi}${fj}${fk}`); state = r; moves++; continue; }
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
          if (r) { moveLog.push(`wt${k}`); state = r; moves++; continue; }
        }
      }

      // 5. Other tableau moves
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
          if (r) { moveLog.push(`t${fi}${fj}${fk}`); state = r; moves++; continue; }
        }
      }

      // 6. Draw from stock / reset
      if (state.stock.length > 0) {
        moveLog.push('d');
        state = drawFromStock(state);
        moves++;
        continue;
      }
      if (state.waste.length > 0) {
        stockResets++;
        if (stockResets > 4) break;
        moveLog.push('r');
        state = drawFromStock(state);
        moves++;
        continue;
      }

      break;
    }

    const foundationCards = state.foundation.reduce((s, p) => s + p.length, 0);
    return { won: state.isWon, moves, foundationCards, moveLog };
  }
}

export const KlondikeEngine = new KlondikeEngineImpl();
