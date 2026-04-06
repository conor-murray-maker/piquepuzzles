/**
 * MCTS Web Worker — runs heuristic-scored lookahead simulations off the main thread.
 * Replaced binary win/loss random playouts with scorePosition + runLookahead.
 */

// Minimal card/state types duplicated here (worker can't import from src/)
interface WCard {
  id: string;
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
  faceUp: boolean;
}

interface SerializedKlondikeState {
  gameMode: 'klondike';
  tableau: WCard[][];
  foundation: WCard[][];
  stock: WCard[];
  waste: WCard[];
  drawMode: number;
  moves: number;
}

interface SerializedFreeCellState {
  gameMode: 'freecell';
  tableau: WCard[][];
  foundation: WCard[][];
  freeCells: (WCard | null)[];
  moves: number;
}

type SerializedGameState = SerializedKlondikeState | SerializedFreeCellState;

interface Move {
  type: string;
  from: string;
  to: string;
  cardIndex?: number;
  description: string;
}

// --- Utility functions ---
const RANK_VALUES: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

function rv(rank: string): number { return RANK_VALUES[rank] || 0; }
function isRed(suit: string): boolean { return suit === 'hearts' || suit === 'diamonds'; }

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function suitSym(suit: string): string {
  const m: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  return m[suit] || '';
}

// --- Klondike legal moves ---
function getKlondikeLegalMoves(state: SerializedKlondikeState): Move[] {
  const moves: Move[] = [];
  const { tableau, foundation, waste, stock } = state;

  for (let i = 0; i < 7; i++) {
    const col = tableau[i];
    if (!col.length) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    const fi = canMoveToFoundationK(card, foundation);
    if (fi !== -1) {
      moves.push({ type: 'tableau-to-foundation', from: `tableau-${i}`, to: `foundation-${fi}`, description: `${card.rank}${suitSym(card.suit)} → Foundation` });
    }
  }

  if (waste.length > 0) {
    const card = waste[waste.length - 1];
    const fi = canMoveToFoundationK(card, foundation);
    if (fi !== -1) {
      moves.push({ type: 'waste-to-foundation', from: 'waste', to: `foundation-${fi}`, description: `${card.rank}${suitSym(card.suit)} → Foundation` });
    }
  }

  for (let i = 0; i < 7; i++) {
    const col = tableau[i];
    for (let j = 0; j < col.length; j++) {
      if (!col[j].faceUp) continue;
      for (let k = 0; k < 7; k++) {
        if (k === i) continue;
        if (canMoveToTableauK(col[j], tableau[k])) {
          moves.push({ type: 'tableau-to-tableau', from: `tableau-${i}`, to: `tableau-${k}`, cardIndex: j, description: `${col[j].rank}${suitSym(col[j].suit)} → Column ${k + 1}` });
        }
      }
    }
  }

  if (waste.length > 0) {
    const card = waste[waste.length - 1];
    for (let k = 0; k < 7; k++) {
      if (canMoveToTableauK(card, tableau[k])) {
        moves.push({ type: 'waste-to-tableau', from: 'waste', to: `tableau-${k}`, description: `${card.rank}${suitSym(card.suit)} → Column ${k + 1}` });
      }
    }
  }

  if (stock.length > 0 || waste.length > 0) {
    moves.push({ type: 'stock-draw', from: 'stock', to: 'waste', description: 'Draw from stock' });
  }

  return moves;
}

function canMoveToFoundationK(card: WCard, foundation: WCard[][]): number {
  for (let i = 0; i < 4; i++) {
    const pile = foundation[i];
    if (pile.length === 0 && card.rank === 'A') {
      if (foundation.every((p, j) => j === i || p.length === 0 || p[0].suit !== card.suit)) return i;
    }
    if (pile.length > 0) {
      const top = pile[pile.length - 1];
      if (top.suit === card.suit && rv(card.rank) === rv(top.rank) + 1) return i;
    }
  }
  return -1;
}

function canMoveToTableauK(card: WCard, targetCol: WCard[]): boolean {
  if (targetCol.length === 0) return card.rank === 'K';
  const top = targetCol[targetCol.length - 1];
  if (!top.faceUp) return false;
  return isRed(card.suit) !== isRed(top.suit) && rv(card.rank) === rv(top.rank) - 1;
}

function applyKlondikeMove(state: SerializedKlondikeState, move: Move): SerializedKlondikeState | null {
  const s = deepClone(state);

  if (move.type === 'stock-draw') {
    if (s.stock.length === 0) {
      s.stock = s.waste.reverse().map(c => ({ ...c, faceUp: false }));
      s.waste = [];
    } else {
      const count = Math.min(s.drawMode, s.stock.length);
      for (let i = 0; i < count; i++) {
        const card = s.stock.pop()!;
        card.faceUp = true;
        s.waste.push(card);
      }
    }
    s.moves++;
    return s;
  }

  if (move.type === 'waste-to-foundation') {
    const card = s.waste.pop()!;
    const fi = parseInt(move.to.split('-')[1]);
    s.foundation[fi].push(card);
    s.moves++;
    return s;
  }

  if (move.type === 'waste-to-tableau') {
    const card = s.waste.pop()!;
    const ti = parseInt(move.to.split('-')[1]);
    s.tableau[ti].push(card);
    s.moves++;
    return s;
  }

  if (move.type === 'tableau-to-foundation') {
    const fi = parseInt(move.from.split('-')[1]);
    const card = s.tableau[fi].pop()!;
    const ti = parseInt(move.to.split('-')[1]);
    s.foundation[ti].push(card);
    const col = s.tableau[fi];
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }
    s.moves++;
    return s;
  }

  if (move.type === 'tableau-to-tableau') {
    const fi = parseInt(move.from.split('-')[1]);
    const ti = parseInt(move.to.split('-')[1]);
    const cardIdx = move.cardIndex ?? (s.tableau[fi].length - 1);
    const cards = s.tableau[fi].splice(cardIdx);
    s.tableau[ti].push(...cards);
    const col = s.tableau[fi];
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }
    s.moves++;
    return s;
  }

  return null;
}

// --- FreeCell legal moves ---
function getFreeCellLegalMoves(state: SerializedFreeCellState): Move[] {
  const moves: Move[] = [];
  const { tableau, foundation, freeCells } = state;

  for (let i = 0; i < 8; i++) {
    const col = tableau[i];
    if (!col.length) continue;
    const card = col[col.length - 1];
    const fi = canMoveToFoundationFC(card, foundation);
    if (fi !== -1) {
      moves.push({ type: 'tableau-to-foundation', from: `tableau-${i}`, to: `foundation-${fi}`, description: `${card.rank}${suitSym(card.suit)} → Foundation` });
    }
  }

  for (let i = 0; i < 4; i++) {
    const card = freeCells[i];
    if (!card) continue;
    const fi = canMoveToFoundationFC(card, foundation);
    if (fi !== -1) {
      moves.push({ type: 'freecell-to-foundation', from: `freecell-${i}`, to: `foundation-${fi}`, description: `${card.rank}${suitSym(card.suit)} → Foundation` });
    }
  }

  for (let i = 0; i < 8; i++) {
    const col = tableau[i];
    if (!col.length) continue;
    const card = col[col.length - 1];
    for (let k = 0; k < 8; k++) {
      if (k === i) continue;
      if (canMoveToTableauFC(card, tableau[k])) {
        moves.push({ type: 'tableau-to-tableau', from: `tableau-${i}`, to: `tableau-${k}`, description: `${card.rank}${suitSym(card.suit)} → Column ${k + 1}` });
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    const card = freeCells[i];
    if (!card) continue;
    for (let k = 0; k < 8; k++) {
      if (canMoveToTableauFC(card, tableau[k])) {
        moves.push({ type: 'freecell-to-tableau', from: `freecell-${i}`, to: `tableau-${k}`, description: `${card.rank}${suitSym(card.suit)} → Column ${k + 1}` });
      }
    }
  }

  const hasEmptyCell = freeCells.some(c => c === null);
  if (hasEmptyCell) {
    for (let i = 0; i < 8; i++) {
      const col = tableau[i];
      if (!col.length) continue;
      const card = col[col.length - 1];
      moves.push({ type: 'tableau-to-freecell', from: `tableau-${i}`, to: 'freecell', description: `${card.rank}${suitSym(card.suit)} → Free Cell` });
    }
  }

  return moves;
}

function canMoveToFoundationFC(card: WCard, foundation: WCard[][]): number {
  for (let i = 0; i < 4; i++) {
    const pile = foundation[i];
    if (pile.length === 0 && card.rank === 'A') {
      if (foundation.every((p, j) => j === i || p.length === 0 || p[0].suit !== card.suit)) return i;
    }
    if (pile.length > 0) {
      const top = pile[pile.length - 1];
      if (top.suit === card.suit && rv(card.rank) === rv(top.rank) + 1) return i;
    }
  }
  return -1;
}

function canMoveToTableauFC(card: WCard, targetCol: WCard[]): boolean {
  if (targetCol.length === 0) return true;
  const top = targetCol[targetCol.length - 1];
  return isRed(card.suit) !== isRed(top.suit) && rv(card.rank) === rv(top.rank) - 1;
}

function applyFreeCellMove(state: SerializedFreeCellState, move: Move): SerializedFreeCellState | null {
  const s = deepClone(state);

  if (move.type === 'tableau-to-foundation') {
    const fi = parseInt(move.from.split('-')[1]);
    const card = s.tableau[fi].pop()!;
    const ti = parseInt(move.to.split('-')[1]);
    s.foundation[ti].push(card);
    s.moves++;
    return s;
  }

  if (move.type === 'freecell-to-foundation') {
    const fi = parseInt(move.from.split('-')[1]);
    const card = s.freeCells[fi]!;
    s.freeCells[fi] = null;
    const ti = parseInt(move.to.split('-')[1]);
    s.foundation[ti].push(card);
    s.moves++;
    return s;
  }

  if (move.type === 'tableau-to-tableau') {
    const fi = parseInt(move.from.split('-')[1]);
    const ti = parseInt(move.to.split('-')[1]);
    const card = s.tableau[fi].pop()!;
    s.tableau[ti].push(card);
    s.moves++;
    return s;
  }

  if (move.type === 'freecell-to-tableau') {
    const fi = parseInt(move.from.split('-')[1]);
    const card = s.freeCells[fi]!;
    s.freeCells[fi] = null;
    const ti = parseInt(move.to.split('-')[1]);
    s.tableau[ti].push(card);
    s.moves++;
    return s;
  }

  if (move.type === 'tableau-to-freecell') {
    const fi = parseInt(move.from.split('-')[1]);
    const card = s.tableau[fi].pop()!;
    const emptyIdx = s.freeCells.findIndex(c => c === null);
    if (emptyIdx === -1) return null;
    s.freeCells[emptyIdx] = card;
    s.moves++;
    return s;
  }

  return null;
}

// --- Heuristic position scorer (replaces binary win/loss) ---
// Inlined here because workers can't import from src/ modules
function scorePosition(state: SerializedGameState): number {
  const foundationCards = state.foundation.reduce(
    (sum, pile) => sum + pile.length, 0
  );

  // Primary signal: foundation progress (0-52 cards)
  let score = foundationCards * 10;

  // Empty columns (highly valuable)
  const emptyCols = state.tableau.filter(c => c.length === 0).length;
  score += emptyCols * 150;

  // Face-up cards in tableau (more = better)
  const faceUpCards = state.tableau.flat().filter(c => c.faceUp).length;
  score += faceUpCards * 15;

  // For Klondike: waste pile penalty (buried cards)
  if (state.gameMode === 'klondike') {
    const kState = state as SerializedKlondikeState;
    score -= kState.waste.length * 2;
  }

  // For FreeCell: freecell usage penalty
  if (state.gameMode === 'freecell') {
    const fcState = state as SerializedFreeCellState;
    const usedFreeCells = fcState.freeCells.filter(c => c !== null).length;
    score -= usedFreeCells * 20;
  }

  // Normalise to 0-1 range (max theoretical score ~1000)
  return Math.min(1, Math.max(0, score / 800));
}

// --- Shallow lookahead (replaces runRandomPlayout) ---
function runLookahead(state: SerializedGameState, depth: number): SerializedGameState {
  let current = deepClone(state);

  for (let i = 0; i < depth; i++) {
    const moves = current.gameMode === 'klondike'
      ? getKlondikeLegalMoves(current as SerializedKlondikeState)
      : getFreeCellLegalMoves(current as SerializedFreeCellState);

    if (moves.length === 0) break;

    // Weighted random: foundation moves 3x, tableau-to-tableau 2x, others 1x
    const weighted = moves.map(m => ({
      move: m,
      weight: m.type.includes('foundation') && !m.type.startsWith('foundation') ? 3 :
              m.type === 'tableau-to-tableau' ? 2 : 1,
    }));

    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let rand = Math.random() * totalWeight;
    let selected = weighted[weighted.length - 1].move;
    for (const w of weighted) {
      rand -= w.weight;
      if (rand <= 0) { selected = w.move; break; }
    }

    const next = current.gameMode === 'klondike'
      ? applyKlondikeMove(current as SerializedKlondikeState, selected)
      : applyFreeCellMove(current as SerializedFreeCellState, selected);

    if (!next) break;
    current = next as SerializedGameState;
  }

  return current;
}

// --- Heuristic evaluation with lookahead simulations ---
function evaluatePosition(
  state: SerializedGameState,
  simCount: number,
  abortFlag: { cancelled: boolean }
): number {
  return evaluatePositionDeep(state, simCount, 15, abortFlag);
}

function evaluatePositionDeep(
  state: SerializedGameState,
  simCount: number,
  depth: number,
  abortFlag: { cancelled: boolean }
): number {
  let totalScore = 0;
  let completed = 0;

  for (let i = 0; i < simCount; i++) {
    if (abortFlag.cancelled) break;

    const lookaheadState = runLookahead(state, depth);
    totalScore += scorePosition(lookaheadState);
    completed++;
  }

  return completed > 0 ? totalScore / completed : scorePosition(state);
}

function normaliseImprovementScore(futureScore: number, baselineScore: number): number {
  if (futureScore <= baselineScore) return 0;

  const remainingHeadroom = Math.max(0.001, 1 - baselineScore);
  return Math.min(1, (futureScore - baselineScore) / remainingHeadroom);
}

// --- Abort mechanism ---
let currentAbortFlag: { cancelled: boolean } | null = null;

// --- Performance tier ---
let performanceTier: 'full' | 'reduced' = 'full';

function calibratePerformance(state: SerializedGameState): void {
  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    runLookahead(state, 15);
  }
  const elapsed = performance.now() - start;
  performanceTier = elapsed > 300 ? 'reduced' : 'full';
  console.log(`[MCTS Worker] Performance tier: ${performanceTier} (10 lookaheads in ${Math.round(elapsed)}ms)`);
}

let calibrated = false;

// --- Message handler ---
self.onmessage = (e: MessageEvent) => {
  const request = e.data;

  // Handle ABORT message
  if (request.type === 'ABORT') {
    if (currentAbortFlag) {
      currentAbortFlag.cancelled = true;
    }
    return;
  }

  if (!calibrated && request.gameState) {
    calibratePerformance(request.gameState);
    calibrated = true;
  }

  const simMultiplier = performanceTier === 'reduced' ? 0.5 : 1;

  if (request.type === 'HINT') {
    // Abort any in-flight simulation
    if (currentAbortFlag) {
      currentAbortFlag.cancelled = true;
    }
    const abortFlag = { cancelled: false };
    currentAbortFlag = abortFlag;

    const state = request.gameState as SerializedGameState;
    const simCount = Math.round((request.simulations || 300) * simMultiplier);

    const moves = state.gameMode === 'klondike'
      ? getKlondikeLegalMoves(state as SerializedKlondikeState)
      : getFreeCellLegalMoves(state as SerializedFreeCellState);

    if (moves.length === 0) {
      currentAbortFlag = null;
      self.postMessage({ type: 'HINT_RESULT', bestMove: null, winRate: 0, baselineWinRate: 0, candidateCount: 0 });
      return;
    }

    // Evaluate baseline position
    const baselineScore = scorePosition(state);

    // Phase 1: initial evaluation with depth 15, budget split across moves
    let bestMove = moves[0];
    let bestFutureScore = -1;
    const phase1Sims = Math.max(3, Math.round((simCount * 0.6) / moves.length));
    const startTime = performance.now();

    for (const move of moves) {
      if (abortFlag.cancelled) break;

      const next = state.gameMode === 'klondike'
        ? applyKlondikeMove(state as SerializedKlondikeState, move)
        : applyFreeCellMove(state as SerializedFreeCellState, move);

      if (!next) continue;

      const score = evaluatePosition(next as SerializedGameState, phase1Sims, abortFlag);
      if (score > bestFutureScore) {
        bestFutureScore = score;
        bestMove = move;
      }
    }

    // Phase 2: if best score < 0.1 after ~1500ms, re-evaluate top candidates with depth 25
    const elapsed = performance.now() - startTime;
    const phase1NormalisedScore = normaliseImprovementScore(bestFutureScore, baselineScore);
    if (!abortFlag.cancelled && phase1NormalisedScore < 0.1 && elapsed < 2200) {
      // Gather top candidates (score within 0.05 of best)
      const candidates: { move: Move; score: number }[] = [];
      for (const move of moves) {
        if (abortFlag.cancelled) break;
        const next = state.gameMode === 'klondike'
          ? applyKlondikeMove(state as SerializedKlondikeState, move)
          : applyFreeCellMove(state as SerializedFreeCellState, move);
        if (!next) continue;
        // Quick re-score at depth 25 with remaining budget
        const deepSims = Math.max(2, Math.round((simCount * 0.4) / Math.min(moves.length, 5)));
        const s = evaluatePositionDeep(next as SerializedGameState, deepSims, 25, abortFlag);
        candidates.push({ move, score: s });
        if (s > bestFutureScore) {
          bestFutureScore = s;
          bestMove = move;
        }
      }
    }

    const bestScore = normaliseImprovementScore(bestFutureScore, baselineScore);

    currentAbortFlag = null;

    if (!abortFlag.cancelled) {
      self.postMessage({
        type: 'HINT_RESULT',
        bestMove,
        winRate: bestScore,
        baselineWinRate: baselineScore,
        candidateCount: moves.length,
      });
    }
  }

  if (request.type === 'WIN_PROBABILITY') {
    // Abort any in-flight simulation
    if (currentAbortFlag) {
      currentAbortFlag.cancelled = true;
    }
    const abortFlag = { cancelled: false };
    currentAbortFlag = abortFlag;

    const state = request.gameState as SerializedGameState;
    const simCount = Math.round((request.simulations || 30) * simMultiplier);
    const score = evaluatePosition(state, simCount, abortFlag);

    currentAbortFlag = null;

    if (!abortFlag.cancelled) {
      self.postMessage({
        type: 'WIN_PROBABILITY_RESULT',
        winProbability: score,
        simulationsRun: simCount,
      });
    }
  }
};
