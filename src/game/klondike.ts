import { Card, KlondikeState, DrawMode, Difficulty, rankValue, isRed, suitSymbol } from './types';
import { createDeck, shuffleDeck, generateDealId, generateSeed } from './deck';

export function createKlondikeGame(drawMode: DrawMode = 1, seed?: number): KlondikeState {
  const actualSeed = seed ?? generateSeed();
  const deck = shuffleDeck(createDeck(), actualSeed);
  const tableau: Card[][] = [];
  let cardIndex = 0;

  // Deal 7 columns: column i gets i+1 cards, last card face up
  for (let i = 0; i < 7; i++) {
    const col: Card[] = [];
    for (let j = 0; j <= i; j++) {
      const card = { ...deck[cardIndex++] };
      card.faceUp = j === i;
      col.push(card);
    }
    tableau.push(col);
  }

  const stock = deck.slice(cardIndex).map(c => ({ ...c, faceUp: false }));
  const diffScore = calculateDifficultyScore(tableau, stock);

  return {
    tableau,
    foundation: [[], [], [], []],
    stock,
    waste: [],
    drawMode,
    moves: 0,
    startTime: Date.now(),
    hintsUsed: 0,
    undosUsed: 0,
    isWon: false,
    dealId: generateDealId(actualSeed),
    difficulty: difficultyLabel(diffScore),
    difficultyScore: diffScore,
    seed: actualSeed,
  };
}

function calculateDifficultyScore(tableau: Card[][], stock: Card[]): number {
  let score = 50; // base

  // Count face-down cards
  const faceDown = tableau.reduce((acc, col) => acc + col.filter(c => !c.faceUp).length, 0);
  score += faceDown * 2;

  // Check for immediately playable aces
  const topCards = tableau.map(col => col[col.length - 1]).filter(Boolean);
  const aces = topCards.filter(c => c.rank === 'A');
  score -= aces.length * 8;

  // Check for kings in first position (good) vs buried (bad)
  tableau.forEach(col => {
    if (col.length > 0 && col[0].rank === 'K' && col[0].faceUp) score -= 5;
    col.forEach((c, i) => {
      if (c.rank === 'K' && !c.faceUp && i > 0) score += 3;
    });
  });

  // Stock size adds difficulty
  score += Math.floor(stock.length / 5);

  return Math.max(10, Math.min(100, score));
}

function difficultyLabel(score: number): Difficulty {
  if (score < 35) return 'Easy';
  if (score < 55) return 'Medium';
  if (score < 75) return 'Hard';
  return 'Expert';
}

export function canMoveToFoundation(card: Card, foundation: Card[][]): number {
  for (let i = 0; i < 4; i++) {
    const pile = foundation[i];
    if (pile.length === 0 && card.rank === 'A') {
      // Find empty pile matching suit order or first empty
      if (foundation.every((p, j) => j === i || p.length === 0 || p[0].suit !== card.suit)) {
        return i;
      }
    }
    if (pile.length > 0) {
      const top = pile[pile.length - 1];
      if (top.suit === card.suit && rankValue(card.rank) === rankValue(top.rank) + 1) {
        return i;
      }
    }
  }
  return -1;
}

export function canMoveToTableau(card: Card, targetCol: Card[]): boolean {
  if (targetCol.length === 0) return card.rank === 'K';
  const top = targetCol[targetCol.length - 1];
  if (!top.faceUp) return false;
  return isRed(card.suit) !== isRed(top.suit) && rankValue(card.rank) === rankValue(top.rank) - 1;
}

export function drawFromStock(state: KlondikeState): KlondikeState {
  const newState = cloneState(state);
  if (newState.stock.length === 0) {
    // Reset: waste back to stock
    newState.stock = newState.waste.reverse().map(c => ({ ...c, faceUp: false }));
    newState.waste = [];
  } else {
    const count = Math.min(newState.drawMode, newState.stock.length);
    for (let i = 0; i < count; i++) {
      const card = newState.stock.pop()!;
      card.faceUp = true;
      newState.waste.push(card);
    }
  }
  newState.moves++;
  return newState;
}

export function moveWasteToTableau(state: KlondikeState, colIndex: number): KlondikeState | null {
  if (state.waste.length === 0) return null;
  const card = state.waste[state.waste.length - 1];
  if (!canMoveToTableau(card, state.tableau[colIndex])) return null;

  const newState = cloneState(state);
  const movedCard = newState.waste.pop()!;
  newState.tableau[colIndex].push(movedCard);
  newState.moves++;
  return newState;
}

export function moveWasteToFoundation(state: KlondikeState): KlondikeState | null {
  if (state.waste.length === 0) return null;
  const card = state.waste[state.waste.length - 1];
  const targetIdx = canMoveToFoundation(card, state.foundation);
  if (targetIdx === -1) return null;

  const newState = cloneState(state);
  const movedCard = newState.waste.pop()!;
  newState.foundation[targetIdx].push(movedCard);
  newState.moves++;
  return checkWin(newState);
}

export function moveTableauToFoundation(state: KlondikeState, colIndex: number): KlondikeState | null {
  const col = state.tableau[colIndex];
  if (col.length === 0) return null;
  const card = col[col.length - 1];
  if (!card.faceUp) return null;
  const targetIdx = canMoveToFoundation(card, state.foundation);
  if (targetIdx === -1) return null;

  const newState = cloneState(state);
  const movedCard = newState.tableau[colIndex].pop()!;
  newState.foundation[targetIdx].push(movedCard);
  flipTopCard(newState.tableau[colIndex]);
  newState.moves++;
  return checkWin(newState);
}

export function moveTableauToTableau(
  state: KlondikeState,
  fromCol: number,
  cardIndex: number,
  toCol: number
): KlondikeState | null {
  const from = state.tableau[fromCol];
  if (cardIndex < 0 || cardIndex >= from.length) return null;
  const card = from[cardIndex];
  if (!card.faceUp) return null;
  if (!canMoveToTableau(card, state.tableau[toCol])) return null;

  const newState = cloneState(state);
  const cards = newState.tableau[fromCol].splice(cardIndex);
  newState.tableau[toCol].push(...cards);
  flipTopCard(newState.tableau[fromCol]);
  newState.moves++;
  return newState;
}

export function moveFoundationToTableau(state: KlondikeState, foundIdx: number, colIndex: number): KlondikeState | null {
  const pile = state.foundation[foundIdx];
  if (pile.length === 0) return null;
  const card = pile[pile.length - 1];
  if (!canMoveToTableau(card, state.tableau[colIndex])) return null;

  const newState = cloneState(state);
  const movedCard = newState.foundation[foundIdx].pop()!;
  newState.tableau[colIndex].push(movedCard);
  newState.moves++;
  return newState;
}

function flipTopCard(col: Card[]) {
  if (col.length > 0 && !col[col.length - 1].faceUp) {
    col[col.length - 1].faceUp = true;
  }
}

function checkWin(state: KlondikeState): KlondikeState {
  const total = state.foundation.reduce((sum, pile) => sum + pile.length, 0);
  if (total === 52) state.isWon = true;
  return state;
}

export function isAutoCompletable(state: KlondikeState): boolean {
  // All cards face up and stock/waste empty
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  return state.tableau.every(col => col.every(c => c.faceUp));
}

export function autoCompleteStep(state: KlondikeState): KlondikeState | null {
  const newState = cloneState(state);
  for (let i = 0; i < 7; i++) {
    const col = newState.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    const targetIdx = canMoveToFoundation(card, newState.foundation);
    if (targetIdx !== -1) {
      newState.tableau[i].pop();
      newState.foundation[targetIdx].push(card);
      return checkWin(newState);
    }
  }
  // Also try waste
  if (newState.waste.length > 0) {
    const card = newState.waste[newState.waste.length - 1];
    const targetIdx = canMoveToFoundation(card, newState.foundation);
    if (targetIdx !== -1) {
      newState.waste.pop();
      newState.foundation[targetIdx].push(card);
      return checkWin(newState);
    }
  }
  return null;
}

export function getHint(state: KlondikeState): { from: string; to: string; description: string } | null {
  // Check waste to foundation
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const fIdx = canMoveToFoundation(card, state.foundation);
    if (fIdx !== -1) return { from: 'waste', to: `foundation-${fIdx}`, description: `Move ${card.rank}${card.suit} to foundation` };
  }

  // Check tableau to foundation
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    const fIdx = canMoveToFoundation(card, state.foundation);
    if (fIdx !== -1) return { from: `tableau-${i}`, to: `foundation-${fIdx}`, description: `Move ${card.rank}${card.suit} to foundation` };
  }

  // Check tableau to tableau
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    for (let j = 0; j < col.length; j++) {
      if (!col[j].faceUp) continue;
      for (let k = 0; k < 7; k++) {
        if (k === i) continue;
        if (canMoveToTableau(col[j], state.tableau[k])) {
          // Don't suggest moving king from empty space to empty space
          if (col[j].rank === 'K' && j === 0 && state.tableau[k].length === 0) continue;
          return { from: `tableau-${i}`, to: `tableau-${k}`, description: `Move ${col[j].rank}${col[j].suit} to column ${k + 1}` };
        }
      }
    }
  }

  // Check waste to tableau
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    for (let k = 0; k < 7; k++) {
      if (canMoveToTableau(card, state.tableau[k])) {
        return { from: 'waste', to: `tableau-${k}`, description: `Move ${card.rank}${card.suit} to column ${k + 1}` };
      }
    }
  }

  // Suggest draw
  if (state.stock.length > 0) {
    return { from: 'stock', to: 'waste', description: 'Draw from stock' };
  }

  return null;
}

function cloneState(state: KlondikeState): KlondikeState {
  return {
    ...state,
    tableau: state.tableau.map(col => col.map(c => ({ ...c }))),
    foundation: state.foundation.map(pile => pile.map(c => ({ ...c }))),
    stock: state.stock.map(c => ({ ...c })),
    waste: state.waste.map(c => ({ ...c })),
  };
}

export function getProgressiveHint(
  state: KlondikeState,
  recentStates: KlondikeState[] = []
): { from: string; to: string; description: string } | { noHint: true; message: string } {
  // Build set of recent card positions for regression check
  const recentPositions = new Set<string>();
  for (const s of recentStates.slice(-10)) {
    s.tableau.forEach((col, i) => col.forEach(c => recentPositions.add(`${c.id}@tableau-${i}`)));
    s.waste.forEach(c => recentPositions.add(`${c.id}@waste`));
    s.foundation.forEach((pile, i) => pile.forEach(c => recentPositions.add(`${c.id}@foundation-${i}`)));
  }

  interface Candidate {
    from: string; to: string; description: string;
    priority: number; cardId: string;
  }
  const candidates: Candidate[] = [];

  // Priority 1: Foundation
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const fIdx = canMoveToFoundation(card, state.foundation);
    if (fIdx !== -1) candidates.push({ from: 'waste', to: `foundation-${fIdx}`, description: `Move ${card.rank}${suitSymbol(card.suit)} to foundation`, priority: 1, cardId: card.id });
  }
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    const fIdx = canMoveToFoundation(card, state.foundation);
    if (fIdx !== -1) candidates.push({ from: `tableau-${i}`, to: `foundation-${fIdx}`, description: `Move ${card.rank}${suitSymbol(card.suit)} to foundation`, priority: 1, cardId: card.id });
  }

  // Priority 2-4: Tableau moves
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    for (let j = 0; j < col.length; j++) {
      if (!col[j].faceUp) continue;
      const exposesDown = j > 0 && !col[j - 1].faceUp;
      for (let k = 0; k < 7; k++) {
        if (k === i) continue;
        if (canMoveToTableau(col[j], state.tableau[k])) {
          if (col[j].rank === 'K' && j === 0 && state.tableau[k].length === 0) continue;
          let priority = 4;
          if (exposesDown) priority = 2;
          else if (state.tableau[k].length > 0) priority = 3;
          candidates.push({ from: `tableau-${i}`, to: `tableau-${k}`, description: `Move ${col[j].rank}${suitSymbol(col[j].suit)} to column ${k + 1}`, priority, cardId: col[j].id });
        }
      }
    }
  }

  // Waste to tableau
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    for (let k = 0; k < 7; k++) {
      if (canMoveToTableau(card, state.tableau[k])) {
        candidates.push({ from: 'waste', to: `tableau-${k}`, description: `Move ${card.rank}${suitSymbol(card.suit)} to column ${k + 1}`, priority: 3, cardId: card.id });
      }
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);

  for (const c of candidates) {
    if (c.priority === 1) return c; // Foundation moves always good
    if (!recentPositions.has(`${c.cardId}@${c.to}`)) return c;
  }

  if (state.stock.length > 0) {
    return { from: 'stock', to: 'waste', description: 'Draw from stock' };
  }

  return { noHint: true, message: 'No helpful moves found — consider undoing' };
}
