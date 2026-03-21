/**
 * MCTS Web Worker — runs Monte Carlo Tree Search simulations off the main thread.
 * Handles hint evaluation, win probability estimation, and move quality analysis.
 */

// Minimal card/state types duplicated here to avoid import issues in worker context
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

// --- Klondike legal moves ---
function getKlondikeLegalMoves(state: SerializedKlondikeState): Move[] {
  const moves: Move[] = [];
  const { tableau, foundation, waste, stock } = state;

  // Tableau to foundation
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

  // Waste to foundation
  if (waste.length > 0) {
    const card = waste[waste.length - 1];
    const fi = canMoveToFoundationK(card, foundation);
    if (fi !== -1) {
      moves.push({ type: 'waste-to-foundation', from: 'waste', to: `foundation-${fi}`, description: `${card.rank}${suitSym(card.suit)} → Foundation` });
    }
  }

  // Tableau to tableau
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

  // Waste to tableau
  if (waste.length > 0) {
    const card = waste[waste.length - 1];
    for (let k = 0; k < 7; k++) {
      if (canMoveToTableauK(card, tableau[k])) {
        moves.push({ type: 'waste-to-tableau', from: 'waste', to: `tableau-${k}`, description: `${card.rank}${suitSym(card.suit)} → Column ${k + 1}` });
      }
    }
  }

  // Draw from stock
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
    // Flip top card
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

  // Tableau to foundation
  for (let i = 0; i < 8; i++) {
    const col = tableau[i];
    if (!col.length) continue;
    const card = col[col.length - 1];
    const fi = canMoveToFoundationFC(card, foundation);
    if (fi !== -1) {
      moves.push({ type: 'tableau-to-foundation', from: `tableau-${i}`, to: `foundation-${fi}`, description: `${card.rank}${suitSym(card.suit)} → Foundation` });
    }
  }

  // Free cell to foundation
  for (let i = 0; i < 4; i++) {
    const card = freeCells[i];
    if (!card) continue;
    const fi = canMoveToFoundationFC(card, foundation);
    if (fi !== -1) {
      moves.push({ type: 'freecell-to-foundation', from: `freecell-${i}`, to: `foundation-${fi}`, description: `${card.rank}${suitSym(card.suit)} → Foundation` });
    }
  }

  // Tableau to tableau (single card only for simulation speed)
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

  // Free cell to tableau
  for (let i = 0; i < 4; i++) {
    const card = freeCells[i];
    if (!card) continue;
    for (let k = 0; k < 8; k++) {
      if (canMoveToTableauFC(card, tableau[k])) {
        moves.push({ type: 'freecell-to-tableau', from: `freecell-${i}`, to: `tableau-${k}`, description: `${card.rank}${suitSym(card.suit)} → Column ${k + 1}` });
      }
    }
  }

  // Tableau to free cell
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

function suitSym(suit: string): string {
  const m: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  return m[suit] || '';
}

// --- Simulation ---
function isWon(state: SerializedGameState): boolean {
  return state.foundation.reduce((s, p) => s + p.length, 0) === 52;
}

function foundationScore(state: SerializedGameState): number {
  return state.foundation.reduce((s, p) => s + p.length, 0);
}

function runRandomPlayout(state: SerializedGameState): boolean {
  let s = deepClone(state);
  const MAX_MOVES = 500;

  for (let i = 0; i < MAX_MOVES; i++) {
    if (isWon(s)) return true;

    const moves = s.gameMode === 'klondike'
      ? getKlondikeLegalMoves(s as SerializedKlondikeState)
      : getFreeCellLegalMoves(s as SerializedFreeCellState);

    if (moves.length === 0) return false;

    // Prioritize foundation moves
    const foundationMoves = moves.filter(m => m.type.includes('foundation') && !m.type.startsWith('foundation'));
    const move = foundationMoves.length > 0
      ? foundationMoves[Math.floor(Math.random() * foundationMoves.length)]
      : moves[Math.floor(Math.random() * moves.length)];

    const next = s.gameMode === 'klondike'
      ? applyKlondikeMove(s as SerializedKlondikeState, move)
      : applyFreeCellMove(s as SerializedFreeCellState, move);

    if (!next) return false;
    s = next as SerializedGameState;
  }

  return isWon(s);
}

function evaluatePosition(state: SerializedGameState, simulations: number): number {
  let wins = 0;
  for (let i = 0; i < simulations; i++) {
    if (runRandomPlayout(state)) wins++;
  }
  return wins / simulations;
}

// --- Performance tier ---
let performanceTier: 'full' | 'reduced' = 'full';

function calibratePerformance(state: SerializedGameState): void {
  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    runRandomPlayout(state);
  }
  const elapsed = performance.now() - start;
  performanceTier = elapsed > 300 ? 'reduced' : 'full';
  console.log(`[MCTS Worker] Performance tier: ${performanceTier} (10 sims in ${Math.round(elapsed)}ms)`);
}

let calibrated = false;

// --- Message handler ---
self.onmessage = (e: MessageEvent) => {
  const request = e.data;

  if (!calibrated && request.gameState) {
    calibratePerformance(request.gameState);
    calibrated = true;
  }

  const simMultiplier = performanceTier === 'reduced' ? 0.5 : 1;

  if (request.type === 'HINT') {
    const state = request.gameState as SerializedGameState;
    const simCount = Math.round((request.simulations || 50) * simMultiplier);

    const moves = state.gameMode === 'klondike'
      ? getKlondikeLegalMoves(state as SerializedKlondikeState)
      : getFreeCellLegalMoves(state as SerializedFreeCellState);

    if (moves.length === 0) {
      self.postMessage({ type: 'HINT_RESULT', bestMove: null, winRate: 0, candidateCount: 0 });
      return;
    }

    // Evaluate baseline
    const baselineWinRate = evaluatePosition(state, Math.max(5, Math.round(simCount / 4)));

    // Evaluate each candidate move
    let bestMove = moves[0];
    let bestWinRate = -1;
    const perMoveSims = Math.max(3, Math.round(simCount / moves.length));

    for (const move of moves) {
      const next = state.gameMode === 'klondike'
        ? applyKlondikeMove(state as SerializedKlondikeState, move)
        : applyFreeCellMove(state as SerializedFreeCellState, move);

      if (!next) continue;

      const winRate = evaluatePosition(next as SerializedGameState, perMoveSims);
      if (winRate > bestWinRate) {
        bestWinRate = winRate;
        bestMove = move;
      }
    }

    self.postMessage({
      type: 'HINT_RESULT',
      bestMove,
      winRate: bestWinRate,
      baselineWinRate,
      candidateCount: moves.length,
    });
  }

  if (request.type === 'WIN_PROBABILITY') {
    const state = request.gameState as SerializedGameState;
    const simCount = Math.round((request.simulations || 30) * simMultiplier);
    const winProbability = evaluatePosition(state, simCount);

    self.postMessage({
      type: 'WIN_PROBABILITY_RESULT',
      winProbability,
      simulationsRun: simCount,
    });
  }
};
