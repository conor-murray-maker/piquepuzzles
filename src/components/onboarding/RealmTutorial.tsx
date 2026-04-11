import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CrownIcon } from '@/components/game/CrownIcon';

/*
 * Tutorial puzzle: 4×4 grid with 4 regions (all contiguous).
 *
 * Region A (single cell): (0,1)
 * Region B: (0,2), (0,3), (1,3)
 * Region C: (0,0), (1,0), (1,1), (1,2), (2,0)
 * Region D: (2,1), (2,2), (2,3), (3,0), (3,1), (3,2), (3,3)
 *
 * Solution: A:(0,1) B:(1,3) C:(2,0) D:(3,2)
 *
 * Step flow:
 *   0: Welcome
 *   1: Tap Crown A (single cell) – interactive
 *   2: Row rule (amber row highlight)
 *   3: Column rule (amber col highlight)
 *   4: Tap Crown B – interactive (forced by row elim)
 *   5: Region rule (region B glow after Crown B cascade)
 *   6: Adjacency rule
 *   7: Tap Crown C – guided interactive
 *   8: Tap Crown D – guided interactive
 *   9: Win celebration + handoff
 */

const GRID_SIZE = 4;

const REGION_MAP: number[][] = [
  [2, 0, 1, 1],
  [2, 2, 2, 1],
  [2, 3, 3, 3],
  [3, 3, 3, 3],
];

const REGION_COLORS = ['#FFB5B5', '#B5D5FF', '#B5FFD5', '#FFE5B5'];
const REGION_BORDER_COLORS = ['#E88A8A', '#8AB8E8', '#8AE8B5', '#E8C88A'];

type CellState = 'empty' | 'x' | 'crown';

// ── Staged elimination helpers ──────────────────────────────────

function applyCrown(grid: CellState[][], row: number, col: number): CellState[][] {
  const g = grid.map(r => [...r]);
  g[row][col] = 'crown';
  return g;
}

function applyRowEliminations(grid: CellState[][], row: number, col: number): CellState[][] {
  const g = grid.map(r => [...r]);
  for (let c = 0; c < GRID_SIZE; c++) {
    if (c !== col && g[row][c] === 'empty') g[row][c] = 'x';
  }
  return g;
}

function applyColumnEliminations(grid: CellState[][], row: number, col: number): CellState[][] {
  const g = grid.map(r => [...r]);
  for (let r = 0; r < GRID_SIZE; r++) {
    if (r !== row && g[r][col] === 'empty') g[r][col] = 'x';
  }
  return g;
}

function applyRegionEliminations(grid: CellState[][], row: number, col: number): CellState[][] {
  const g = grid.map(r => [...r]);
  const region = REGION_MAP[row][col];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (REGION_MAP[r][c] === region && !(r === row && c === col) && g[r][c] === 'empty') {
        g[r][c] = 'x';
      }
    }
  }
  return g;
}

function applyAdjacencyEliminations(grid: CellState[][], row: number, col: number): CellState[][] {
  const g = grid.map(r => [...r]);
  for (const [ar, ac] of getAdjacentCells(row, col)) {
    if (g[ar][ac] === 'empty') g[ar][ac] = 'x';
  }
  return g;
}

function applyFullEliminations(grid: CellState[][], row: number, col: number): CellState[][] {
  let g = applyCrown(grid, row, col);
  g = applyRowEliminations(g, row, col);
  g = applyColumnEliminations(g, row, col);
  g = applyRegionEliminations(g, row, col);
  g = applyAdjacencyEliminations(g, row, col);
  return g;
}

function getAdjacentCells(row: number, col: number): [number, number][] {
  const adj: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        adj.push([r, c]);
      }
    }
  }
  return adj;
}

// ── Step definitions ────────────────────────────────────────────

interface TutorialStep {
  title: string;
  text: string;
  cta: string;
  interactiveCell?: [number, number];
  autoAdvance?: boolean;
}

const STEPS: TutorialStep[] = [
  // 0: Welcome
  {
    title: 'Welcome',
    text: 'Find where each crown belongs. One crown per row, column, and colour region.',
    cta: 'Start tutorial',
  },
  // 1: Place crown in single-cell region
  {
    title: 'Single cell region',
    text: 'This region has only one cell. The crown must go here. Tap it.',
    cta: 'Show me',
    interactiveCell: [0, 1],
    autoAdvance: true,
  },
  // 2: Row Xs revealed (staged)
  {
    title: 'Row rule',
    text: 'One crown per row. The rest of this row is eliminated.',
    cta: 'Got it',
  },
  // 3: Column Xs revealed (staged)
  {
    title: 'Column rule',
    text: 'The same goes for columns.',
    cta: 'Got it',
  },
  // 4: Place crown B — forced by elimination
  {
    title: 'Next placement',
    text: 'The top row is eliminated. Only one cell remains in this region. Tap it.',
    cta: 'Show me',
    interactiveCell: [1, 3],
    autoAdvance: true,
  },
  // 5: Region rule — shown after Crown B with region B glow
  {
    title: 'Region rule',
    text: 'Each colour region can also only have one crown. This region is done.',
    cta: 'Got it',
  },
  // 6: Adjacency rule
  {
    title: 'Adjacency',
    text: 'Two crowns cannot touch each other, not even diagonally. The highlighted cells around each crown are off-limits.',
    cta: 'Got it',
  },
  // 7: Place crown C — guided completion
  {
    title: 'Keep going',
    text: 'Only one cell remains in this region. Tap it.',
    cta: 'Place it',
    interactiveCell: [2, 0],
    autoAdvance: true,
  },
  // 8: Place crown D — guided completion
  {
    title: 'Last one',
    text: 'One cell left. Finish the puzzle!',
    cta: 'Place it',
    interactiveCell: [3, 2],
    autoAdvance: true,
  },
  // 9: Win + handoff
  {
    title: 'Solved!',
    text: "You solved it! Every puzzle has a logical path like this. Ready for a real one?",
    cta: 'Play your first game',
  },
];

function createEmptyGrid(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill('empty'));
}

// ── Highlight types ─────────────────────────────────────────────

interface HighlightState {
  rowHighlight: number | null;
  colHighlight: number | null;
  regionGlow: number | null;
  adjacencyHighlight: boolean;
  highlightCell: [number, number] | null;
}

const EMPTY_HIGHLIGHTS: HighlightState = {
  rowHighlight: null,
  colHighlight: null,
  regionGlow: null,
  adjacencyHighlight: false,
  highlightCell: null,
};

// ── Component ───────────────────────────────────────────────────

interface RealmTutorialProps {
  onComplete: () => void;
  onDismiss: () => void;
}

export function RealmTutorial({ onComplete, onDismiss }: RealmTutorialProps) {
  const [step, setStep] = useState(0);
  const [grid, setGrid] = useState<CellState[][]>(createEmptyGrid);
  const [highlights, setHighlights] = useState<HighlightState>(EMPTY_HIGHLIGHTS);
  const [animating, setAnimating] = useState(false);
  const [winCelebration, setWinCelebration] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timersRef.current.push(t);
    return t;
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // ── Build grid state for each step ──────────────────────────

  // Grid state per step:
  // 0: empty
  // 1: empty, highlight (0,1)
  // 2: crown A + row Xs only
  // 3: crown A + row Xs + col Xs
  // 4: crown A + full elim, highlight (1,3)
  // 5: crown A + crown B full elim (region B glow)
  // 6: crown A + crown B full elim (adjacency highlights)
  // 7: crown A + B full elim, highlight (2,0)
  // 8: crown A + B + C full elim, highlight (3,2)
  // 9: all 4 crowns placed

  const buildGridForStep = useCallback((s: number): CellState[][] => {
    let g = createEmptyGrid();

    if (s === 2) {
      g = applyCrown(g, 0, 1);
      g = applyRowEliminations(g, 0, 1);
    } else if (s === 3) {
      g = applyCrown(g, 0, 1);
      g = applyRowEliminations(g, 0, 1);
      g = applyColumnEliminations(g, 0, 1);
    } else if (s === 4) {
      g = applyFullEliminations(g, 0, 1);
    } else if (s === 5 || s === 6 || s === 7) {
      g = applyFullEliminations(g, 0, 1);
      g = applyFullEliminations(g, 1, 3);
    } else if (s === 8) {
      g = applyFullEliminations(g, 0, 1);
      g = applyFullEliminations(g, 1, 3);
      g = applyFullEliminations(g, 2, 0);
    } else if (s === 9) {
      g = applyFullEliminations(g, 0, 1);
      g = applyFullEliminations(g, 1, 3);
      g = applyFullEliminations(g, 2, 0);
      g = applyFullEliminations(g, 3, 2);
    }

    return g;
  }, []);

  // ── Update state when step changes ──────────────────────────
  useEffect(() => {
    clearTimers();
    const g = buildGridForStep(step);
    setGrid(g);
    setAnimating(false);
    setWinCelebration(false);

    const hl: HighlightState = { ...EMPTY_HIGHLIGHTS };

    switch (step) {
      case 1:
        hl.highlightCell = [0, 1];
        break;
      case 2:
        hl.rowHighlight = 0;
        break;
      case 3:
        hl.colHighlight = 1;
        break;
      case 4:
        hl.highlightCell = [1, 3];
        break;
      case 5:
        hl.regionGlow = 1; // Region B
        break;
      case 6:
        hl.adjacencyHighlight = true;
        break;
      case 7:
        hl.highlightCell = [2, 0];
        break;
      case 8:
        hl.highlightCell = [3, 2];
        break;
      case 9:
        setWinCelebration(true);
        break;
    }

    setHighlights(hl);
  }, [step, buildGridForStep, clearTimers]);

  // ── Staged crown animation for step 1 → step 2 ─────────────
  const performStagedCrownAnimation = useCallback((targetRow: number, targetCol: number) => {
    if (animating) return;
    setAnimating(true);
    setHighlights(h => ({ ...h, highlightCell: null }));

    // Place crown immediately
    setGrid(prev => applyCrown(prev, targetRow, targetCol));

    // Row Xs after brief pause
    addTimer(() => {
      setGrid(prev => applyRowEliminations(prev, targetRow, targetCol));
      setHighlights(h => ({ ...h, rowHighlight: targetRow }));
    }, 200);

    // Auto-advance to step 2 (row rule copy)
    addTimer(() => {
      setStep(2);
    }, 900);
  }, [animating, addTimer]);

  // ── Crown B placement for step 4 → step 5 (region rule) ────
  const performCrownBAnimation = useCallback((targetRow: number, targetCol: number) => {
    if (animating) return;
    setAnimating(true);
    setHighlights(h => ({ ...h, highlightCell: null }));

    // Place crown
    setGrid(prev => applyCrown(prev, targetRow, targetCol));

    // Full cascade after pause
    addTimer(() => {
      setGrid(prev => {
        let g = applyRowEliminations(prev, targetRow, targetCol);
        g = applyColumnEliminations(g, targetRow, targetCol);
        g = applyRegionEliminations(g, targetRow, targetCol);
        g = applyAdjacencyEliminations(g, targetRow, targetCol);
        return g;
      });
      // Highlight region B to teach the rule
      setHighlights(h => ({ ...h, regionGlow: 1 }));
    }, 200);

    // Advance to step 5 (region rule copy)
    addTimer(() => {
      setStep(5);
    }, 800);
  }, [animating, addTimer]);

  // ── Quick crown for steps 7, 8 ─────────────────────────────
  const performQuickCrown = useCallback((targetRow: number, targetCol: number, nextStep: number) => {
    if (animating) return;
    setAnimating(true);
    setHighlights(h => ({ ...h, highlightCell: null }));

    setGrid(prev => applyCrown(prev, targetRow, targetCol));

    addTimer(() => {
      setGrid(prev => {
        let g = applyRowEliminations(prev, targetRow, targetCol);
        g = applyColumnEliminations(g, targetRow, targetCol);
        g = applyRegionEliminations(g, targetRow, targetCol);
        g = applyAdjacencyEliminations(g, targetRow, targetCol);
        return g;
      });
    }, 200);

    addTimer(() => {
      setStep(nextStep);
    }, 800);
  }, [animating, addTimer]);

  // ── Cell tap handler ────────────────────────────────────────
  const handleCellTap = useCallback((row: number, col: number) => {
    if (animating) return;
    const currentStep = STEPS[step];
    if (!currentStep.interactiveCell) return;
    const [tr, tc] = currentStep.interactiveCell;
    if (row !== tr || col !== tc) return;

    if (step === 1) {
      performStagedCrownAnimation(tr, tc);
    } else if (step === 4) {
      performCrownBAnimation(tr, tc);
    } else if (step === 7) {
      performQuickCrown(tr, tc, 8);
    } else if (step === 8) {
      setAnimating(true);
      setHighlights(h => ({ ...h, highlightCell: null }));
      setGrid(prev => applyFullEliminations(prev, tr, tc));
      addTimer(() => setStep(9), 600);
    }
  }, [step, animating, performStagedCrownAnimation, performCrownBAnimation, performQuickCrown, addTimer]);

  // ── CTA handler ─────────────────────────────────────────────
  const handleCTA = useCallback(() => {
    if (animating) return;

    if (step === 9) {
      onComplete();
      return;
    }

    const currentStep = STEPS[step];
    if (currentStep.autoAdvance && currentStep.interactiveCell) {
      // "Show me" / "Place it" fallback
      const [tr, tc] = currentStep.interactiveCell;
      if (step === 1) {
        performStagedCrownAnimation(tr, tc);
      } else if (step === 4) {
        performCrownBAnimation(tr, tc);
      } else if (step === 7) {
        performQuickCrown(tr, tc, 8);
      } else if (step === 8) {
        setAnimating(true);
        setHighlights(h => ({ ...h, highlightCell: null }));
        setGrid(prev => applyFullEliminations(prev, tr, tc));
        addTimer(() => setStep(9), 600);
      }
    } else {
      setStep(s => s + 1);
    }
  }, [step, animating, onComplete, performStagedCrownAnimation, performCrownBAnimation, performQuickCrown, addTimer]);

  const handleBack = () => {
    if (step > 0) {
      clearTimers();
      setStep(s => s - 1);
    }
  };

  const currentStepDef = STEPS[step];
  const cellSize = 68;
  const gap = 2;

  // Compute adjacency zones for step 6
  const adjacencyCells = new Set<string>();
  if (step === 6 && highlights.adjacencyHighlight) {
    const crowns: [number, number][] = [[0, 1], [1, 3]];
    for (const [cr, cc] of crowns) {
      for (const [ar, ac] of getAdjacentCells(cr, cc)) {
        if (grid[ar][ac] !== 'crown') {
          adjacencyCells.add(`${ar}-${ac}`);
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#FAFAF8' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3" style={{ paddingTop: 'calc(12px + var(--safe-area-top, 0px))' }}>
        {step > 0 ? (
          <button onClick={handleBack} className="p-2 -ml-2 transition-colors" style={{ color: '#999' }}>
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div className="w-9" />
        )}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => i <= step && setStep(i)}
              className="w-2 h-2 rounded-full transition-colors"
              style={{
                backgroundColor: i === step ? '#1B2340' : i < step ? 'rgba(27,35,64,0.4)' : 'rgba(27,35,64,0.15)',
              }}
              disabled={i > step}
            />
          ))}
        </div>
        <button onClick={onDismiss} className="p-2 -mr-2 transition-colors" style={{ color: '#999' }}>
          <X size={20} />
        </button>
      </div>

      {/* Grid area */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="relative">
          {/* Win celebration overlay */}
          {winCelebration && (
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)' }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.4 }}
              >
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#22c55e' }}>
                  <Check size={32} color="white" strokeWidth={3} />
                </div>
              </motion.div>
            </motion.div>
          )}

          <div
            style={{
              width: cellSize * GRID_SIZE + gap * (GRID_SIZE - 1),
              height: cellSize * GRID_SIZE + gap * (GRID_SIZE - 1),
            }}
          >
            {Array.from({ length: GRID_SIZE }).map((_, row) =>
              Array.from({ length: GRID_SIZE }).map((_, col) => {
                const region = REGION_MAP[row][col];
                const bgColor = REGION_COLORS[region];
                const borderColor = REGION_BORDER_COLORS[region];
                const state = grid[row][col];
                const isHighlighted = highlights.highlightCell &&
                  highlights.highlightCell[0] === row && highlights.highlightCell[1] === col;
                const isInteractive = !!STEPS[step]?.interactiveCell &&
                  STEPS[step].interactiveCell![0] === row && STEPS[step].interactiveCell![1] === col;

                const isRowHighlighted = highlights.rowHighlight === row;
                const isColHighlighted = highlights.colHighlight === col;
                const isRegionGlowing = highlights.regionGlow !== null && region === highlights.regionGlow;
                const isAdjacencyZone = adjacencyCells.has(`${row}-${col}`);

                const amberHighlight = isRowHighlighted || isColHighlighted;

                return (
                  <div
                    key={`${row}-${col}`}
                    className="absolute flex items-center justify-center transition-all duration-200"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      left: col * (cellSize + gap),
                      top: row * (cellSize + gap),
                      backgroundColor: bgColor,
                      border: `2.5px solid ${borderColor}`,
                      borderRadius: 8,
                      cursor: isInteractive && !animating ? 'pointer' : 'default',
                      opacity: step === 1 && !isHighlighted ? 0.6 : 1,
                    }}
                    onClick={() => handleCellTap(row, col)}
                  >
                    {/* Interactive highlight ring */}
                    {isHighlighted && (
                      <motion.div
                        className="absolute inset-0 rounded-[6px]"
                        style={{ border: '3px solid #22c55e' }}
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                    )}

                    {/* Amber row/column highlight */}
                    {amberHighlight && (
                      <motion.div
                        className="absolute inset-0 rounded-[6px]"
                        style={{
                          backgroundColor: 'rgba(251,191,36,0.3)',
                          border: '2px solid rgba(251,191,36,0.8)',
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      />
                    )}

                    {/* Region glow */}
                    {isRegionGlowing && (
                      <motion.div
                        className="absolute inset-0 rounded-[6px]"
                        style={{ border: `3px solid ${REGION_BORDER_COLORS[highlights.regionGlow!]}` }}
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.2, repeat: 2 }}
                      />
                    )}

                    {/* Adjacency zone highlight */}
                    {isAdjacencyZone && (
                      <motion.div
                        className="absolute inset-0 rounded-[6px]"
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '2px solid rgba(239, 68, 68, 0.4)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}

                    <AnimatePresence mode="wait">
                      {state === 'x' && (
                        <motion.div
                          key="x"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <X style={{ color: '#9ca3af' }} size={20} strokeWidth={2.5} />
                        </motion.div>
                      )}
                      {state === 'crown' && (
                        <motion.div
                          key="crown"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        >
                          <CrownIcon size={Math.round(cellSize * 0.6)} color="#1B2340" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Instruction card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="px-6 pb-8 space-y-4"
          style={{ paddingBottom: 'calc(32px + var(--safe-area-bottom, 0px))' }}
        >
          <div className="text-center space-y-2">
            <p className="text-sm leading-relaxed" style={{ color: '#555' }}>
              {currentStepDef.text}
            </p>
          </div>

          <Button
            onClick={handleCTA}
            disabled={animating}
            className={`w-full h-12 text-base font-semibold ${
              step === 9
                ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white'
                : ''
            }`}
          >
            {currentStepDef.cta}
          </Button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
