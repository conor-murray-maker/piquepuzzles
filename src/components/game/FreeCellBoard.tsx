import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FreeCellState, Card, rankValue, isRed } from '@/game/types';
import {
  createFreeCellGame,
  moveToFreeCell,
  moveFreeCellToTableau,
  moveFreeCellToFoundation,
  moveTableauToFoundation,
  moveTableauToTableau,
  moveFoundationToTableau,
  isAutoCompletable,
  autoCompleteStep,
  getProgressiveHint,
  getValidSequenceLength,
  maxMovableCards,
} from '@/game/freecell';
import { PlayingCard, EmptyPile } from './PlayingCard';
import { dragManager, DragSource } from '@/game/DragManager';
import { isFreeCellStuck } from '@/game/stuckDetector';
import { Lightbulb, Undo2, RotateCcw, Timer, Hash, Trophy, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

const STORAGE_KEY = 'pique-freecell-state';
const HISTORY_KEY = 'pique-freecell-history';
const ELAPSED_KEY = 'pique-freecell-elapsed';
const SIDE_PAD = 8;
const COL_GAP = 4;
const FC_COLS = 8;

function computeCardWidth(screenWidth: number) {
  const available = screenWidth - SIDE_PAD * 2 - COL_GAP * (FC_COLS - 1);
  return Math.floor(available / FC_COLS);
}

function saveToStorage(state: FreeCellState, history: FreeCellState[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function loadFromStorage(): { state: FreeCellState; history: FreeCellState[] } | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const h = localStorage.getItem(HISTORY_KEY);
    if (s) {
      const state = JSON.parse(s) as FreeCellState;
      if (!state.isWon) return { state, history: h ? JSON.parse(h) : [] };
    }
  } catch {}
  return null;
}

export function clearFreeCellStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(ELAPSED_KEY);
}

interface FreeCellBoardProps {
  onGameEnd: (state: FreeCellState, elapsedSeconds: number) => void;
  onGiveUp?: (state: FreeCellState, elapsedSeconds: number) => void;
}

export function FreeCellBoard({ onGameEnd, onGiveUp }: FreeCellBoardProps) {
  const [state, setState] = useState<FreeCellState>(() => {
    const saved = loadFromStorage();
    return saved ? saved.state : createFreeCellGame();
  });
  const [history, setHistory] = useState<FreeCellState[]>(() => {
    const saved = loadFromStorage();
    return saved ? saved.history : [];
  });
  const [elapsed, setElapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(ELAPSED_KEY);
      return saved ? parseInt(saved, 10) : 0;
    } catch { return 0; }
  });
  const [selectedCard, setSelectedCard] = useState<{ source: string; cardIndex: number } | null>(null);
  const [hintTarget, setHintTarget] = useState<{ from: string; to: string } | null>(null);
  const [autoCompleting, setAutoCompleting] = useState(false);
  const [showGiveUpDialog, setShowGiveUpDialog] = useState(false);
  const [showStuckModal, setShowStuckModal] = useState(false);
  const [stuckDismissedAtMove, setStuckDismissedAtMove] = useState(-1);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const gameBoardRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(() => computeCardWidth(window.innerWidth));
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const gameEndedRef = useRef(false);
  const lastTapRef = useRef<{ source: string; cardIndex: number; time: number } | null>(null);

  const cardH = Math.round(cardW * 1.4);

  useEffect(() => {
    const update = () => setCardW(computeCardWidth(window.innerWidth));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (state.isWon) { clearFreeCellStorage(); } else { saveToStorage(state, history); }
  }, [state, history]);

  useEffect(() => {
    try { localStorage.setItem(ELAPSED_KEY, String(elapsed)); } catch {}
  }, [elapsed]);

  useEffect(() => {
    const el = gameBoardRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  // Timer
  useEffect(() => {
    if (state.isWon) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!intervalId) intervalId = setInterval(() => setElapsed(e => e + 1), 1000); };
    const stop = () => { if (intervalId) { clearInterval(intervalId); intervalId = null; } };
    const handleVis = () => { document.hidden ? stop() : start(); };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVis);
    return () => { stop(); document.removeEventListener('visibilitychange', handleVis); };
  }, [state.isWon]);

  // Auto-complete
  useEffect(() => {
    if (autoCompleting && !state.isWon) {
      const timer = setTimeout(() => {
        const next = autoCompleteStep(state);
        if (next) {
          setState(next);
          if (next.isWon && !gameEndedRef.current) {
            gameEndedRef.current = true;
            setAutoCompleting(false);
            onGameEnd(next, elapsedRef.current);
          }
        } else setAutoCompleting(false);
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [autoCompleting, state, onGameEnd]);

  useEffect(() => {
    if (!autoCompleting && !state.isWon && isAutoCompletable(state)) setAutoCompleting(true);
  }, [state, autoCompleting]);

  // Stuck detection
  useEffect(() => {
    if (state.isWon || autoCompleting) return;
    if (stuckDismissedAtMove >= 0 && state.moves - stuckDismissedAtMove < 5) return;

    if (isFreeCellStuck(state)) {
      stuckTimerRef.current = setTimeout(() => {
        setShowStuckModal(true);
      }, 1500);
      return () => { if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current); };
    }
  }, [state, autoCompleting, stuckDismissedAtMove]);

  const pushHistory = useCallback((s: FreeCellState) => setHistory(h => [...h, s]), []);

  const fireGameEnd = useCallback((s: FreeCellState) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    onGameEnd(s, elapsedRef.current);
  }, [onGameEnd]);

  const applyMove = useCallback((newState: FreeCellState | null) => {
    if (!newState) return false;
    pushHistory(state);
    setState(newState);
    if (newState.isWon) fireGameEnd(newState);
    return true;
  }, [state, pushHistory, fireGameEnd]);

  // Drag and drop
  const handleDrop = useCallback((source: DragSource, targetId: string | null) => {
    if (!targetId || autoCompleting) return;

    let newState: FreeCellState | null = null;

    if (targetId.startsWith('tableau-')) {
      const toCol = parseInt(targetId.split('-')[1]);
      if (source.source.startsWith('tableau-')) {
        const fromCol = parseInt(source.source.split('-')[1]);
        newState = moveTableauToTableau(state, fromCol, source.cardIndex, toCol);
      } else if (source.source.startsWith('freecell-')) {
        const cellIdx = parseInt(source.source.split('-')[1]);
        newState = moveFreeCellToTableau(state, cellIdx, toCol);
      } else if (source.source.startsWith('foundation-')) {
        const fIdx = parseInt(source.source.split('-')[1]);
        newState = moveFoundationToTableau(state, fIdx, toCol);
      }
    } else if (targetId.startsWith('foundation-')) {
      if (source.source.startsWith('tableau-')) {
        const fromCol = parseInt(source.source.split('-')[1]);
        if (source.cardIndex === state.tableau[fromCol].length - 1) {
          newState = moveTableauToFoundation(state, fromCol);
        }
      } else if (source.source.startsWith('freecell-')) {
        const cellIdx = parseInt(source.source.split('-')[1]);
        newState = moveFreeCellToFoundation(state, cellIdx);
      }
    } else if (targetId.startsWith('freecell-')) {
      if (source.source.startsWith('tableau-')) {
        const fromCol = parseInt(source.source.split('-')[1]);
        if (source.cardIndex === state.tableau[fromCol].length - 1) {
          newState = moveToFreeCell(state, fromCol);
        }
      }
    }

    applyMove(newState);
  }, [state, applyMove, autoCompleting]);

  const dragConfig = useMemo(() => ({
    onDrop: handleDrop,
    multiCardStacks: false,
  }), [handleDrop]);

  const startDrag = useCallback((e: React.PointerEvent, source: string, cardIndex: number) => {
    dragManager.startDrag(e, source, cardIndex, dragConfig);
  }, [dragConfig]);

  const [, forceRender] = useState(0);
  useEffect(() => {
    dragManager.setOnChange(() => forceRender(c => c + 1));
    return () => dragManager.setOnChange(() => {});
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setState(s => ({ ...prev, moves: s.moves + 1, undosUsed: s.undosUsed + 1 }));
  }, [history]);

  const handleHint = useCallback(() => {
    const result = getProgressiveHint(state, history);
    if ('noHint' in result) {
      toast(result.message);
      setState(s => ({ ...s, hintsUsed: s.hintsUsed + 1 }));
    } else {
      setHintTarget(result);
      setState(s => ({ ...s, hintsUsed: s.hintsUsed + 1 }));
      setTimeout(() => setHintTarget(null), 2000);
    }
  }, [state, history]);

  const handleNewGame = useCallback(() => {
    clearFreeCellStorage();
    gameEndedRef.current = false;
    setState(createFreeCellGame());
    setHistory([]);
    setElapsed(0);
    setSelectedCard(null);
    setAutoCompleting(false);
    setStuckDismissedAtMove(-1);
  }, []);

  const handleGiveUp = useCallback(() => {
    setShowGiveUpDialog(false);
    clearFreeCellStorage();
    const lostState: FreeCellState = { ...state, isWon: false };
    if (onGiveUp) onGiveUp(lostState, elapsedRef.current);
    else handleNewGame();
  }, [state, onGiveUp, handleNewGame]);

  // Smart auto-move: foundation → tableau → empty col → free cell (stacks supported)
  const handleDoubleTap = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting) return;
    setSelectedCard(null);

    let card: Card | null = null;
    let isStack = false;

    if (source.startsWith('tableau-')) {
      const colIdx = parseInt(source.split('-')[1]);
      const col = state.tableau[colIdx];
      if (cardIndex < 0 || cardIndex >= col.length) return;
      card = col[cardIndex];
      if (!card) return;
      isStack = cardIndex < col.length - 1;
      // Verify valid sequence from cardIndex
      if (isStack) {
        for (let i = cardIndex; i < col.length - 1; i++) {
          const a = col[i], b = col[i + 1];
          if (!(isRed(a.suit) !== isRed(b.suit) && rankValue(a.rank) === rankValue(b.rank) + 1)) return;
        }
      }
    } else if (source.startsWith('freecell-')) {
      const cellIdx = parseInt(source.split('-')[1]);
      card = state.freeCells[cellIdx];
    } else if (source.startsWith('foundation-')) {
      const fIdx = parseInt(source.split('-')[1]);
      const pile = state.foundation[fIdx];
      if (pile.length > 0) card = pile[pile.length - 1];
    }
    if (!card) return;

    let newState: FreeCellState | null = null;

    // Priority 1: Foundation (single cards only)
    if (!isStack) {
      if (source.startsWith('tableau-')) {
        const colIdx = parseInt(source.split('-')[1]);
        if (cardIndex === state.tableau[colIdx].length - 1) {
          newState = moveTableauToFoundation(state, colIdx);
        }
      } else if (source.startsWith('freecell-')) {
        const cellIdx = parseInt(source.split('-')[1]);
        newState = moveFreeCellToFoundation(state, cellIdx);
      }
      if (newState) { applyMove(newState); return; }
    }

    // Priority 2: Tableau on another card (prefer column with most cards)
    const sortedCols = state.tableau
      .map((col, i) => ({ col, i, faceUp: col.length }))
      .filter(c => c.col.length > 0)
      .sort((a, b) => b.faceUp - a.faceUp);

    for (const { i: toCol } of sortedCols) {
      if (source === `tableau-${toCol}`) continue;
      let attempt: FreeCellState | null = null;
      if (source.startsWith('tableau-')) {
        const fromCol = parseInt(source.split('-')[1]);
        attempt = moveTableauToTableau(state, fromCol, cardIndex, toCol);
      } else if (source.startsWith('freecell-')) {
        const cellIdx = parseInt(source.split('-')[1]);
        attempt = moveFreeCellToTableau(state, cellIdx, toCol);
      } else if (source.startsWith('foundation-')) {
        const fIdx = parseInt(source.split('-')[1]);
        attempt = moveFoundationToTableau(state, fIdx, toCol);
      }
      if (attempt) { applyMove(attempt); return; }
    }

    // Priority 3: Empty column
    for (let i = 0; i < 8; i++) {
      if (state.tableau[i].length === 0 && source !== `tableau-${i}`) {
        let attempt: FreeCellState | null = null;
        if (source.startsWith('tableau-')) {
          const fromCol = parseInt(source.split('-')[1]);
          attempt = moveTableauToTableau(state, fromCol, cardIndex, i);
        } else if (source.startsWith('freecell-')) {
          const cellIdx = parseInt(source.split('-')[1]);
          attempt = moveFreeCellToTableau(state, cellIdx, i);
        }
        if (attempt) { applyMove(attempt); return; }
      }
    }

    // Priority 4: Free cell (single cards only, last resort)
    if (!isStack && source.startsWith('tableau-')) {
      const fromCol = parseInt(source.split('-')[1]);
      if (cardIndex === state.tableau[fromCol].length - 1) {
        const attempt = moveToFreeCell(state, fromCol);
        if (attempt) { applyMove(attempt); return; }
      }
    }
  }, [state, applyMove, autoCompleting]);

  const handleCardClick = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting || dragManager.isDragging) return;

    // Double-tap detection
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.source === source && last.cardIndex === cardIndex && now - last.time < 300) {
      lastTapRef.current = null;
      handleDoubleTap(source, cardIndex);
      return;
    }
    lastTapRef.current = { source, cardIndex, time: now };

    if (selectedCard) {
      let newState: FreeCellState | null = null;
      if (source.startsWith('tableau-')) {
        const toCol = parseInt(source.split('-')[1]);
        if (selectedCard.source.startsWith('tableau-')) {
          const fromCol = parseInt(selectedCard.source.split('-')[1]);
          newState = moveTableauToTableau(state, fromCol, selectedCard.cardIndex, toCol);
        } else if (selectedCard.source.startsWith('freecell-')) {
          const cellIdx = parseInt(selectedCard.source.split('-')[1]);
          newState = moveFreeCellToTableau(state, cellIdx, toCol);
        } else if (selectedCard.source.startsWith('foundation-')) {
          const fIdx = parseInt(selectedCard.source.split('-')[1]);
          newState = moveFoundationToTableau(state, fIdx, toCol);
        }
      } else if (source.startsWith('freecell-')) {
        if (selectedCard.source.startsWith('tableau-')) {
          const fromCol = parseInt(selectedCard.source.split('-')[1]);
          if (selectedCard.cardIndex === state.tableau[fromCol].length - 1) {
            newState = moveToFreeCell(state, fromCol);
          }
        }
      }
      if (newState) { pushHistory(state); setState(newState); if (newState.isWon) fireGameEnd(newState); }
      setSelectedCard(null);
      return;
    }
    setSelectedCard({ source, cardIndex });
  }, [selectedCard, state, pushHistory, fireGameEnd, autoCompleting, handleDoubleTap]);

  const handleEmptyTableauClick = useCallback((colIndex: number) => {
    if (!selectedCard || autoCompleting) return;
    let newState: FreeCellState | null = null;
    if (selectedCard.source.startsWith('tableau-')) {
      const fromCol = parseInt(selectedCard.source.split('-')[1]);
      newState = moveTableauToTableau(state, fromCol, selectedCard.cardIndex, colIndex);
    } else if (selectedCard.source.startsWith('freecell-')) {
      const cellIdx = parseInt(selectedCard.source.split('-')[1]);
      newState = moveFreeCellToTableau(state, cellIdx, colIndex);
    }
    if (newState) { pushHistory(state); setState(newState); }
    setSelectedCard(null);
  }, [selectedCard, state, pushHistory, autoCompleting]);

  const handleEmptyFreeCellClick = useCallback((cellIdx: number) => {
    if (!selectedCard || autoCompleting) return;
    if (selectedCard.source.startsWith('tableau-')) {
      const fromCol = parseInt(selectedCard.source.split('-')[1]);
      if (selectedCard.cardIndex === state.tableau[fromCol].length - 1) {
        const ns = moveToFreeCell(state, fromCol);
        if (ns) { pushHistory(state); setState(ns); }
      }
    }
    setSelectedCard(null);
  }, [selectedCard, state, pushHistory, autoCompleting]);

  const handleStuckUndo = useCallback(() => {
    setShowStuckModal(false);
    setHistory(h => {
      if (h.length === 0) return h;
      const n = Math.min(3, h.length);
      const target = h[h.length - n];
      setState(s => ({
        ...target,
        moves: s.moves + n,
        undosUsed: s.undosUsed + n,
      }));
      return h.slice(0, -n);
    });
  }, []);

  const handleStuckNewDeal = useCallback(() => {
    setShowStuckModal(false);
    handleGiveUp();
  }, [handleGiveUp]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const isHighlighted = (source: string) => {
    if (hintTarget) return hintTarget.from === source || hintTarget.to === source;
    if (selectedCard) return selectedCard.source === source;
    return false;
  };

  const boardWidth = cardW * FC_COLS + COL_GAP * (FC_COLS - 1);
  const FACE_UP_OFFSET = 28;

  return (
    <div
      ref={gameBoardRef}
      className="min-h-screen flex flex-col"
      style={{
        background: '#f1f5f9',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{formatTime(elapsed)}</span>
          <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{state.moves}</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            state.difficulty === 'Easy' ? 'bg-rating-up/20 text-rating-up' :
            state.difficulty === 'Medium' ? 'bg-gold/20 text-gold' :
            state.difficulty === 'Hard' ? 'bg-destructive/20 text-destructive' :
            'bg-elite/20 text-elite'
          }`}>{state.difficulty}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleHint} className="h-8 px-2">
            <Lightbulb className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={history.length === 0} className="h-8 px-2">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNewGame} className="h-8 px-2">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowGiveUpDialog(true)} className="h-8 px-2 text-destructive hover:text-destructive">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Game area */}
      <div
        className="flex-1 flex flex-col items-center pt-3 pb-4 overflow-auto"
        style={{
          padding: `12px ${SIDE_PAD}px 16px`,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ width: boardWidth, maxWidth: '100%' }}>
          {/* Top row: 4 free cells + 4 foundations */}
          <div className="flex items-start justify-between" style={{ gap: COL_GAP }}>
            {/* Free cells group */}
            <div className="flex" style={{ gap: COL_GAP }}>
              {state.freeCells.map((card, i) => (
                <div
                  key={`fc-${i}`}
                  className={`flex-shrink-0 ${isHighlighted(`freecell-${i}`) ? 'ring-2 ring-primary rounded-lg' : ''}`}
                  data-drop-target={`freecell-${i}`}
                >
                  {card ? (
                    <div onPointerDown={(e) => startDrag(e, `freecell-${i}`, 0)}>
                      <PlayingCard
                        card={card}
                        onClick={() => !dragManager.isDragging && handleCardClick(`freecell-${i}`, 0)}
                        cardWidth={cardW}
                      />
                    </div>
                  ) : (
                    <EmptyPile onClick={() => handleEmptyFreeCellClick(i)} variant="freecell" cardWidth={cardW} />
                  )}
                </div>
              ))}
            </div>

            {/* Foundation group */}
            <div className="flex" style={{ gap: COL_GAP }}>
              {state.foundation.map((pile, i) => (
                <div
                  key={`f-${i}`}
                  className={`flex-shrink-0 ${isHighlighted(`foundation-${i}`) ? 'ring-2 ring-primary rounded-lg' : ''}`}
                  data-drop-target={`foundation-${i}`}
                >
                  {pile.length > 0 ? (
                    <div onPointerDown={(e) => startDrag(e, `foundation-${i}`, pile.length - 1)}>
                      <PlayingCard
                        card={pile[pile.length - 1]}
                        onClick={() => !dragManager.isDragging && handleCardClick(`foundation-${i}`, pile.length - 1)}
                        cardWidth={cardW}
                      />
                    </div>
                  ) : (
                    <EmptyPile label={['♥', '♦', '♣', '♠'][i]} variant="foundation" cardWidth={cardW} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Labels */}
          <div className="flex justify-between mt-1 mb-3">
            <span style={{ fontSize: 10, color: '#94a3b8', width: cardW * 4 + COL_GAP * 3, textAlign: 'center' }}>Free Cells</span>
            <span style={{ fontSize: 10, color: '#94a3b8', width: cardW * 4 + COL_GAP * 3, textAlign: 'center' }}>Foundation</span>
          </div>

          {/* Tableau: 8 columns */}
          <div className="flex justify-between" style={{ gap: COL_GAP }}>
            {state.tableau.map((col, colIdx) => (
              <div
                key={colIdx}
                className={`relative flex-shrink-0 ${isHighlighted(`tableau-${colIdx}`) ? 'ring-2 ring-primary rounded-lg' : ''}`}
                style={{ width: cardW, minHeight: cardH + 20 }}
                data-drop-target={`tableau-${colIdx}`}
              >
                {col.length === 0 ? (
                  <EmptyPile onClick={() => handleEmptyTableauClick(colIdx)} cardWidth={cardW} />
                ) : (
                  col.map((card, cardIdx) => {
                    const seqLen = getValidSequenceLength(col);
                    const seqStart = col.length - seqLen;
                    const canDrag = cardIdx >= seqStart && (col.length - cardIdx) <= maxMovableCards(state, undefined);
                    const isSelected = selectedCard?.source === `tableau-${colIdx}` && cardIdx >= selectedCard.cardIndex;
                    return (
                      <div
                        key={card.id}
                        className="absolute"
                        style={{ top: cardIdx * FACE_UP_OFFSET, left: 0 }}
                        onPointerDown={canDrag ? (e) => startDrag(e, `tableau-${colIdx}`, cardIdx) : undefined}
                      >
                        <PlayingCard
                          card={card}
                          onClick={!dragManager.isDragging ? () => handleCardClick(`tableau-${colIdx}`, cardIdx) : undefined}
                          cardWidth={cardW}
                          className={isSelected ? 'ring-2 ring-primary' : ''}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Win overlay */}
      <AnimatePresence>
        {state.isWon && (
          <motion.div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="bg-card border border-border rounded-2xl p-8 text-center max-w-sm mx-4"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
              <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">You Won!</h2>
              <div className="space-y-1 text-sm text-muted-foreground mb-6">
                <p>Time: {formatTime(elapsed)}</p>
                <p>Moves: {state.moves}</p>
                <p>Difficulty: {state.difficulty}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => fireGameEnd(state)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-1" />Home
                </Button>
                <Button onClick={handleNewGame} className="flex-1 bg-rating-up hover:bg-rating-up/90 text-white">
                  Play Again
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Give Up dialog */}
      <AlertDialog open={showGiveUpDialog} onOpenChange={setShowGiveUpDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Give up this game?</AlertDialogTitle>
            <AlertDialogDescription>Your rating will take a small penalty.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Playing</AlertDialogCancel>
            <AlertDialogAction onClick={handleGiveUp} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Give Up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stuck modal */}
      <AlertDialog open={showStuckModal} onOpenChange={setShowStuckModal}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>No moves available</AlertDialogTitle>
            <AlertDialogDescription>
              It looks like there are no more moves to make. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleStuckUndo}>
              Undo moves
            </Button>
            <Button variant="secondary" onClick={handleStuckNewDeal}>
              New deal
            </Button>
            <Button variant="ghost" onClick={() => {
              setShowStuckModal(false);
              setStuckDismissedAtMove(state.moves);
            }}>
              Keep trying
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
