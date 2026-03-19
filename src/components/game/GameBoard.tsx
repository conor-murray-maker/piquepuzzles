import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KlondikeState, DrawMode } from '@/game/types';
import {
  createKlondikeGame,
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveTableauToFoundation,
  moveTableauToTableau,
  moveFoundationToTableau,
  isAutoCompletable,
  autoCompleteStep,
  getHint,
} from '@/game/klondike';
import { PlayingCard, EmptyPile } from './PlayingCard';
import { useDragAndDrop, DragSource } from '@/hooks/useDragAndDrop';
import { Lightbulb, Undo2, RotateCcw, Timer, Hash, Trophy, Layers, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

const STORAGE_KEY = 'pique-game-state';
const HISTORY_KEY = 'pique-game-history';
const ELAPSED_KEY = 'pique-elapsed-time';
const SIDE_PAD = 8;
const COL_GAP = 4;
const COLS = 7;

function computeCardWidth(screenWidth: number) {
  const available = screenWidth - SIDE_PAD * 2 - COL_GAP * (COLS - 1);
  return Math.floor(available / COLS);
}

function saveToStorage(state: KlondikeState, history: KlondikeState[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function loadFromStorage(): { state: KlondikeState; history: KlondikeState[] } | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const h = localStorage.getItem(HISTORY_KEY);
    if (s) {
      const state = JSON.parse(s) as KlondikeState;
      if (!state.isWon) {
        return { state, history: h ? JSON.parse(h) : [] };
      }
    }
  } catch {}
  return null;
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(ELAPSED_KEY);
}

interface GameBoardProps {
  onGameEnd: (state: KlondikeState) => void;
  onGiveUp?: (state: KlondikeState) => void;
  drawMode?: DrawMode;
}

export function GameBoard({ onGameEnd, onGiveUp, drawMode = 3 }: GameBoardProps) {
  const [state, setState] = useState<KlondikeState>(() => {
    const saved = loadFromStorage();
    return saved ? saved.state : createKlondikeGame(drawMode);
  });
  const [history, setHistory] = useState<KlondikeState[]>(() => {
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
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const gameBoardRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(() => computeCardWidth(window.innerWidth));
  const [, forceRender] = useState(0);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const gameEndedRef = useRef(false);
  const lastTapRef = useRef<{ source: string; cardIndex: number; time: number } | null>(null);

  const cardH = Math.round(cardW * 1.4);

  // Responsive card width
  useEffect(() => {
    const update = () => setCardW(computeCardWidth(window.innerWidth));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Persist game state
  useEffect(() => {
    if (state.isWon) {
      clearStorage();
    } else {
      saveToStorage(state, history);
    }
  }, [state, history]);

  // Persist elapsed time
  useEffect(() => {
    try {
      localStorage.setItem(ELAPSED_KEY, String(elapsed));
    } catch {}
  }, [elapsed]);

  // Prevent pull-to-refresh on game board
  useEffect(() => {
    const el = gameBoardRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  // Timer: only ticks when document is visible
  useEffect(() => {
    if (state.isWon) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startTicking = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);
    };

    const stopTicking = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) stopTicking();
      else startTicking();
    };

    if (!document.hidden) startTicking();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopTicking();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
            onGameEnd(next);
          }
        } else {
          setAutoCompleting(false);
        }
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [autoCompleting, state, onGameEnd]);

  // Check auto-completable
  useEffect(() => {
    if (!autoCompleting && !state.isWon && isAutoCompletable(state)) {
      setAutoCompleting(true);
    }
  }, [state, autoCompleting]);

  const pushHistory = useCallback((s: KlondikeState) => {
    setHistory(h => [...h, s]);
  }, []);

  const fireGameEnd = useCallback((s: KlondikeState) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    onGameEnd(s);
  }, [onGameEnd]);

  const applyMove = useCallback((newState: KlondikeState | null) => {
    if (!newState) return false;
    pushHistory(state);
    setState(newState);
    if (newState.isWon) fireGameEnd(newState);
    return true;
  }, [state, pushHistory, fireGameEnd]);

  // Drag and drop handler
  const handleDrop = useCallback((source: DragSource, targetElement: Element | null) => {
    if (!targetElement || autoCompleting) return;
    const targetId = targetElement.getAttribute('data-drop-target');
    if (!targetId) return;

    let newState: KlondikeState | null = null;

    if (targetId.startsWith('tableau-')) {
      const toCol = parseInt(targetId.split('-')[1]);
      if (source.source === 'waste') {
        newState = moveWasteToTableau(state, toCol);
      } else if (source.source.startsWith('tableau-')) {
        const fromCol = parseInt(source.source.split('-')[1]);
        newState = moveTableauToTableau(state, fromCol, source.cardIndex, toCol);
      } else if (source.source.startsWith('foundation-')) {
        const fIdx = parseInt(source.source.split('-')[1]);
        newState = moveFoundationToTableau(state, fIdx, toCol);
      }
    } else if (targetId.startsWith('foundation-')) {
      if (source.source === 'waste') {
        newState = moveWasteToFoundation(state);
      } else if (source.source.startsWith('tableau-')) {
        const fromCol = parseInt(source.source.split('-')[1]);
        const col = state.tableau[fromCol];
        if (source.cardIndex === col.length - 1) {
          newState = moveTableauToFoundation(state, fromCol);
        }
      }
    }

    applyMove(newState);
  }, [state, applyMove, autoCompleting]);

  const { dragState, startDrag, setForceUpdate } = useDragAndDrop(handleDrop);

  useEffect(() => {
    setForceUpdate(() => forceRender(c => c + 1));
  }, [setForceUpdate]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setState(s => ({ ...prev, moves: s.moves + 1, undosUsed: s.undosUsed + 1 }));
  }, [history]);

  const handleHint = useCallback(() => {
    const hint = getHint(state);
    if (hint) {
      setHintTarget(hint);
      setState(s => ({ ...s, hintsUsed: s.hintsUsed + 1 }));
      setTimeout(() => setHintTarget(null), 2000);
    }
  }, [state]);

  const handleNewGame = useCallback(() => {
    clearStorage();
    gameEndedRef.current = false;
    setState(createKlondikeGame(drawMode));
    setHistory([]);
    setElapsed(0);
    setSelectedCard(null);
    setAutoCompleting(false);
  }, [drawMode]);

  const handleGiveUp = useCallback(() => {
    setShowGiveUpDialog(false);
    clearStorage();
    const lostState: KlondikeState = { ...state, isWon: false };
    if (onGiveUp) {
      onGiveUp(lostState);
    } else {
      handleNewGame();
    }
  }, [state, onGiveUp, handleNewGame]);

  const handleStockClick = useCallback(() => {
    pushHistory(state);
    setState(drawFromStock(state));
    setSelectedCard(null);
  }, [state, pushHistory]);

  const handleCardClick = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting) return;
    if (dragState.isDragging) return;

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
      let newState: KlondikeState | null = null;
      const target = source;

      if (target.startsWith('tableau-')) {
        const toCol = parseInt(target.split('-')[1]);
        if (selectedCard.source === 'waste') {
          newState = moveWasteToTableau(state, toCol);
        } else if (selectedCard.source.startsWith('tableau-')) {
          const fromCol = parseInt(selectedCard.source.split('-')[1]);
          newState = moveTableauToTableau(state, fromCol, selectedCard.cardIndex, toCol);
        } else if (selectedCard.source.startsWith('foundation-')) {
          const fIdx = parseInt(selectedCard.source.split('-')[1]);
          newState = moveFoundationToTableau(state, fIdx, toCol);
        }
      }

      if (newState) {
        pushHistory(state);
        setState(newState);
        if (newState.isWon) fireGameEnd(newState);
      }
      setSelectedCard(null);
      return;
    }

    setSelectedCard({ source, cardIndex });
  }, [selectedCard, state, pushHistory, fireGameEnd, autoCompleting, dragState.isDragging]);

  // Smart auto-move on double-tap: foundation → tableau (prefer most face-up) → empty col (kings only)
  const handleDoubleTap = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting) return;
    setSelectedCard(null);

    // Only single cards (top of pile)
    if (source.startsWith('tableau-')) {
      const col = parseInt(source.split('-')[1]);
      if (cardIndex !== state.tableau[col].length - 1) return;
    }

    // Get the card
    let card: import('@/game/types').Card | null = null;
    if (source === 'waste' && state.waste.length > 0) {
      card = state.waste[state.waste.length - 1];
    } else if (source.startsWith('tableau-')) {
      const col = parseInt(source.split('-')[1]);
      const column = state.tableau[col];
      if (column.length > 0) card = column[column.length - 1];
    } else if (source.startsWith('foundation-')) {
      const fIdx = parseInt(source.split('-')[1]);
      const pile = state.foundation[fIdx];
      if (pile.length > 0) card = pile[pile.length - 1];
    }
    if (!card || !card.faceUp) return;

    let newState: KlondikeState | null = null;

    // Priority 1: Foundation
    if (source === 'waste') {
      newState = moveWasteToFoundation(state);
    } else if (source.startsWith('tableau-')) {
      const col = parseInt(source.split('-')[1]);
      newState = moveTableauToFoundation(state, col);
    }
    if (newState) { applyMove(newState); return; }

    // Priority 2: Tableau card on another card (prefer column with most face-up cards)
    const sortedCols = state.tableau
      .map((col, i) => ({ col, i, faceUp: col.filter(c => c.faceUp).length }))
      .filter(c => c.col.length > 0)
      .sort((a, b) => b.faceUp - a.faceUp);

    for (const { i: toCol } of sortedCols) {
      if (source === `tableau-${toCol}`) continue;
      let attempt: KlondikeState | null = null;
      if (source === 'waste') attempt = moveWasteToTableau(state, toCol);
      else if (source.startsWith('tableau-')) {
        const fromCol = parseInt(source.split('-')[1]);
        attempt = moveTableauToTableau(state, fromCol, cardIndex, toCol);
      } else if (source.startsWith('foundation-')) {
        const fIdx = parseInt(source.split('-')[1]);
        attempt = moveFoundationToTableau(state, fIdx, toCol);
      }
      if (attempt) { applyMove(attempt); return; }
    }

    // Priority 3: Empty column (kings only in Klondike)
    if (card.rank === 'K') {
      for (let i = 0; i < 7; i++) {
        if (state.tableau[i].length === 0 && source !== `tableau-${i}`) {
          let attempt: KlondikeState | null = null;
          if (source === 'waste') attempt = moveWasteToTableau(state, i);
          else if (source.startsWith('tableau-')) {
            const fromCol = parseInt(source.split('-')[1]);
            attempt = moveTableauToTableau(state, fromCol, cardIndex, i);
          } else if (source.startsWith('foundation-')) {
            const fIdx = parseInt(source.split('-')[1]);
            attempt = moveFoundationToTableau(state, fIdx, i);
          }
          if (attempt) { applyMove(attempt); return; }
        }
      }
    }
  }, [state, applyMove, autoCompleting]);

  const handleEmptyTableauClick = useCallback((colIndex: number) => {
    if (!selectedCard || autoCompleting) return;
    let newState: KlondikeState | null = null;

    if (selectedCard.source === 'waste') {
      newState = moveWasteToTableau(state, colIndex);
    } else if (selectedCard.source.startsWith('tableau-')) {
      const fromCol = parseInt(selectedCard.source.split('-')[1]);
      newState = moveTableauToTableau(state, fromCol, selectedCard.cardIndex, colIndex);
    }

    if (newState) {
      pushHistory(state);
      setState(newState);
    }
    setSelectedCard(null);
  }, [selectedCard, state, pushHistory, autoCompleting]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const isHighlighted = (source: string) => {
    if (hintTarget) return hintTarget.from === source || hintTarget.to === source;
    if (selectedCard) return selectedCard.source === source;
    return false;
  };

  const boardWidth = cardW * COLS + COL_GAP * (COLS - 1);

  const wasteVisible = state.drawMode === 3
    ? state.waste.slice(-3)
    : state.waste.slice(-1);
  const wasteFanOffset = Math.round(cardW * 0.28);

  const FACE_DOWN_OFFSET = 12;
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
          }`}>
            {state.difficulty}
          </span>
          <span className="flex items-center gap-1 text-xs">
            <Layers className="w-3 h-3" />
            Draw {state.drawMode}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleHint} className="h-8 px-2">
            <Lightbulb className="w-4 h-4" />
            <span className="text-xs ml-1 hidden sm:inline">Hint</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={history.length === 0} className="h-8 px-2">
            <Undo2 className="w-4 h-4" />
            <span className="text-xs ml-1 hidden sm:inline">Undo</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNewGame} className="h-8 px-2">
            <RotateCcw className="w-4 h-4" />
            <span className="text-xs ml-1 hidden sm:inline">New</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGiveUpDialog(true)}
            className="h-8 px-2 text-destructive hover:text-destructive"
          >
            <X className="w-4 h-4" />
            <span className="text-xs ml-1 hidden sm:inline">Give Up</span>
          </Button>
        </div>
      </div>

      {/* Game area with inner shadow */}
      <div
        className="flex-1 flex flex-col items-center pt-3 pb-4 overflow-auto"
        style={{
          padding: `12px ${SIDE_PAD}px 16px`,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ width: boardWidth, maxWidth: '100%' }}>
          {/* Top row: Stock, Waste, spacer, Foundations */}
          <div className="flex items-start mb-4" style={{ gap: COL_GAP }}>
            {/* Stock */}
            <div className="flex-shrink-0">
              {state.stock.length > 0 ? (
                <PlayingCard
                  card={{ ...state.stock[state.stock.length - 1], faceUp: false } as any}
                  onClick={handleStockClick}
                  cardWidth={cardW}
                />
              ) : (
                <EmptyPile onClick={handleStockClick} variant="stock-empty" cardWidth={cardW} />
              )}
            </div>

            {/* Waste - fanned for draw-3 */}
            <div
              className={`flex-shrink-0 relative ${isHighlighted('waste') ? 'ring-2 ring-primary rounded-lg' : ''}`}
              style={{ width: cardW + (wasteVisible.length - 1) * wasteFanOffset, height: cardH }}
              data-drop-target="waste"
            >
              {wasteVisible.length > 0 ? (
                wasteVisible.map((card, i) => {
                  const isTop = i === wasteVisible.length - 1;
                  return (
                    <div
                      key={card.id}
                      className="absolute top-0"
                      style={{
                        left: i * wasteFanOffset,
                        zIndex: i,
                      }}
                      onPointerDown={isTop ? (e) => startDrag(e, 'waste', 0) : undefined}
                    >
                      <PlayingCard
                        card={card}
                        onClick={isTop && !dragState.isDragging ? () => handleCardClick('waste', 0) : undefined}
                        onDoubleClick={isTop ? () => handleDoubleClick('waste', 0) : undefined}
                        cardWidth={cardW}
                      />
                    </div>
                  );
                })
              ) : (
                <EmptyPile cardWidth={cardW} />
              )}
            </div>

            <div className="flex-1" />

            {/* Foundations */}
            {state.foundation.map((pile, i) => (
              <div
                key={i}
                className={`flex-shrink-0 ${isHighlighted(`foundation-${i}`) ? 'ring-2 ring-primary rounded-lg' : ''}`}
                data-drop-target={`foundation-${i}`}
              >
                {pile.length > 0 ? (
                  <div
                    onPointerDown={(e) => startDrag(e, `foundation-${i}`, pile.length - 1)}
                  >
                    <PlayingCard
                      card={pile[pile.length - 1]}
                      onClick={() => !dragState.isDragging && handleCardClick(`foundation-${i}`, pile.length - 1)}
                      cardWidth={cardW}
                    />
                  </div>
                ) : (
                  <EmptyPile label={['♥', '♦', '♣', '♠'][i]} variant="foundation" cardWidth={cardW} />
                )}
              </div>
            ))}
          </div>

          {/* Tableau */}
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
                    const offset = card.faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
                    let top = 0;
                    for (let k = 0; k < cardIdx; k++) {
                      top += col[k].faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
                    }
                    const isSelected = selectedCard?.source === `tableau-${colIdx}` && cardIdx >= selectedCard.cardIndex;
                    return (
                      <div
                        key={card.id}
                        className="absolute"
                        style={{
                          top,
                          left: 0,
                        }}
                        onPointerDown={card.faceUp ? (e) => startDrag(e, `tableau-${colIdx}`, cardIdx) : undefined}
                      >
                        <PlayingCard
                          card={card}
                          onClick={card.faceUp && !dragState.isDragging ? () => handleCardClick(`tableau-${colIdx}`, cardIdx) : undefined}
                          onDoubleClick={card.faceUp ? () => handleDoubleClick(`tableau-${colIdx}`, cardIdx) : undefined}
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

      {/* Win overlay — stays until user acts */}
      <AnimatePresence>
        {state.isWon && (
          <motion.div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl p-8 text-center max-w-sm mx-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">You Won!</h2>
              <div className="space-y-1 text-sm text-muted-foreground mb-6">
                <p>Time: {formatTime(elapsed)}</p>
                <p>Moves: {state.moves}</p>
                <p>Difficulty: {state.difficulty}</p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => onGameEnd(state)}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Home
                </Button>
                <Button
                  onClick={handleNewGame}
                  className="flex-1 bg-rating-up hover:bg-rating-up/90 text-white"
                >
                  Play Again
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Give Up confirmation dialog */}
      <AlertDialog open={showGiveUpDialog} onOpenChange={setShowGiveUpDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Give up this game?</AlertDialogTitle>
            <AlertDialogDescription>
              Your rating will take a small penalty.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGiveUp}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Give Up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
