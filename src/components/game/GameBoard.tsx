import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KlondikeState } from '@/game/types';
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
import { Lightbulb, Undo2, RotateCcw, Timer, Hash, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'pique-game-state';
const HISTORY_KEY = 'pique-game-history';

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

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(HISTORY_KEY);
}

interface GameBoardProps {
  onGameEnd: (state: KlondikeState) => void;
}

export function GameBoard({ onGameEnd }: GameBoardProps) {
  const [state, setState] = useState<KlondikeState>(() => {
    const saved = loadFromStorage();
    return saved ? saved.state : createKlondikeGame(1);
  });
  const [history, setHistory] = useState<KlondikeState[]>(() => {
    const saved = loadFromStorage();
    return saved ? saved.history : [];
  });
  const [elapsed, setElapsed] = useState(0);
  const [selectedCard, setSelectedCard] = useState<{ source: string; cardIndex: number } | null>(null);
  const [hintTarget, setHintTarget] = useState<{ from: string; to: string } | null>(null);
  const [autoCompleting, setAutoCompleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const gameBoardRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  // Persist game state
  useEffect(() => {
    if (state.isWon) {
      clearStorage();
    } else {
      saveToStorage(state, history);
    }
  }, [state, history]);

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

  useEffect(() => {
    const check = () => setCompact(window.innerWidth < 500);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (!state.isWon) setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [state.startTime, state.isWon]);

  // Auto-complete
  useEffect(() => {
    if (autoCompleting && !state.isWon) {
      const timer = setTimeout(() => {
        const next = autoCompleteStep(state);
        if (next) {
          setState(next);
          if (next.isWon) {
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

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setState(s => ({ ...prev, undosUsed: s.undosUsed + 1 }));
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
    setState(createKlondikeGame(1));
    setHistory([]);
    setElapsed(0);
    setSelectedCard(null);
    setAutoCompleting(false);
  }, []);

  const handleStockClick = useCallback(() => {
    pushHistory(state);
    setState(drawFromStock(state));
    setSelectedCard(null);
  }, [state, pushHistory]);

  const handleCardClick = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting) return;

    if (selectedCard) {
      // Try to move selected card to this target
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
        if (newState.isWon) onGameEnd(newState);
      }
      setSelectedCard(null);
      return;
    }

    // Select this card
    setSelectedCard({ source, cardIndex });
  }, [selectedCard, state, pushHistory, onGameEnd, autoCompleting]);

  const handleDoubleClick = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting) return;
    let newState: KlondikeState | null = null;

    if (source === 'waste') {
      newState = moveWasteToFoundation(state);
    } else if (source.startsWith('tableau-')) {
      const col = parseInt(source.split('-')[1]);
      const column = state.tableau[col];
      if (cardIndex === column.length - 1) {
        newState = moveTableauToFoundation(state, col);
      }
    }

    if (newState) {
      pushHistory(state);
      setState(newState);
      if (newState.isWon) onGameEnd(newState);
    }
    setSelectedCard(null);
  }, [state, pushHistory, onGameEnd, autoCompleting]);

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

  const cardW = compact ? 56 : 70;
  const gap = compact ? 3 : 6;
  const boardWidth = cardW * 7 + gap * 6;

  return (
    <div className="game-surface min-h-screen flex flex-col">
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
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 flex flex-col items-center pt-3 pb-4 px-2 overflow-auto">
        <div style={{ width: boardWidth, maxWidth: '100%' }}>
          {/* Top row: Stock, Waste, spacer, Foundations */}
          <div className="flex items-start justify-between mb-4" style={{ gap }}>
            {/* Stock */}
            <div className="flex-shrink-0">
              {state.stock.length > 0 ? (
                <PlayingCard
                  card={{ ...state.stock[state.stock.length - 1], faceUp: false } as any}
                  onClick={handleStockClick}
                  compact={compact}
                />
              ) : (
                <EmptyPile onClick={handleStockClick} label="↻" compact={compact} />
              )}
            </div>

            {/* Waste */}
            <div className={`flex-shrink-0 ${isHighlighted('waste') ? 'ring-2 ring-primary rounded-lg' : ''}`}>
              {state.waste.length > 0 ? (
                <PlayingCard
                  card={state.waste[state.waste.length - 1]}
                  onClick={() => handleCardClick('waste', 0)}
                  onDoubleClick={() => handleDoubleClick('waste', 0)}
                  compact={compact}
                />
              ) : (
                <EmptyPile compact={compact} />
              )}
            </div>

            <div className="flex-1" />

            {/* Foundations */}
            {state.foundation.map((pile, i) => (
              <div key={i} className={`flex-shrink-0 ${isHighlighted(`foundation-${i}`) ? 'ring-2 ring-primary rounded-lg' : ''}`}>
                {pile.length > 0 ? (
                  <PlayingCard
                    card={pile[pile.length - 1]}
                    onClick={() => handleCardClick(`foundation-${i}`, pile.length - 1)}
                    compact={compact}
                  />
                ) : (
                  <EmptyPile label={['♥', '♦', '♣', '♠'][i]} compact={compact} />
                )}
              </div>
            ))}
          </div>

          {/* Tableau */}
          <div className="flex justify-between" style={{ gap }}>
            {state.tableau.map((col, colIdx) => (
              <div
                key={colIdx}
                className={`relative flex-shrink-0 ${isHighlighted(`tableau-${colIdx}`) ? 'ring-2 ring-primary rounded-lg' : ''}`}
                style={{ width: cardW, minHeight: compact ? 120 : 160 }}
              >
                {col.length === 0 ? (
                  <EmptyPile onClick={() => handleEmptyTableauClick(colIdx)} compact={compact} />
                ) : (
                  col.map((card, cardIdx) => {
                    const offset = compact ? (card.faceUp ? 18 : 8) : (card.faceUp ? 22 : 10);
                    const isSelected = selectedCard?.source === `tableau-${colIdx}` && cardIdx >= selectedCard.cardIndex;
                    return (
                      <div
                        key={card.id}
                        className="absolute"
                        style={{ top: cardIdx * offset, left: 0 }}
                      >
                        <PlayingCard
                          card={card}
                          onClick={card.faceUp ? () => handleCardClick(`tableau-${colIdx}`, cardIdx) : undefined}
                          onDoubleClick={card.faceUp ? () => handleDoubleClick(`tableau-${colIdx}`, cardIdx) : undefined}
                          compact={compact}
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
              <Button onClick={handleNewGame} className="w-full">Play Again</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
