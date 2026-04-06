/**
 * Deterministic heuristic board evaluator for Klondike and FreeCell hints.
 * Replaces MCTS as primary hint engine — scores each legal move by the
 * quality of the resulting board state.
 */

import { Card, KlondikeState, FreeCellState, rankValue, isRed, suitSymbol } from './types';
import {
  canMoveToFoundation as klondikeCanMoveToFoundation,
  canMoveToTableau as klondikeCanMoveToTableau,
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveTableauToFoundation as klondikeMoveTableauToFoundation,
  moveTableauToTableau as klondikeMoveTableauToTableau,
  moveFoundationToTableau as klondikeMoveFoundationToTableau,
} from './klondike';
import {
  canMoveToFoundation as fcCanMoveToFoundation,
  canMoveToTableau as fcCanMoveToTableau,
  moveToFreeCell,
  moveFreeCellToTableau,
  moveFreeCellToFoundation,
  moveTableauToFoundation as fcMoveTableauToFoundation,
  moveTableauToTableau as fcMoveTableauToTableau,
  getValidSequenceLength,
  maxMovableCards,
} from './freecell';

// Debug flag — set to true to see hint engine internals
export const HINT_DEBUG = false;

export interface HintMove {
  from: string;
  to: string;
  description: string;
  score: number;
  engine: 'heuristic' | 'fallback';
}

// ─── KLONDIKE ──────────────────────────────────────────────────

interface KlondikeCandidate {
  from: string;
  to: string;
  description: string;
  applyFn: () => KlondikeState | null;
  moveType: string;
  cardIndex?: number;
}

function getKlondikeCandidates(state: KlondikeState): KlondikeCandidate[] {
  const candidates: KlondikeCandidate[] = [];

  // Waste to foundation
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const fi = klondikeCanMoveToFoundation(card, state.foundation);
    if (fi !== -1) {
      candidates.push({
        from: 'waste', to: `foundation-${fi}`,
        description: `${card.rank}${suitSymbol(card.suit)} → Foundation`,
        applyFn: () => moveWasteToFoundation(state),
        moveType: 'waste-to-foundation',
      });
    }
  }

  // Tableau to foundation
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    const fi = klondikeCanMoveToFoundation(card, state.foundation);
    if (fi !== -1) {
      candidates.push({
        from: `tableau-${i}`, to: `foundation-${fi}`,
        description: `${card.rank}${suitSymbol(card.suit)} → Foundation`,
        applyFn: () => klondikeMoveTableauToFoundation(state, i),
        moveType: 'tableau-to-foundation',
      });
    }
  }

  // Waste to tableau
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    for (let k = 0; k < 7; k++) {
      if (klondikeCanMoveToTableau(card, state.tableau[k])) {
        candidates.push({
          from: 'waste', to: `tableau-${k}`,
          description: `${card.rank}${suitSymbol(card.suit)} → Column ${k + 1}`,
          applyFn: () => moveWasteToTableau(state, k),
          moveType: 'waste-to-tableau',
        });
      }
    }
  }

  // Tableau to tableau
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    for (let j = 0; j < col.length; j++) {
      if (!col[j].faceUp) continue;
      for (let k = 0; k < 7; k++) {
        if (k === i) continue;
        if (klondikeCanMoveToTableau(col[j], state.tableau[k])) {
          // Skip king from empty to empty (no gain)
          if (col[j].rank === 'K' && j === 0 && state.tableau[k].length === 0) continue;
          const ci = j; const ki = k; const ii = i;
          candidates.push({
            from: `tableau-${i}`, to: `tableau-${k}`, cardIndex: j,
            description: `${col[j].rank}${suitSymbol(col[j].suit)} → Column ${k + 1}`,
            applyFn: () => klondikeMoveTableauToTableau(state, ii, ci, ki),
            moveType: 'tableau-to-tableau',
          });
        }
      }
    }
  }

  // Draw from stock
  if (state.stock.length > 0 || state.waste.length > 0) {
    candidates.push({
      from: 'stock', to: 'waste',
      description: 'Draw from stock',
      applyFn: () => drawFromStock(state),
      moveType: 'stock-draw',
    });
  }

  return candidates;
}

function scoreKlondikeMove(state: KlondikeState, candidate: KlondikeCandidate): number {
  const resultState = candidate.applyFn();
  if (!resultState) return -999;

  let score = 0;

  // +500 foundation move
  if (candidate.moveType.includes('foundation') && candidate.to.startsWith('foundation')) {
    score += 500;
  }

  // +200 face-down card exposed
  if (candidate.moveType === 'tableau-to-tableau' || candidate.moveType === 'tableau-to-foundation') {
    const fromIdx = parseInt(candidate.from.split('-')[1]);
    const origCol = state.tableau[fromIdx];
    const newCol = resultState.tableau[fromIdx];
    // Check if we exposed a face-down card
    if (origCol.length > 0 && newCol.length > 0) {
      const origTop = origCol[newCol.length - 1]; // card at what is now the top
      if (origTop && !origTop.faceUp && newCol[newCol.length - 1].faceUp) {
        score += 200;
      }
    } else if (origCol.length > 1 && newCol.length > 0 && !origCol[origCol.length - 2]?.faceUp) {
      // Moved last face-up card, exposed face-down beneath
      score += 200;
    }
    // More reliable check: compare face-up counts
    const origFaceDown = origCol.filter(c => !c.faceUp).length;
    const newFaceDown = resultState.tableau[fromIdx].filter(c => !c.faceUp).length;
    if (newFaceDown < origFaceDown && score < 200) {
      score += 200;
    }
  }

  // +150 empty column created
  const origEmptyCols = state.tableau.filter(c => c.length === 0).length;
  const newEmptyCols = resultState.tableau.filter(c => c.length === 0).length;
  if (newEmptyCols > origEmptyCols) {
    score += 150;
  }

  // +80 enables immediate subsequent foundation move
  if (hasNewFoundationMove(state, resultState, 'klondike')) {
    score += 80;
  }

  // +30 tableau sequence extended
  if (candidate.moveType === 'tableau-to-tableau' || candidate.moveType === 'waste-to-tableau') {
    const toIdx = parseInt(candidate.to.split('-')[1]);
    const origSeq = countKlondikeSequence(state.tableau[toIdx]);
    const newSeq = countKlondikeSequence(resultState.tableau[toIdx]);
    if (newSeq > origSeq) {
      score += 30;
    }
  }

  // -200 immediately reversible with no net gain
  if (candidate.moveType === 'tableau-to-tableau' && score <= 30) {
    // If moving cards back would be legal and nothing was exposed
    const fromIdx = parseInt(candidate.from.split('-')[1]);
    const toIdx = parseInt(candidate.to.split('-')[1]);
    const origFaceDown = state.tableau[fromIdx].filter(c => !c.faceUp).length;
    const newFaceDown = resultState.tableau[fromIdx].filter(c => !c.faceUp).length;
    if (newFaceDown === origFaceDown) {
      // No face-down exposed — check if reverse move is legal
      const movedCardIdx = candidate.cardIndex ?? (state.tableau[fromIdx].length - 1);
      const movedCard = state.tableau[fromIdx][movedCardIdx];
      if (movedCard && klondikeCanMoveToTableau(movedCard, state.tableau[fromIdx])) {
        // Wait — check if source column is NOT empty after move (if empty, reverse would be pointless K move)
        if (resultState.tableau[fromIdx].length > 0) {
          score -= 200;
        }
      }
    }
  }

  // -100 useful card buried
  if (candidate.moveType === 'tableau-to-tableau') {
    const toIdx = parseInt(candidate.to.split('-')[1]);
    const toCol = resultState.tableau[toIdx];
    // Check if any card buried under the moved stack needs to go to foundation soon
    for (let i = 0; i < toCol.length - 1; i++) {
      const c = toCol[i];
      if (c.faceUp && isNextFoundationCard(c, state.foundation)) {
        score -= 100;
        break;
      }
    }
  }

  // Stock draw gets 0 base score (neutral)
  if (candidate.moveType === 'stock-draw') {
    score = 0;
  }

  return score;
}

// ─── FREECELL ──────────────────────────────────────────────────

interface FreeCellCandidate {
  from: string;
  to: string;
  description: string;
  applyFn: () => FreeCellState | null;
  moveType: string;
  cardIndex?: number;
}

function getFreeCellCandidates(state: FreeCellState): FreeCellCandidate[] {
  const candidates: FreeCellCandidate[] = [];

  // Freecell to foundation
  for (let i = 0; i < 4; i++) {
    const card = state.freeCells[i];
    if (!card) continue;
    const fi = fcCanMoveToFoundation(card, state.foundation);
    if (fi !== -1) {
      const ci = i;
      candidates.push({
        from: `freecell-${i}`, to: `foundation-${fi}`,
        description: `${card.rank}${suitSymbol(card.suit)} → Foundation`,
        applyFn: () => moveFreeCellToFoundation(state, ci),
        moveType: 'freecell-to-foundation',
      });
    }
  }

  // Tableau to foundation
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    const fi = fcCanMoveToFoundation(card, state.foundation);
    if (fi !== -1) {
      const ci = i;
      candidates.push({
        from: `tableau-${i}`, to: `foundation-${fi}`,
        description: `${card.rank}${suitSymbol(card.suit)} → Foundation`,
        applyFn: () => fcMoveTableauToFoundation(state, ci),
        moveType: 'tableau-to-foundation',
      });
    }
  }

  // Freecell to tableau
  for (let i = 0; i < 4; i++) {
    const card = state.freeCells[i];
    if (!card) continue;
    for (let k = 0; k < 8; k++) {
      if (fcCanMoveToTableau(card, state.tableau[k])) {
        const ci = i; const ki = k;
        candidates.push({
          from: `freecell-${i}`, to: `tableau-${k}`,
          description: `${card.rank}${suitSymbol(card.suit)} → Column ${k + 1}`,
          applyFn: () => moveFreeCellToTableau(state, ci, ki),
          moveType: 'freecell-to-tableau',
        });
      }
    }
  }

  // Tableau to tableau
  for (let i = 0; i < 8; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const seqLen = getValidSequenceLength(col);
    const seqStart = col.length - seqLen;
    for (let j = seqStart; j < col.length; j++) {
      const numCards = col.length - j;
      for (let t = 0; t < 8; t++) {
        if (t === i) continue;
        if (fcCanMoveToTableau(col[j], state.tableau[t]) && numCards <= maxMovableCards(state, t)) {
          if (state.tableau[t].length === 0 && j === 0) continue; // Don't move whole column to empty
          const ii = i; const ji = j; const ti = t;
          candidates.push({
            from: `tableau-${i}`, to: `tableau-${t}`, cardIndex: j,
            description: `${col[j].rank}${suitSymbol(col[j].suit)} → Column ${t + 1}`,
            applyFn: () => fcMoveTableauToTableau(state, ii, ji, ti),
            moveType: 'tableau-to-tableau',
          });
        }
      }
    }
  }

  // Tableau to freecell
  const hasEmptyCell = state.freeCells.some(c => c === null);
  if (hasEmptyCell) {
    for (let i = 0; i < 8; i++) {
      const col = state.tableau[i];
      if (col.length === 0) continue;
      const card = col[col.length - 1];
      const ci = i;
      candidates.push({
        from: `tableau-${i}`, to: 'freecell',
        description: `${card.rank}${suitSymbol(card.suit)} → Free Cell`,
        applyFn: () => moveToFreeCell(state, ci),
        moveType: 'tableau-to-freecell',
      });
    }
  }

  return candidates;
}

function scoreFreeCellMove(state: FreeCellState, candidate: FreeCellCandidate): number {
  const resultState = candidate.applyFn();
  if (!resultState) return -999;

  let score = 0;

  // +500 foundation move
  if (candidate.to.startsWith('foundation')) {
    score += 500;
  }

  // +200 freecell cleared
  if (candidate.from.startsWith('freecell') && !candidate.to.startsWith('freecell')) {
    score += 200;
  }

  // +150 empty column created
  const origEmptyCols = state.tableau.filter(c => c.length === 0).length;
  const newEmptyCols = resultState.tableau.filter(c => c.length === 0).length;
  if (newEmptyCols > origEmptyCols) {
    score += 150;
  }

  // +80 enables immediate subsequent foundation move
  if (hasNewFoundationMove(state, resultState, 'freecell')) {
    score += 80;
  }

  // +30 tableau sequence extended
  if (candidate.moveType === 'tableau-to-tableau' || candidate.moveType === 'freecell-to-tableau') {
    const toIdx = parseInt(candidate.to.split('-')[1]);
    const origSeq = countFCSequence(state.tableau[toIdx]);
    const newSeq = countFCSequence(resultState.tableau[toIdx]);
    if (newSeq > origSeq) {
      score += 30;
    }
  }

  // Freecell moves: strategic vs dump
  if (candidate.moveType === 'tableau-to-freecell') {
    // Check if using freecell unblocks a high-value move next turn
    const unblocks = freecellMoveUnblocksHighValue(state, candidate, resultState);
    if (unblocks) {
      score += 20;
    } else {
      score -= 150; // Dump with no follow-up
    }
  }

  // -200 immediately reversible with no net gain
  if (candidate.moveType === 'tableau-to-tableau' && score <= 30) {
    const fromIdx = parseInt(candidate.from.split('-')[1]);
    const toIdx = parseInt(candidate.to.split('-')[1]);
    // If no structural change (no empty col created, no sequence improvement beyond the move itself)
    if (newEmptyCols === origEmptyCols) {
      const movedCardIdx = candidate.cardIndex ?? (state.tableau[fromIdx].length - 1);
      const movedCard = state.tableau[fromIdx][movedCardIdx];
      if (movedCard && fcCanMoveToTableau(movedCard, state.tableau[fromIdx]) && resultState.tableau[fromIdx].length > 0) {
        score -= 200;
      }
    }
  }

  return score;
}

function freecellMoveUnblocksHighValue(state: FreeCellState, candidate: FreeCellCandidate, resultState: FreeCellState): boolean {
  // After moving to freecell, does the resulting state have a foundation or freecell-clear move?
  // Check if newly exposed card can go to foundation
  const fromIdx = parseInt(candidate.from.split('-')[1]);
  const newCol = resultState.tableau[fromIdx];
  if (newCol.length > 0) {
    const exposed = newCol[newCol.length - 1];
    if (fcCanMoveToFoundation(exposed, resultState.foundation) !== -1) return true;
    // Or does it unblock a sequence move that creates an empty column?
    if (newCol.length === 1) return true; // Will empty a column next
  } else {
    return true; // Created empty column
  }
  return false;
}

// ─── SHARED HELPERS ────────────────────────────────────────────

function isNextFoundationCard(card: Card, foundation: Card[][]): boolean {
  for (const pile of foundation) {
    if (pile.length === 0 && card.rank === 'A') return true;
    if (pile.length > 0) {
      const top = pile[pile.length - 1];
      if (top.suit === card.suit && rankValue(card.rank) === rankValue(top.rank) + 1) return true;
    }
  }
  return false;
}

function hasNewFoundationMove(
  origState: KlondikeState | FreeCellState,
  newState: KlondikeState | FreeCellState,
  mode: 'klondike' | 'freecell'
): boolean {
  const canMoveToFn = mode === 'klondike' ? klondikeCanMoveToFoundation : fcCanMoveToFoundation;
  const colCount = mode === 'klondike' ? 7 : 8;

  // Check if new state has any foundation move that old state didn't
  for (let i = 0; i < colCount; i++) {
    const col = newState.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    if (canMoveToFn(card, newState.foundation) !== -1) {
      // Was this already possible?
      const origCol = origState.tableau[i];
      if (origCol.length === 0) return true; // New card appeared
      const origCard = origCol[origCol.length - 1];
      if (!origCard.faceUp || origCard.id !== card.id) return true;
      if (canMoveToFn(origCard, origState.foundation) === -1) return true;
    }
  }

  // For freecell: also check freecells
  if (mode === 'freecell') {
    const fcState = newState as FreeCellState;
    const origFcState = origState as FreeCellState;
    for (let i = 0; i < 4; i++) {
      const card = fcState.freeCells[i];
      if (!card) continue;
      if (fcCanMoveToFoundation(card, fcState.foundation) !== -1) {
        const origCard = origFcState.freeCells[i];
        if (!origCard || origCard.id !== card.id) return true;
        if (fcCanMoveToFoundation(origCard, origFcState.foundation) === -1) return true;
      }
    }
  }

  // For klondike: also check waste
  if (mode === 'klondike') {
    const kState = newState as KlondikeState;
    const origKState = origState as KlondikeState;
    if (kState.waste.length > 0) {
      const card = kState.waste[kState.waste.length - 1];
      if (klondikeCanMoveToFoundation(card, kState.foundation) !== -1) {
        if (origKState.waste.length === 0) return true;
        const origCard = origKState.waste[origKState.waste.length - 1];
        if (origCard.id !== card.id) return true;
        if (klondikeCanMoveToFoundation(origCard, origKState.foundation) === -1) return true;
      }
    }
  }

  return false;
}

function countKlondikeSequence(col: Card[]): number {
  if (col.length === 0) return 0;
  let len = 1;
  for (let i = col.length - 2; i >= 0; i--) {
    const below = col[i];
    const above = col[i + 1];
    if (!below.faceUp || !above.faceUp) break;
    if (isRed(below.suit) !== isRed(above.suit) && rankValue(below.rank) === rankValue(above.rank) + 1) {
      len++;
    } else break;
  }
  return len;
}

function countFCSequence(col: Card[]): number {
  return col.length === 0 ? 0 : getValidSequenceLength(col);
}

// ─── MAIN EVALUATOR ───────────────────────────────────────────

const MOVE_PRIORITY: Record<string, number> = {
  'foundation': 1,
  'expose': 2,
  'empty-col': 3,
  'other': 4,
};

function getMoveCategory(score: number, moveType: string): string {
  if (moveType.includes('foundation') && !moveType.startsWith('foundation')) return 'foundation';
  if (score >= 200) return 'expose';
  if (score >= 150) return 'empty-col';
  return 'other';
}

export function getKlondikeHint(state: KlondikeState): HintMove | null {
  const startTime = HINT_DEBUG ? performance.now() : 0;
  const candidates = getKlondikeCandidates(state);

  if (candidates.length === 0) return null;

  const scored = candidates.map(c => ({
    ...c,
    score: scoreKlondikeMove(state, c),
  }));

  // Filter out ≤ 0 scores
  let viable = scored.filter(s => s.score > 0);

  // If nothing viable, include all (don't return null)
  if (viable.length === 0) {
    viable = scored;
  }

  // Sort by score descending, then by category priority for ties
  viable.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const catA = getMoveCategory(a.score, a.moveType);
    const catB = getMoveCategory(b.score, b.moveType);
    return (MOVE_PRIORITY[catA] || 4) - (MOVE_PRIORITY[catB] || 4);
  });

  const best = viable[0];

  if (HINT_DEBUG) {
    const elapsed = performance.now() - startTime;
    console.log(`[HINT] Engine: HEURISTIC | Time: ${elapsed.toFixed(1)}ms`);
    console.log('[HINT] Top 3 candidates:', viable.slice(0, 3).map(v => ({
      move: v.description, score: v.score,
    })));
  }

  return {
    from: best.from,
    to: best.to,
    description: best.description,
    score: best.score,
    engine: 'heuristic',
  };
}

export function getFreeCellHint(state: FreeCellState): HintMove | null {
  const startTime = HINT_DEBUG ? performance.now() : 0;
  const candidates = getFreeCellCandidates(state);

  if (candidates.length === 0) return null;

  const scored = candidates.map(c => ({
    ...c,
    score: scoreFreeCellMove(state, c),
  }));

  let viable = scored.filter(s => s.score > 0);
  if (viable.length === 0) {
    viable = scored;
  }

  viable.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const catA = getMoveCategory(a.score, a.moveType);
    const catB = getMoveCategory(b.score, b.moveType);
    return (MOVE_PRIORITY[catA] || 4) - (MOVE_PRIORITY[catB] || 4);
  });

  const best = viable[0];

  if (HINT_DEBUG) {
    const elapsed = performance.now() - startTime;
    console.log(`[HINT] Engine: HEURISTIC | Time: ${elapsed.toFixed(1)}ms`);
    console.log('[HINT] Top 3 candidates:', viable.slice(0, 3).map(v => ({
      move: v.description, score: v.score,
    })));
  }

  return {
    from: best.from,
    to: best.to,
    description: best.description,
    score: best.score,
    engine: 'heuristic',
  };
}
