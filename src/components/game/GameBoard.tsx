import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameTooltips } from '@/components/onboarding/GameTooltips';
import { useAuth } from '@/contexts/AuthContext';
import { KlondikeState, DrawMode, Card } from '@/game/types';
import {
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveTableauToFoundation,
  moveTableauToTableau,
  moveFoundationToTableau,
  isAutoCompletable,
  autoCompleteStep,
  getProgressiveHint,
} from '@/game/klondike';
import { createVerifiedKlondikeGame } from '@/game/solver';
import { getKlondikeAutoSend, applyKlondikeAutoSend } from '@/game/autoSend';
import { PlayingCard, EmptyPile } from './PlayingCard';
import { dragManager, DragSource } from '@/game/DragManager';
import { isKlondikeStuck } from '@/game/stuckDetector';
import { WinProbabilityBar } from './WinProbabilityBar';
import { GameActionBar } from './GameActionBar';
import { useMCTSWorker } from '@/hooks/useMCTSWorker';
import { registerDeal } from '@/services/DealRegistrationService';
import { Timer, Hash, Trophy, Layers, X, ArrowLeft, RotateCcw, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
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
  onGameEnd: (state: KlondikeState, elapsedSeconds: number) => void;
  onGiveUp?: (state: KlondikeState, elapsedSeconds: number) => void;
  drawMode?: DrawMode;
  initialSeed?: number;
  dealUuid?: string;
}

export function GameBoard({ onGameEnd, onGiveUp, drawMode = 3, initialSeed, dealUuid }: GameBoardProps) {
  const [state, setState] = useState<KlondikeState>(() => {
    if (initialSeed !== undefined) {
      try {
        const game = createVerifiedKlondikeGame(drawMode, initialSeed);
        return { ...game, dealUuid };
      } catch (e) {
        console.error(e);
        toast.error('Failed to generate deal. Retrying...');
        const game = createVerifiedKlondikeGame(drawMode);
        return { ...game, dealUuid };
      }
    }
    const saved = loadFromStorage();
    if (saved) return saved.state;
    try {
      return { ...createVerifiedKlondikeGame(drawMode), dealUuid };
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate deal. Retrying...');
      return { ...createVerifiedKlondikeGame(drawMode), dealUuid };
    }
  });
  const [history, setHistory] = useState<KlondikeState[]>(() => {
    if (initialSeed !== undefined) return [];
    const saved = loadFromStorage();
    return saved ? saved.history : [];
  });
  const [elapsed, setElapsed] = useState(() => {
    if (initialSeed !== undefined) return 0;
    try {
      const saved = localStorage.getItem(ELAPSED_KEY);
      return saved ? parseInt(saved, 10) : 0;
    } catch { return 0; }
  });
  const [gameStarted, setGameStarted] = useState(() => {
    if (initialSeed !== undefined) return false;
    const saved = loadFromStorage();
    return saved ? saved.state.moves > 0 : false;
  });
  const [selectedCard, setSelectedCard] = useState<{ source: string; cardIndex: number } | null>(null);
  const [hintTarget, setHintTarget] = useState<{ from: string; to: string } | null>(null);
  const [autoCompleting, setAutoCompleting] = useState(false);
  const [showGiveUpDialog, setShowGiveUpDialog] = useState(false);
  const [showStuckModal, setShowStuckModal] = useState(false);
  const [stuckDismissedAtMove, setStuckDismissedAtMove] = useState(-1);
  const [autoSendChain, setAutoSendChain] = useState(false);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const gameBoardRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(() => computeCardWidth(window.innerWidth));
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const gameEndedRef = useRef(false);

  const cardH = Math.round(cardW * 1.4);

  // MCTS integration
  const mcts = useMCTSWorker();
  const [winProbability, setWinProbability] = useState<number | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintJustUsed, setHintJustUsed] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastMoveTimeRef = useRef(Date.now());
  const { profile: authProfile } = useAuth();

  // Responsive card width
  useEffect(() => {
    const update = () => setCardW(computeCardWidth(window.innerWidth));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Persist game state
  useEffect(() => {
    if (initialSeed !== undefined) return; // Don't persist challenge games
    if (state.isWon) {
      clearStorage();
    } else {
      saveToStorage(state, history);
    }
  }, [state, history, initialSeed]);

  // Register deal in Supabase (only for deals without a dealUuid from the queue)
  useEffect(() => {
    if (state.dealUuid) return;
    if (state.seed !== undefined) {
      registerDeal({
        seed: state.seed,
        gameMode: 'klondike',
        drawMode,
        minMoves: state.minMoves || 0,
        difficultyScore: state.difficultyScore,
      }).then(id => {
        if (id) setState(s => ({ ...s, dealUuid: id }));
      });
    }
  }, [state.dealId, state.dealUuid]);

  // Persist elapsed time
  useEffect(() => {
    if (initialSeed !== undefined) return;
    try {
      localStorage.setItem(ELAPSED_KEY, String(elapsed));
    } catch {}
  }, [elapsed, initialSeed]);

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

  // Timer: only ticks when game started and document visible
  useEffect(() => {
    if (state.isWon || !gameStarted) return;

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
  }, [state.isWon, gameStarted]);

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

  // Stuck detection
  useEffect(() => {
    if (state.isWon || autoCompleting) return;
    if (stuckDismissedAtMove >= 0 && state.moves - stuckDismissedAtMove < 5) return;

    if (isKlondikeStuck(state)) {
      stuckTimerRef.current = setTimeout(() => {
        setShowStuckModal(true);
      }, 1500);
      return () => { if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current); };
    }
  }, [state, autoCompleting, stuckDismissedAtMove]);

  const pushHistory = useCallback((s: KlondikeState) => {
    setHistory(h => [...h, s]);
  }, []);

  const fireGameEnd = useCallback((s: KlondikeState) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    onGameEnd(s, elapsedRef.current);
  }, [onGameEnd]);

  const applyMove = useCallback((newState: KlondikeState | null, triggersAutoSend = false) => {
    if (!newState) return false;
    if (!gameStarted) setGameStarted(true);
    pushHistory(state);
    setState(newState);
    if (triggersAutoSend) {
      setAutoSendChain(true);
      haptic.medium();
    } else {
      haptic.light();
    }
    if (newState.isWon) {
      haptic.success();
      fireGameEnd(newState);
    }
    return true;
  }, [state, pushHistory, fireGameEnd, gameStarted]);

  // Auto-send chain: after user initiates a foundation move, scan for more
  useEffect(() => {
    if (!autoSendChain || state.isWon || autoCompleting || !gameStarted) return;
    if (dragManager.isDragging) return;

    const info = getKlondikeAutoSend(state);
    if (!info) {
      setAutoSendChain(false);
      return;
    }

    const timer = setTimeout(() => {
      pushHistory(state);
      setState(s => {
        const result = applyKlondikeAutoSend(s, info);
        if (result.isWon && !gameEndedRef.current) {
          gameEndedRef.current = true;
          onGameEnd(result, elapsedRef.current);
        }
        return { ...result, moves: s.moves + 1 };
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [state, autoSendChain, autoCompleting, gameStarted, onGameEnd, pushHistory]);

  // Drag and drop handler
  const handleDrop = useCallback((source: DragSource, targetId: string | null) => {
    if (!targetId || autoCompleting) return;

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

    const isFoundationDrop = targetId.startsWith('foundation-') && newState !== null;
    applyMove(newState, isFoundationDrop);
  }, [state, applyMove, autoCompleting]);

  const dragConfig = useMemo(() => ({
    onDrop: handleDrop,
    multiCardStacks: true,
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

  const handleHint = useCallback(async () => {
    if (hintLoading) return;
    setState(s => ({ ...s, hintsUsed: s.hintsUsed + 1 }));
    setHintJustUsed(true);
    setTimeout(() => setHintJustUsed(false), 3000);

    if (mcts.available) {
      setHintLoading(true);
      const mctsResult = await mcts.requestHint(state, 'klondike', 50);
      setHintLoading(false);

      if (mctsResult?.bestMove) {
        const move = mctsResult.bestMove;
        setHintTarget({ from: move.from, to: move.to });

        // Update win probability from hint result
        if (mctsResult.winRate !== undefined) {
          setWinProbability(mctsResult.winRate);
        }

        setTimeout(() => setHintTarget(null), 2000);
        return;
      }
    }

    // Fallback to basic hint
    const result = getProgressiveHint(state, history);
    if ('noHint' in result) {
      toast(result.message);
    } else {
      setHintTarget(result);
      setTimeout(() => setHintTarget(null), 2000);
    }
  }, [state, history, mcts, hintLoading]);

  // Win probability idle trigger
  useEffect(() => {
    lastMoveTimeRef.current = Date.now();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!mcts.available || state.isWon || state.moves < 5) return;

    idleTimerRef.current = setTimeout(async () => {
      const prob = await mcts.requestWinProbability(state, 'klondike', 30);
      if (prob !== null) setWinProbability(prob);
    }, 3000);

    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [state.moves, state.isWon, mcts]);

  const handleNewGame = useCallback(() => {
    clearStorage();
    gameEndedRef.current = false;
    try {
      setState(createVerifiedKlondikeGame(drawMode));
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate deal');
      setState(createVerifiedKlondikeGame(drawMode));
    }
    setHistory([]);
    setElapsed(0);
    setGameStarted(false);
    setSelectedCard(null);
    setAutoCompleting(false);
    setStuckDismissedAtMove(-1);
  }, [drawMode]);

  const handleGiveUp = useCallback(() => {
    setShowGiveUpDialog(false);
    clearStorage();
    const lostState: KlondikeState = { ...state, isWon: false };
    if (onGiveUp) {
      onGiveUp(lostState, elapsedRef.current);
    } else {
      handleNewGame();
    }
  }, [state, onGiveUp, handleNewGame]);

  const handleStockClick = useCallback(() => {
    if (!gameStarted) setGameStarted(true);
    pushHistory(state);
    setState(drawFromStock(state));
    setSelectedCard(null);
  }, [state, pushHistory, gameStarted]);

  // Single-click auto-move: foundation first, then tableau, then empty col
  const handleAutoMove = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting) return;
    setSelectedCard(null);

    let card: Card | null = null;
    let isStack = false;

    if (source.startsWith('tableau-')) {
      const colIdx = parseInt(source.split('-')[1]);
      const col = state.tableau[colIdx];
      if (cardIndex < 0 || cardIndex >= col.length) return;
      card = col[cardIndex];
      if (!card || !card.faceUp) return;
      isStack = cardIndex < col.length - 1;
      for (let i = cardIndex; i < col.length; i++) {
        if (!col[i].faceUp) return;
      }
    } else if (source === 'waste' && state.waste.length > 0) {
      card = state.waste[state.waste.length - 1];
    } else if (source.startsWith('foundation-')) {
      const fIdx = parseInt(source.split('-')[1]);
      const pile = state.foundation[fIdx];
      if (pile.length > 0) card = pile[pile.length - 1];
    }
    if (!card || !card.faceUp) return;

    let newState: KlondikeState | null = null;

    // Priority 1: Foundation (single cards only) - triggers auto-send chain
    if (!isStack) {
      if (source === 'waste') {
        newState = moveWasteToFoundation(state);
      } else if (source.startsWith('tableau-')) {
        const colIdx = parseInt(source.split('-')[1]);
        newState = moveTableauToFoundation(state, colIdx);
      }
      if (newState) { applyMove(newState, true); return; }
    }

    // Priority 2: Tableau on another card (prefer most face-up cards)
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

    // Priority 3: Empty column
    for (let i = 0; i < 7; i++) {
      if (state.tableau[i].length === 0 && source !== `tableau-${i}`) {
        if (!isStack && card.rank !== 'K') continue;
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
  }, [state, applyMove, autoCompleting]);

  const handleCardClick = useCallback((source: string, cardIndex: number) => {
    if (autoCompleting) return;
    if (dragManager.isDragging || dragManager.wasDragAction()) return;

    // Single click: auto-move the card
    handleAutoMove(source, cardIndex);
  }, [autoCompleting, handleAutoMove]);

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
      className="flex flex-col"
      style={{
        height: '100dvh',
        background: '#f1f5f9',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
    >
      {/* Top bar — simplified: timer left, moves+difficulty center, give up right */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/80 backdrop-blur-sm"
        style={{ paddingTop: 'calc(12px + var(--safe-area-top, 0px))' }}
      >
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Timer className="w-3.5 h-3.5" />
          <span>{formatTime(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{state.moves}</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            state.difficulty === 'Easy' ? 'bg-rating-up/20 text-rating-up' :
            state.difficulty === 'Medium' ? 'bg-gold/20 text-gold' :
            state.difficulty === 'Hard' ? 'bg-destructive/20 text-destructive' :
            'bg-elite/20 text-elite'
          }`}>{state.difficulty}</span>
          <span className="flex items-center gap-1 text-xs">
            <Layers className="w-3 h-3" />D{state.drawMode}
          </span>
          {(authProfile as any)?.current_streak >= 2 && (
            <span className="flex items-center gap-0.5 text-xs">
              <Flame className="w-3 h-3 text-destructive" />
              <span className="font-mono font-bold">{(authProfile as any)?.current_streak}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleNewGame} className="h-8 px-2">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGiveUpDialog(true)}
            className="h-8 px-2 text-destructive hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Win probability bar */}
      <WinProbabilityBar
        probability={winProbability}
        visible={mcts.available && !state.isWon && state.moves >= 5}
      />

      {/* Game area */}
      <div
        className="flex-1 flex flex-col items-center overflow-auto"
        style={{
          padding: `12px ${SIDE_PAD}px calc(136px + var(--safe-area-bottom, 0px))`,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
          WebkitOverflowScrolling: 'touch',
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

            {/* Waste */}
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
                      style={{ left: i * wasteFanOffset, zIndex: i }}
                      onPointerDown={isTop ? (e) => startDrag(e, 'waste', 0) : undefined}
                    >
                      <PlayingCard
                        card={card}
                        onClick={isTop && !dragManager.isDragging ? () => handleCardClick('waste', 0) : undefined}
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
                    let top = 0;
                    for (let k = 0; k < cardIdx; k++) {
                      top += col[k].faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
                    }
                    const isSelected = selectedCard?.source === `tableau-${colIdx}` && cardIdx >= selectedCard.cardIndex;
                    return (
                      <div
                        key={card.id}
                        className="absolute"
                        style={{ top, left: 0 }}
                        onPointerDown={card.faceUp ? (e) => startDrag(e, `tableau-${colIdx}`, cardIdx) : undefined}
                      >
                        <PlayingCard
                          card={card}
                          onClick={card.faceUp && !dragManager.isDragging ? () => handleCardClick(`tableau-${colIdx}`, cardIdx) : undefined}
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

      {/* Bottom action bar */}
      {!state.isWon && (
        <GameActionBar
          onHint={handleHint}
          onUndo={handleUndo}
          undoDisabled={history.length === 0}
          moveCount={state.moves}
          hintLoading={hintLoading}
        />
      )}

      <GameTooltips
        gamesPlayed={authProfile?.games_played ?? 0}
        moveCount={state.moves}
        hintJustUsed={hintJustUsed}
        gameWon={state.isWon}
      />


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
                <Button variant="outline" onClick={() => fireGameEnd(state)} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Home
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
            <Button onClick={handleStuckUndo}>Undo moves</Button>
            <Button variant="secondary" onClick={handleStuckNewDeal}>New deal</Button>
            <Button variant="ghost" onClick={() => {
              setShowStuckModal(false);
              setStuckDismissedAtMove(state.moves);
            }}>Keep trying</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
