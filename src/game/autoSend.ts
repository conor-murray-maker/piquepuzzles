import { Card, KlondikeState, FreeCellState, rankValue, isRed, Suit } from './types';

function isSafeToAutoSend(card: Card, foundation: Card[][]): boolean {
  if (card.rank === 'A') return true;
  const neededRank = rankValue(card.rank) - 1;
  const oppSuits: Suit[] = isRed(card.suit) ? ['clubs', 'spades'] : ['hearts', 'diamonds'];
  for (const suit of oppSuits) {
    const pile = foundation.find(p => p.length > 0 && p[0].suit === suit);
    if (!pile || rankValue(pile[pile.length - 1].rank) < neededRank) return false;
  }
  return true;
}

function canPlaceOnFoundation(card: Card, foundation: Card[][]): number {
  for (let i = 0; i < 4; i++) {
    const pile = foundation[i];
    if (pile.length === 0 && card.rank === 'A') {
      if (foundation.every((p, j) => j === i || p.length === 0 || p[0].suit !== card.suit)) return i;
    }
    if (pile.length > 0) {
      const top = pile[pile.length - 1];
      if (top.suit === card.suit && rankValue(card.rank) === rankValue(top.rank) + 1) return i;
    }
  }
  return -1;
}

export interface AutoSendInfo {
  source: string;
  foundationIdx: number;
}

export function getKlondikeAutoSend(state: KlondikeState): AutoSendInfo | null {
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    if (card.faceUp) {
      const fIdx = canPlaceOnFoundation(card, state.foundation);
      if (fIdx !== -1 && isSafeToAutoSend(card, state.foundation)) {
        return { source: 'waste', foundationIdx: fIdx };
      }
    }
  }
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    const fIdx = canPlaceOnFoundation(card, state.foundation);
    if (fIdx !== -1 && isSafeToAutoSend(card, state.foundation)) {
      return { source: `tableau-${i}`, foundationIdx: fIdx };
    }
  }
  return null;
}

export function applyKlondikeAutoSend(state: KlondikeState, info: AutoSendInfo): KlondikeState {
  const ns: KlondikeState = {
    ...state,
    tableau: state.tableau.map(col => col.map(c => ({ ...c }))),
    foundation: state.foundation.map(pile => pile.map(c => ({ ...c }))),
    stock: state.stock.map(c => ({ ...c })),
    waste: state.waste.map(c => ({ ...c })),
  };
  if (info.source === 'waste') {
    ns.foundation[info.foundationIdx].push(ns.waste.pop()!);
  } else {
    const colIdx = parseInt(info.source.split('-')[1]);
    ns.foundation[info.foundationIdx].push(ns.tableau[colIdx].pop()!);
    const col = ns.tableau[colIdx];
    if (col.length > 0 && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true;
  }
  const total = ns.foundation.reduce((s, p) => s + p.length, 0);
  if (total === 52) ns.isWon = true;
  return ns;
}

export function getFreeCellAutoSend(state: FreeCellState): AutoSendInfo | null {
  for (let i = 0; i < 4; i++) {
    const card = state.freeCells[i];
    if (!card) continue;
    const fIdx = canPlaceOnFoundation(card, state.foundation);
    if (fIdx !== -1 && isSafeToAutoSend(card, state.foundation)) {
      return { source: `freecell-${i}`, foundationIdx: fIdx };
    }
  }
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    const fIdx = canPlaceOnFoundation(card, state.foundation);
    if (fIdx !== -1 && isSafeToAutoSend(card, state.foundation)) {
      return { source: `tableau-${i}`, foundationIdx: fIdx };
    }
  }
  return null;
}

export function applyFreeCellAutoSend(state: FreeCellState, info: AutoSendInfo): FreeCellState {
  const ns: FreeCellState = {
    ...state,
    tableau: state.tableau.map(col => col.map(c => ({ ...c }))),
    foundation: state.foundation.map(pile => pile.map(c => ({ ...c }))),
    freeCells: state.freeCells.map(c => c ? { ...c } : null),
  };
  if (info.source.startsWith('freecell-')) {
    const cellIdx = parseInt(info.source.split('-')[1]);
    ns.foundation[info.foundationIdx].push(ns.freeCells[cellIdx]!);
    ns.freeCells[cellIdx] = null;
  } else {
    const colIdx = parseInt(info.source.split('-')[1]);
    ns.foundation[info.foundationIdx].push(ns.tableau[colIdx].pop()!);
  }
  const total = ns.foundation.reduce((s, p) => s + p.length, 0);
  if (total === 52) ns.isWon = true;
  return ns;
}
