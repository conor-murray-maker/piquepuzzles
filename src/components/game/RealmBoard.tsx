import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { RealmState, CellState, createRealmGame, cycleCell, toggleMark, getRealmHint } from '@/game/realm';
import { supabase } from '@/integrations/supabase/client';
import { CrownIcon } from './CrownIcon';
import { GameActionBar } from './GameActionBar';
import { registerDeal } from '@/services/DealRegistrationService';
import { PuzzleIQBadge } from './PuzzleIQBadge';
import { X, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

const STORAGE_KEY = 'pique-realm-state';
const HISTORY_KEY = 'pique-realm-history';
const ELAPSED_KEY = 'pique-realm-elapsed';

function saveToStorage(state: RealmState, history: RealmState[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function loadFromStorage(): { state: RealmState; history: RealmState[] } | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s);
    if (!parsed || parsed.isWon || (parsed.errors >= parsed.maxErrors)) {
      clearRealmStorage();
      return null;
    }
    const h = localStorage.getItem(HISTORY_KEY);
    const history = h ? JSON.parse(h) : [];
    return { state: parsed, history: Array.isArray(history) ? history : [] };
  } catch {
    clearRealmStorage();
    return null;
  }
}

export function clearRealmStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(ELAPSED_KEY);
}

interface RealmBoardProps {
  onGameEnd: (state: RealmState, elapsedSeconds: number) => void;
  onGiveUp?: (state: RealmState, elapsedSeconds: number) => void;
  initialSeed?: number;
  dealUuid?: string;
}

const DRAG_HOLD_MS = 150;

export function RealmBoard({ onGameEnd, onGiveUp, initialSeed, dealUuid }: RealmBoardProps) {
  const [state, setState] = useState<RealmState>(() => {
    if (initialSeed !== undefined) {
      const fresh = createRealmGame(initialSeed);
      return { ...fresh, dealUuid };
    }
    const saved = loadFromStorage();
    if (saved) return saved.state;
    const fresh = createRealmGame();
    return { ...fresh, dealUuid };
  });
  const [history, setHistory] = useState<RealmState[]>(() => {
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
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set());
  const [hintCell, setHintCell] = useState<{ row: number; col: number } | null>(null);
  const [showGiveUpDialog, setShowGiveUpDialog] = useState(false);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const gameEndedRef = useRef(false);
  const completedGameIdRef = useRef<string | null>(null);
  const { profile } = useAuth();

  // Drag-to-mark state
  const dragStateRef = useRef<{
    active: boolean;
    holdTimer: ReturnType<typeof setTimeout> | null;
    startCell: { row: number; col: number } | null;
    markedCells: Set<string>;
    pointerId: number;
    mode: 'mark' | 'unmark' | null;
    preState: RealmState | null;
  }>({
    active: false, holdTimer: null, startCell: null, markedCells: new Set(),
    pointerId: -1, mode: null, preState: null,
  });

  // Reset gameEndedRef when game changes
  useEffect(() => {
    gameEndedRef.current = false;
    completedGameIdRef.current = null;
  }, [state.gameId]);

  // Register deal
  useEffect(() => {
    if (state.dealUuid) return;
    if (state.seed !== undefined) {
      registerDeal({
        seed: state.seed,
        gameMode: 'realm',
        drawMode: 0,
        minMoves: state.minMoves || 0,
        difficultyScore: state.difficultyScore,
      }).then(id => {
        if (id) setState(s => ({ ...s, dealUuid: id }));
      });
    }
  }, [state.dealId, state.dealUuid]);

  // Fetch puzzle name
  useEffect(() => {
    if (state.puzzleName || !state.regions) return;
    supabase.functions.invoke('name-realm-puzzle', {
      body: { regions: state.regions, size: state.size },
    }).then(({ data }) => {
      if (data?.name) setState(s => ({ ...s, puzzleName: data.name }));
    }).catch(() => {
      setState(s => ({ ...s, puzzleName: `${s.size}×${s.size} ${s.difficulty}` }));
    });
  }, [state.puzzleName, state.regions, state.size]);

  // Save state
  useEffect(() => {
    if (initialSeed !== undefined) return;
    if (state.isWon || state.errors >= state.maxErrors) clearRealmStorage();
    else saveToStorage(state, history);
  }, [state, history, initialSeed]);

  useEffect(() => {
    if (initialSeed !== undefined) return;
    try { localStorage.setItem(ELAPSED_KEY, String(elapsed)); } catch {}
  }, [elapsed, initialSeed]);

  // Timer
  useEffect(() => {
    if (state.isWon || state.errors >= state.maxErrors || !gameStarted) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!intervalId) intervalId = setInterval(() => setElapsed(e => e + 1), 1000); };
    const stop = () => { if (intervalId) { clearInterval(intervalId); intervalId = null; } };
    const handleVis = () => { document.hidden ? stop() : start(); };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVis);
    return () => { stop(); document.removeEventListener('visibilitychange', handleVis); };
  }, [state.isWon, state.errors, state.maxErrors, gameStarted]);

  // Check loss on 3 errors
  useEffect(() => {
    if (state.errors >= state.maxErrors && !state.isWon && !gameEndedRef.current) {
      if (completedGameIdRef.current === state.gameId) return;
      gameEndedRef.current = true;
      completedGameIdRef.current = state.gameId;
      clearRealmStorage();
      const lostState = { ...state, isWon: false };
      onGameEnd(lostState, elapsedRef.current);
    }
  }, [state.errors, state.maxErrors, state.isWon, state.gameId, onGameEnd]);

  const handleCellTap = useCallback((row: number, col: number) => {
    if (state.isWon || state.errors >= state.maxErrors) return;
    if (!gameStarted) setGameStarted(true);

    setHistory(h => [...h, state]);
    const newState = cycleCell(state, row, col);

    if (newState.errors > state.errors) {
      haptic.heavy();
      setErrorCells(prev => new Set(prev).add(`${row},${col}`));
      setTimeout(() => {
        setErrorCells(prev => {
          const next = new Set(prev);
          next.delete(`${row},${col}`);
          return next;
        });
        setState(s => {
          const grid = s.grid.map(r => r.map(c => ({ ...c })));
          grid[row][col].state = 'empty';
          return { ...s, grid };
        });
      }, 1000);
    } else {
      haptic.light();
    }

    setState(newState);

    if (newState.isWon && !gameEndedRef.current) {
      if (completedGameIdRef.current === state.gameId) return;
      gameEndedRef.current = true;
      completedGameIdRef.current = state.gameId;
      haptic.success();
      onGameEnd(newState, elapsedRef.current);
    }
  }, [state, gameStarted, onGameEnd]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    haptic.medium();
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setState(prev);
  }, [history]);

  const handleHint = useCallback(() => {
    haptic.light();
    setState(s => ({ ...s, hintsUsed: s.hintsUsed + 1 }));

    const hint = getRealmHint(state);
    if (!hint) {
      toast('No hints available right now');
      return;
    }

    setHintCell({ row: hint.row, col: hint.col });
    setTimeout(() => setHintCell(null), 2000);

    if (hint.action === 'eliminate') {
      toast('This cell cannot have a crown');
    } else {
      toast('A crown belongs here');
    }
  }, [state]);

  const handleGiveUp = useCallback(() => {
    setShowGiveUpDialog(false);
    haptic.heavy();
    clearRealmStorage();
    const lostState: RealmState = { ...state, isWon: false };
    if (onGiveUp) onGiveUp(lostState, elapsedRef.current);
  }, [state, onGiveUp]);

  // Cell sizing
  const [cellSize, setCellSize] = useState(48);
  useEffect(() => {
    const updateSize = () => {
      const maxW = Math.min(window.innerWidth - 32, 480);
      const maxH = window.innerHeight - 240;
      const maxDim = Math.min(maxW, maxH);
      const size = Math.max(36, Math.floor(maxDim / state.size));
      setCellSize(size);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [state.size]);

  // Drag-to-mark handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, row: number, col: number) => {
    if (state.isWon || state.errors >= state.maxErrors) return;

    const ds = dragStateRef.current;
    ds.pointerId = e.pointerId;
    ds.startCell = { row, col };
    ds.markedCells = new Set();
    ds.mode = null;
    ds.preState = state;

    ds.holdTimer = setTimeout(() => {
      ds.active = true;
      if (!gameStarted) setGameStarted(true);
      haptic.light();

      // Determine mode from first cell
      const cell = state.grid[row][col];
      if (cell.state === 'crown') return;
      ds.mode = (cell.state === 'marked') ? 'unmark' : 'mark';

      // Apply to first cell
      const key = `${row},${col}`;
      ds.markedCells.add(key);
      setHistory(h => [...h, state]);
      setState(s => toggleMark(s, row, col));
    }, DRAG_HOLD_MS);
  }, [state, gameStarted]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds.active || e.pointerId !== ds.pointerId) return;

    // Find which cell the pointer is over
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = el?.closest('[data-realm-cell]') as HTMLElement | null;
    if (!cellEl) return;

    const cellRow = parseInt(cellEl.dataset.realmRow || '-1');
    const cellCol = parseInt(cellEl.dataset.realmCol || '-1');
    if (cellRow < 0 || cellCol < 0) return;

    const key = `${cellRow},${cellCol}`;
    if (ds.markedCells.has(key)) return;

    ds.markedCells.add(key);
    setState(s => {
      const cell = s.grid[cellRow][cellCol];
      if (cell.state === 'crown') return s;
      if (ds.mode === 'mark' && (cell.state === 'empty' || cell.state === 'auto-marked')) {
        return toggleMark(s, cellRow, cellCol);
      }
      if (ds.mode === 'unmark' && cell.state === 'marked') {
        return toggleMark(s, cellRow, cellCol);
      }
      return s;
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragStateRef.current;
    if (ds.holdTimer) {
      clearTimeout(ds.holdTimer);
      ds.holdTimer = null;
    }

    if (!ds.active && ds.startCell) {
      // Was a tap, not a drag — handle as cell tap
      handleCellTap(ds.startCell.row, ds.startCell.col);
    }

    ds.active = false;
    ds.startCell = null;
    ds.mode = null;
    ds.preState = null;
  }, [handleCellTap]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const crownsPlaced = state.grid.flat().filter(c => c.state === 'crown').length;

  return (
    <div
      className="bg-background flex flex-col items-center"
      style={{
        height: '100dvh',
        paddingTop: 'calc(8px + var(--safe-area-top, 0px))',
        paddingBottom: 'calc(124px + var(--safe-area-bottom, 0px))',
      }}
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setShowGiveUpDialog(true)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground font-medium">
            Realm {state.puzzleName ? `— ${state.puzzleName}` : ''}
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono">{formatTime(elapsed)}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              state.difficulty === 'Easy' ? 'bg-rating-up/20 text-rating-up' :
              state.difficulty === 'Medium' ? 'bg-gold/20 text-gold' :
              state.difficulty === 'Hard' ? 'bg-destructive/20 text-destructive' :
              'bg-elite/20 text-elite'
            }`}>
              {state.size}×{state.size} {state.difficulty}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <PuzzleIQBadge rating={profile?.rating ?? 1000} size="sm" />
        </div>
      </div>

      {/* Crown counter */}
      <div className="flex items-center gap-2 py-2">
        {Array.from({ length: state.size }, (_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              i < crownsPlaced
                ? 'border-primary bg-primary/20'
                : 'border-muted-foreground/30'
            }`}
          >
            {i < crownsPlaced && <CrownIcon size={12} />}
          </div>
        ))}
        {state.errors > 0 && (
          <span className="text-xs text-destructive ml-2">
            {state.errors}/{state.maxErrors} errors
          </span>
        )}
      </div>

      {/* Grid */}
      <div
        className="relative touch-none"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${state.size}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${state.size}, ${cellSize}px)`,
          gap: '0px',
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {state.grid.flat().map((cell) => {
          const isError = errorCells.has(`${cell.row},${cell.col}`);
          const isHint = hintCell?.row === cell.row && hintCell?.col === cell.col;
          const color = state.regionColors[cell.region];

          const borderTop = cell.row === 0 || state.grid[cell.row - 1]?.[cell.col]?.region !== cell.region;
          const borderLeft = cell.col === 0 || state.grid[cell.row][cell.col - 1]?.region !== cell.region;
          const borderBottom = cell.row === state.size - 1 || state.grid[cell.row + 1]?.[cell.col]?.region !== cell.region;
          const borderRight = cell.col === state.size - 1 || state.grid[cell.row]?.[cell.col + 1]?.region !== cell.region;

          return (
            <motion.div
              key={`${cell.row}-${cell.col}`}
              data-realm-cell
              data-realm-row={cell.row}
              data-realm-col={cell.col}
              onPointerDown={(e) => handlePointerDown(e, cell.row, cell.col)}
              className="relative flex items-center justify-center select-none"
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: `${color}30`,
                borderTop: borderTop ? `3px solid ${color}` : '1px solid #d1d5db',
                borderLeft: borderLeft ? `3px solid ${color}` : '1px solid #d1d5db',
                borderBottom: borderBottom ? `3px solid ${color}` : '1px solid #d1d5db',
                borderRight: borderRight ? `3px solid ${color}` : '1px solid #d1d5db',
                boxShadow: isError ? 'inset 0 0 0 2px #ef4444' : isHint ? 'inset 0 0 0 2px #3b82f6' : 'none',
              }}
              animate={isError ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {cell.state === 'crown' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                >
                  <CrownIcon size={Math.round(cellSize * 0.55)} />
                </motion.div>
              )}
              {cell.state === 'marked' && (
                <X className="text-muted-foreground" size={Math.round(cellSize * 0.35)} strokeWidth={2.5} />
              )}
              {cell.state === 'auto-marked' && (
                <X className="text-muted-foreground/30" size={Math.round(cellSize * 0.3)} strokeWidth={2} />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Action bar */}
      <GameActionBar
        onHint={handleHint}
        onUndo={handleUndo}
        undoDisabled={history.length === 0}
        moveCount={state.moves}
      />

      {/* Give up dialog */}
      <AlertDialog open={showGiveUpDialog} onOpenChange={setShowGiveUpDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resign this puzzle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will count as a loss and affect your Puzzle IQ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Playing</AlertDialogCancel>
            <AlertDialogAction onClick={handleGiveUp}>Resign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
