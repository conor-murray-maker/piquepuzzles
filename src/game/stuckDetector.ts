import { KlondikeState, FreeCellState } from './types';
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

  // Can move to free cell
  const hasEmptyCell = state.freeCells.some(c => c === null);
  if (hasEmptyCell) {
    for (let i = 0; i < 8; i++) {
      if (state.tableau[i].length > 0) return false;
    }
  }

  return true;
}
