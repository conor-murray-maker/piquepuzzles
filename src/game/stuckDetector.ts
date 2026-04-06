import { KlondikeState, FreeCellState, Card } from './types';
import { canMoveToFoundation, canMoveToTableau } from './klondike';
import {
  canMoveToFoundation as fcCanMoveToFoundation,
  canMoveToTableau as fcCanMoveToTableau,
  maxMovableCards,
  getValidSequenceLength,
} from './freecell';

export function isKlondikeStuck(state: KlondikeState): boolean {
  // Stock available → not stuck
  if (state.stock.length > 0) return false;

  // Check waste
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    if (canMoveToFoundation(card, state.foundation) !== -1) return false;
    for (let i = 0; i < 7; i++) {
      if (canMoveToTableau(card, state.tableau[i])) return false;
    }
  }

  // Draw-3 cycling check: when stock is empty and waste has multiple cards,
  // cycling the waste back to stock and re-drawing exposes buried cards.
  // Check ALL waste cards for possible moves, not just the top.
  if (state.drawMode === 3 && state.waste.length > 1) {
    // In draw-3 with cycling, every 3rd card from the waste becomes accessible.
    // Check all waste cards since any of them could become the top after cycling.
    for (let w = 0; w < state.waste.length; w++) {
      const card = state.waste[w];
      if (canMoveToFoundation(card, state.foundation) !== -1) return false;
      for (let i = 0; i < 7; i++) {
        if (canMoveToTableau(card, state.tableau[i])) return false;
      }
    }
  }

  // Check tableau to foundation
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    if (canMoveToFoundation(card, state.foundation) !== -1) return false;
  }

  // Check tableau to tableau
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    for (let j = 0; j < col.length; j++) {
      if (!col[j].faceUp) continue;
      for (let k = 0; k < 7; k++) {
        if (k === i) continue;
        if (canMoveToTableau(col[j], state.tableau[k])) {
          if (col[j].rank === 'K' && j === 0 && state.tableau[k].length === 0) continue;
          return false;
        }
      }
    }
  }

  return true;
}

export function isFreeCellStuck(state: FreeCellState): boolean {
  // Check free cells to foundation/tableau
  for (let i = 0; i < 4; i++) {
    const card = state.freeCells[i];
    if (!card) continue;
    if (fcCanMoveToFoundation(card, state.foundation) !== -1) return false;
    for (let j = 0; j < 8; j++) {
      if (fcCanMoveToTableau(card, state.tableau[j])) return false;
    }
  }

  // Check tableau to foundation
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (fcCanMoveToFoundation(card, state.foundation) !== -1) return false;
  }

  // Check tableau to tableau (stacks)
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const seqLen = getValidSequenceLength(col);
    const seqStart = col.length - seqLen;
    for (let j = seqStart; j < col.length; j++) {
      const numCards = col.length - j;
      for (let k = 0; k < 8; k++) {
        if (k === i) continue;
        if (fcCanMoveToTableau(col[j], state.tableau[k]) && numCards <= maxMovableCards(state, k)) {
          if (j === 0 && state.tableau[k].length === 0) continue;
          return false;
        }
      }
    }
  }

  // Can move to free cell — but only if it actually unblocks something
  const hasEmptyCell = state.freeCells.some(c => c === null);
  if (hasEmptyCell) {
    for (let i = 0; i < 8; i++) {
      const col = state.tableau[i];
      if (col.length === 0) continue;
      const topCard = col[col.length - 1];

      // Simulate moving top card to a free cell, then check if any new move opens up
      const simFreeCells = [...state.freeCells];
      const emptyCellIdx = simFreeCells.findIndex(c => c === null);
      simFreeCells[emptyCellIdx] = topCard;
      const simTableau = state.tableau.map((c, idx) =>
        idx === i ? c.slice(0, -1) : [...c]
      );

      const simState: FreeCellState = {
        ...state,
        freeCells: simFreeCells,
        tableau: simTableau,
      };

      // Check if the card now in freecell or newly exposed card can go somewhere useful
      // 1. Can the card we just moved go to foundation?
      if (fcCanMoveToFoundation(topCard, state.foundation) !== -1) return false;

      // 2. Does the newly exposed card (if any) have a useful move?
      if (simTableau[i].length > 0) {
        const exposed = simTableau[i][simTableau[i].length - 1];
        if (fcCanMoveToFoundation(exposed, state.foundation) !== -1) return false;
        for (let k = 0; k < 8; k++) {
          if (k === i) continue;
          if (fcCanMoveToTableau(exposed, simTableau[k])) return false;
        }
      }

      // 3. Can the freecell card go to a different tableau column?
      for (let k = 0; k < 8; k++) {
        if (k === i) continue;
        if (fcCanMoveToTableau(topCard, simTableau[k])) return false;
      }
    }
  }

  return true;
}
