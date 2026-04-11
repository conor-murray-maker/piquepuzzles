import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CrownIcon } from '@/components/game/CrownIcon';

/*
 * Tutorial puzzle: 4×4 grid with 4 regions.
 *
 * Region A (single cell): (0,1) — forces first crown immediately.
 * Region B: (0,2), (0,3), (1,3) — top-right area.
 * Region C: (1,0), (1,1), (1,2), (2,0) — middle-left block.
 * Region D: (0,0), (2,1), (2,2), (2,3), (3,0), (3,1), (3,2), (3,3) — bottom + corner.
 *
 * Solution (verified no adjacency violations):
 *   Crown A: (0,1)  Crown B: (1,3)  Crown C: (2,0)  Crown D: (3,2)
 *
 * Adjacency checks:
 *   (0,1)↔(1,3): |cols|=2 → NOT adjacent ✓
 *   (1,3)↔(2,0): |cols|=3 → NOT adjacent ✓
 *   (2,0)↔(3,2): |cols|=2 → NOT adjacent ✓
 *   All other pairs even farther apart ✓
 *
 * Every placement is forced by elimination:
 *   1. Region A has 1 cell → crown at (0,1) → eliminates row 0, col 1
 *   2. Region B: (0,2)→row0, (0,3)→row0, only (1,3) left → forced
 *   3. Crown at (1,3) → eliminates row 1, col 3
 *   4. Region C: (1,0)→row1, (1,1)→row1, (1,2)→row1, only (2,0) left → forced
 *   5. Crown at (2,0) → eliminates row 2, col 0
 *   6. Region D: (0,0)→row0+col0, (2,1)→row2+col1, (2,2)→row2, (2,3)→row2+col3,
 *      (3,0)→col0, (3,1)→col1, (3,3)→col3, only (3,2) left → forced
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

// Solution crowns in order of forced placement
const SOLUTION: [number, number][] = [
  [0, 1], // Crown A – Region 0 (single cell)
  [1, 3], // Crown B – Region 1
  [2, 0], // Crown C – Region 2
  [3, 2], // Crown D – Region 3
];

type CellState = 'empty' | 'x' | 'crown';

interface TutorialStep {
  title: string;
  text: string;
  cta: string;
  interactiveCell?: [number, number]; // cell the user can tap
  autoAdvance?: boolean;
}

const STEPS: TutorialStep[] = [
  {
    title: 'Welcome',
    text: 'Find where each crown belongs. One crown per row, column, and colour region.',
    cta: 'Start tutorial',
  },
  {
    title: 'Single cell region',
    text: 'This region has only one cell. The crown must go here. Tap it.',
    cta: 'Show me',
    interactiveCell: [0, 1],
    autoAdvance: true,
  },
  {
    title: 'Row rule',
    text: 'One crown placed. The whole row is eliminated. No other crown can share a row.',
    cta: 'Got it',
  },
  {
    title: 'Column rule',
    text: 'The same goes for columns. One crown placed in this column eliminates the whole column.',
    cta: 'Got it',
  },
  {
    title: 'Region rule',
    text: 'And each colour region can only have one crown. This region is done.',
    cta: 'Got it',
  },
  {
    title: 'Next placement',
    text: 'Row 0 is eliminated. Only one cell remains in this region. Logic tells you exactly where the crown goes. Tap it.',
    cta: 'Show me',
    interactiveCell: [1, 3],
    autoAdvance: true,
  },
  {
    title: 'Adjacency',
    text: 'Two crowns cannot touch each other, not even diagonally. The highlighted cells around each crown are off-limits.',
    cta: 'Got it',
  },
  {
    title: 'Ready',
    text: "You're ready. The logic will always show you the way. Trust it.",
    cta: 'Play your first game',
  },
];

function createEmptyGrid(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill('empty'));
}

// Get all cells adjacent (including diagonal) to a position
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

// Apply crown placement and cascade eliminations
function placeCrownWithCascade(grid: CellState[][], row: number, col: number): CellState[][] {
  const g = grid.map(r => [...r]);
  g[row][col] = 'crown';
  // Eliminate row
  for (let c = 0; c < GRID_SIZE; c++) {
    if (c !== col && g[row][c] === 'empty') g[row][c] = 'x';
  }
  // Eliminate column
  for (let r = 0; r < GRID_SIZE; r++) {
    if (r !== row && g[r][col] === 'empty') g[r][col] = 'x';
  }
  // Eliminate same region
  const region = REGION_MAP[row][col];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (REGION_MAP[r][c] === region && !(r === row && c === col) && g[r][c] === 'empty') {
        g[r][c] = 'x';
      }
    }
  }
  // Eliminate adjacent cells
  for (const [ar, ac] of getAdjacentCells(row, col)) {
    if (g[ar][ac] === 'empty') g[ar][ac] = 'x';
  }
  return g;
}

interface RealmTutorialProps {
  onComplete: () => void;
  onDismiss: () => void;
}

export function RealmTutorial({ onComplete, onDismiss }: RealmTutorialProps) {
  const [step, setStep] = useState(0);
  const [grid, setGrid] = useState<CellState[][]>(createEmptyGrid);
  const [highlightCell, setHighlightCell] = useState<[number, number] | null>(null);
  const [animating, setAnimating] = useState(false);
  const [colPulse, setColPulse] = useState(false); // step 3: pulse column 1
  const [regionGlow, setRegionGlow] = useState(false); // step 4: glow region A
  const [adjacencyHighlight, setAdjacencyHighlight] = useState(false); // step 6: highlight adjacency zones
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build grid state for each step
  const buildGridForStep = useCallback((s: number): { grid: CellState[][]; highlight: [number, number] | null } => {
    let g = createEmptyGrid();
    let hl: [number, number] | null = null;

    if (s === 1) {
      // Highlight single-cell region A: (0,1)
      hl = [0, 1];
    } else if (s >= 2 && s <= 4) {
      // Crown A placed at (0,1) with cascade
      g = placeCrownWithCascade(g, 0, 1);
    } else if (s === 5) {
      // Crown A placed, highlight (1,3) for next placement
      g = placeCrownWithCascade(g, 0, 1);
      hl = [1, 3];
    } else if (s >= 6) {
      // Both crowns placed
      g = placeCrownWithCascade(g, 0, 1);
      g = placeCrownWithCascade(g, 1, 3);
    }

    return { grid: g, highlight: hl };
  }, []);

  // Update grid when step changes
  useEffect(() => {
    const { grid: g, highlight: hl } = buildGridForStep(step);
    setGrid(g);
    setHighlightCell(hl);
    setAnimating(false);
    setColPulse(false);
    setRegionGlow(false);
    setAdjacencyHighlight(false);

    // Step 3: pulse column cells after a short delay
    if (step === 3) {
      const t = setTimeout(() => setColPulse(true), 300);
      return () => clearTimeout(t);
    }
    // Step 4: glow region A
    if (step === 4) {
      const t = setTimeout(() => setRegionGlow(true), 300);
      return () => clearTimeout(t);
    }
    // Step 6: adjacency highlights
    if (step === 6) {
      const t = setTimeout(() => setAdjacencyHighlight(true), 300);
      return () => clearTimeout(t);
    }
  }, [step, buildGridForStep]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const performCrownAction = useCallback((targetRow: number, targetCol: number) => {
    if (animating) return;
    setAnimating(true);
    setHighlightCell(null);

    // Place crown with cascade animation
    setGrid(prev => placeCrownWithCascade(prev, targetRow, targetCol));

    // Auto-advance after pause
    advanceTimerRef.current = setTimeout(() => {
      setStep(s => s + 1);
    }, 800);
  }, [animating]);

  const handleCellTap = useCallback((row: number, col: number) => {
    if (animating) return;
    const currentStep = STEPS[step];
    if (!currentStep.interactiveCell) return;
    const [targetRow, targetCol] = currentStep.interactiveCell;
    if (row !== targetRow || col !== targetCol) return;
    performCrownAction(targetRow, targetCol);
  }, [step, animating, performCrownAction]);

  const handleCTA = useCallback(() => {
    if (animating) return;

    if (step === 7) {
      onComplete();
      return;
    }

    const currentStep = STEPS[step];
    if (currentStep.autoAdvance && currentStep.interactiveCell) {
      // "Show me" fallback — animate the action
      const [targetRow, targetCol] = currentStep.interactiveCell;
      performCrownAction(targetRow, targetCol);
    } else {
      setStep(s => s + 1);
    }
  }, [step, animating, onComplete, performCrownAction]);

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const currentStep = STEPS[step];
  const cellSize = 68;
  const gap = 2;

  // Compute adjacency zones for step 6
  const adjacencyCells = new Set<string>();
  if (step === 6 && adjacencyHighlight) {
    // Crowns placed at (0,1) and (1,3)
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
        <div
          className="relative"
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
              const isHighlighted = highlightCell && highlightCell[0] === row && highlightCell[1] === col;
              const isInteractive = !!STEPS[step]?.interactiveCell &&
                STEPS[step].interactiveCell![0] === row && STEPS[step].interactiveCell![1] === col;
              const isColPulsing = colPulse && step === 3 && col === 1 && state === 'x';
              const isRegionGlowing = regionGlow && step === 4 && region === 0;
              const isAdjacencyZone = adjacencyCells.has(`${row}-${col}`);

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

                  {/* Column pulse for step 3 */}
                  {isColPulsing && (
                    <motion.div
                      className="absolute inset-0 rounded-[6px]"
                      style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}
                      animate={{ opacity: [0, 0.4, 0] }}
                      transition={{ duration: 1.5, repeat: 2 }}
                    />
                  )}

                  {/* Region glow for step 4 */}
                  {isRegionGlowing && (
                    <motion.div
                      className="absolute inset-0 rounded-[6px]"
                      style={{ border: '3px solid #22c55e' }}
                      animate={{ opacity: [0.3, 0.8, 0.3] }}
                      transition={{ duration: 1.5, repeat: 2 }}
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
                        transition={{ duration: 0.2 }}
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
              {currentStep.text}
            </p>
          </div>

          <Button
            onClick={handleCTA}
            disabled={animating}
            className={`w-full h-12 text-base font-semibold ${
              step === 7
                ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white'
                : ''
            }`}
          >
            {currentStep.cta}
          </Button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
