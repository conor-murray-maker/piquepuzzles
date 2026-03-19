import { Card, FreeCellState, Difficulty, rankValue, isRed } from './types';
import { createDeck, shuffleDeck, generateDealId } from './deck';

export function createFreeCellGame(seed?: number): FreeCellState {
  const deck = shuffleDeck(createDeck(), seed);
  const tableau: Card[][] = [[], [], [], [], [], [], [], []];

  // Deal all 52 cards face-up: first 4 columns get 7, last 4 get 6
  deck.forEach((card, i) => {
    const col = i % 8;
    tableau[col].push({ ...card, faceUp: true });
  });

  const diffScore = calculateFreeCellDifficulty(tableau);

  return {
    tableau,
    foundation: [[], [], [], []],
    freeCells: [null, null, null, null],
    moves: 0,
    startTime: Date.now(),
    hintsUsed: 0,
    undosUsed: 0,
    isWon: false,
    dealId: generateDealId(seed),
    difficulty: difficultyLabel(diffScore),
    difficultyScore: diffScore,
  };
}

function calculateFreeCellDifficulty(tableau: Card[][]): number {
  let score = 50;
  // Buried aces increase difficulty
  tableau.forEach(col => {
    col.forEach((c, i) => {
      if (c.rank === 'A' && i < col.length - 1) score += (col.length - 1 - i) * 3;
    });
  });
  // Out-of-sequence cards
  tableau.forEach(col => {
    for (let i = 1; i < col.length; i++) {
      const prev = col[i - 1];
      const curr = col[i];
      if (!(isRed(prev.suit) !== isRed(curr.suit) && rankValue(prev.rank) === rankValue(curr.rank) + 1)) {
        score += 2;
      }
    }
  });
  return Math.max(10, Math.min(100, score));
}

function difficultyLabel(score: number): Difficulty {
  if (score < 35) return 'Easy';
  if (score < 55) return 'Medium';
  if (score < 75) return 'Hard';
  return 'Expert';
}

// How many cards can be moved as a stack given free cells and empty columns
export function maxMovableCards(state: FreeCellState, excludeCol?: number): number {
  const emptyCells = state.freeCells.filter(c => c === null).length;
  const emptyCols = state.tableau.filter((col, i) => col.length === 0 && i !== excludeCol).length;
  return (1 + emptyCells) * Math.pow(2, emptyCols);
}

// Get the longest valid sequence from the bottom of a column (descending, alternating color)
export function getValidSequenceLength(col: Card[]): number {
  if (col.length === 0) return 0;
  let len = 1;
  for (let i = col.length - 2; i >= 0; i--) {
    const below = col[i];
    const above = col[i + 1];
    if (isRed(below.suit) !== isRed(above.suit) && rankValue(below.rank) === rankValue(above.rank) + 1) {
      len++;
    } else break;
  }
  return len;
}

export function canMoveToFoundation(card: Card, foundation: Card[][]): number {
  for (let i = 0; i < 4; i++) {
    const pile = foundation[i];
    if (pile.length === 0 && card.rank === 'A') {
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
  if (targetCol.length === 0) return true; // Any card can go on empty column
  const top = targetCol[targetCol.length - 1];
  return isRed(card.suit) !== isRed(top.suit) && rankValue(card.rank) === rankValue(top.rank) - 1;
}

function cloneState(state: FreeCellState): FreeCellState {
  return {
    ...state,
    tableau: state.tableau.map(col => col.map(c => ({ ...c }))),
    foundation: state.foundation.map(pile => pile.map(c => ({ ...c }))),
    freeCells: state.freeCells.map(c => c ? { ...c } : null),
  };
}

function checkWin(state: FreeCellState): FreeCellState {
  const total = state.foundation.reduce((sum, pile) => sum + pile.length, 0);
  if (total === 52) state.isWon = true;
  return state;
}

// Move top card of tableau column to a free cell
export function moveToFreeCell(state: FreeCellState, colIdx: number): FreeCellState | null {
  const col = state.tableau[colIdx];
  if (col.length === 0) return null;
  const cellIdx = state.freeCells.findIndex(c => c === null);
  if (cellIdx === -1) return null;

  const ns = cloneState(state);
  ns.freeCells[cellIdx] = ns.tableau[colIdx].pop()!;
  ns.moves++;
  return ns;
}

// Move a free cell card to tableau
export function moveFreeCellToTableau(state: FreeCellState, cellIdx: number, colIdx: number): FreeCellState | null {
  const card = state.freeCells[cellIdx];
  if (!card) return null;
  if (!canMoveToTableau(card, state.tableau[colIdx])) return null;

  const ns = cloneState(state);
  ns.tableau[colIdx].push(ns.freeCells[cellIdx]!);
  ns.freeCells[cellIdx] = null;
  ns.moves++;
  return ns;
}

// Move free cell card to foundation
export function moveFreeCellToFoundation(state: FreeCellState, cellIdx: number): FreeCellState | null {
  const card = state.freeCells[cellIdx];
  if (!card) return null;
  const fIdx = canMoveToFoundation(card, state.foundation);
  if (fIdx === -1) return null;

  const ns = cloneState(state);
  ns.foundation[fIdx].push(ns.freeCells[cellIdx]!);
  ns.freeCells[cellIdx] = null;
  ns.moves++;
  return checkWin(ns);
}

// Move tableau top card to foundation
export function moveTableauToFoundation(state: FreeCellState, colIdx: number): FreeCellState | null {
  const col = state.tableau[colIdx];
  if (col.length === 0) return null;
  const card = col[col.length - 1];
  const fIdx = canMoveToFoundation(card, state.foundation);
  if (fIdx === -1) return null;

  const ns = cloneState(state);
  ns.foundation[fIdx].push(ns.tableau[colIdx].pop()!);
  ns.moves++;
  return checkWin(ns);
}

// Move stack between tableau columns
export function moveTableauToTableau(
  state: FreeCellState,
  fromCol: number,
  cardIndex: number,
  toCol: number
): FreeCellState | null {
  const from = state.tableau[fromCol];
  if (cardIndex < 0 || cardIndex >= from.length) return null;
  const card = from[cardIndex];
  if (!canMoveToTableau(card, state.tableau[toCol])) return null;

  const numCards = from.length - cardIndex;
  // Check sequence validity
  for (let i = cardIndex; i < from.length - 1; i++) {
    const a = from[i];
    const b = from[i + 1];
    if (!(isRed(a.suit) !== isRed(b.suit) && rankValue(a.rank) === rankValue(b.rank) + 1)) {
      return null; // Not a valid sequence
    }
  }

  const maxMove = maxMovableCards(state, toCol);
  if (numCards > maxMove) return null;

  const ns = cloneState(state);
  const cards = ns.tableau[fromCol].splice(cardIndex);
  ns.tableau[toCol].push(...cards);
  ns.moves++;
  return ns;
}

// Move foundation card back to tableau
export function moveFoundationToTableau(state: FreeCellState, fIdx: number, colIdx: number): FreeCellState | null {
  const pile = state.foundation[fIdx];
  if (pile.length === 0) return null;
  const card = pile[pile.length - 1];
  if (!canMoveToTableau(card, state.tableau[colIdx])) return null;

  const ns = cloneState(state);
  ns.tableau[colIdx].push(ns.foundation[fIdx].pop()!);
  ns.moves++;
  return ns;
}

export function isAutoCompletable(state: FreeCellState): boolean {
  // All tableau cards in proper descending/alternating order and no cards in free cells
  if (state.freeCells.some(c => c !== null)) return false;
  return state.tableau.every(col => {
    for (let i = 1; i < col.length; i++) {
      const a = col[i - 1];
      const b = col[i];
      if (!(isRed(a.suit) !== isRed(b.suit) && rankValue(a.rank) === rankValue(b.rank) + 1)) {
        return false;
      }
    }
    return true;
  });
}

export function autoCompleteStep(state: FreeCellState): FreeCellState | null {
  const ns = cloneState(state);
  // Try tableau to foundation
  for (let i = 0; i < 8; i++) {
    const col = ns.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    const fIdx = canMoveToFoundation(card, ns.foundation);
    if (fIdx !== -1) {
      ns.tableau[i].pop();
      ns.foundation[fIdx].push(card);
      return checkWin(ns);
    }
  }
  // Try free cells to foundation
  for (let i = 0; i < 4; i++) {
    const card = ns.freeCells[i];
    if (!card) continue;
    const fIdx = canMoveToFoundation(card, ns.foundation);
    if (fIdx !== -1) {
      ns.foundation[fIdx].push(card);
      ns.freeCells[i] = null;
      return checkWin(ns);
    }
  }
  return null;
}

export function getHint(state: FreeCellState): { from: string; to: string; description: string } | null {
  // Free cell / tableau to foundation
  for (let i = 0; i < 4; i++) {
    const card = state.freeCells[i];
    if (!card) continue;
    const fIdx = canMoveToFoundation(card, state.foundation);
    if (fIdx !== -1) return { from: `freecell-${i}`, to: `foundation-${fIdx}`, description: `Move ${card.rank}${card.suit} to foundation` };
  }
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    const fIdx = canMoveToFoundation(card, state.foundation);
    if (fIdx !== -1) return { from: `tableau-${i}`, to: `foundation-${fIdx}`, description: `Move ${card.rank}${card.suit} to foundation` };
  }
  // Tableau to tableau
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    for (let j = col.length - 1; j >= 0; j--) {
      // Check if j..end is a valid sequence
      let valid = true;
      for (let k = j; k < col.length - 1; k++) {
        if (!(isRed(col[k].suit) !== isRed(col[k+1].suit) && rankValue(col[k].rank) === rankValue(col[k+1].rank) + 1)) {
          valid = false; break;
        }
      }
      if (!valid) break;
      const numCards = col.length - j;
      for (let t = 0; t < 8; t++) {
        if (t === i) continue;
        if (canMoveToTableau(col[j], state.tableau[t]) && numCards <= maxMovableCards(state, t)) {
          if (state.tableau[t].length === 0 && j === 0) continue; // Don't suggest moving whole col to empty
          return { from: `tableau-${i}`, to: `tableau-${t}`, description: `Move ${col[j].rank}${col[j].suit} to column ${t + 1}` };
        }
      }
    }
  }
  // Suggest free cell
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const emptyCell = state.freeCells.findIndex(c => c === null);
    if (emptyCell !== -1) {
      return { from: `tableau-${i}`, to: `freecell-${emptyCell}`, description: `Move ${col[col.length-1].rank} to free cell` };
    }
  }
  return null;
}
