import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CrownIcon } from '@/components/game/CrownIcon';

// Hardcoded 4x4 tutorial puzzle
const GRID_SIZE = 4;
const REGION_MAP: number[][] = [
  [0, 1, 1, 1],
  [0, 2, 2, 1],
  [0, 0, 2, 2],
  [3, 3, 3, 3],
];

const REGION_COLORS = ['#E8735A', '#2A9D8F', '#E9C46A', '#7B68EE'];

type CellState = 'empty' | 'x' | 'crown';

interface TutorialStep {
  title: string;
  text: string;
  cta: string;
  autoAdvance?: boolean;
}

const STEPS: TutorialStep[] = [
  {
    title: 'Welcome',
    text: 'Find where each crown belongs. One crown per row, column, and colour region. Logic only. No guessing needed. There is always one right answer.',
    cta: 'Start tutorial',
  },
  {
    title: 'Eliminate',
    text: 'Tap a cell once to mark it with X. Use X to show where a crown cannot go.',
    cta: 'Show me',
    autoAdvance: true,
  },
  {
    title: 'Place crown',
    text: 'Tap again to place a crown.',
    cta: 'Show me',
    autoAdvance: true,
  },
  {
    title: 'Row rule',
    text: 'Each row can only have one crown. When you place one, the rest of that row is eliminated automatically.',
    cta: 'Got it',
  },
  {
    title: 'Column & region',
    text: 'The same rule applies to columns and colour regions. One crown each. Watch how placing one crown eliminates whole sections.',
    cta: 'Got it',
  },
  {
    title: 'Adjacency',
    text: 'Two crowns cannot touch each other, not even diagonally. Keep them separated.',
    cta: 'Got it',
  },
  {
    title: 'Ready',
    text: "You're ready. One crown per row, column, and region. No touching. The logic will guide you.",
    cta: 'Play your first game',
  },
];

function createEmptyGrid(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill('empty'));
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

  // Build grid state for each step
  const buildGridForStep = useCallback((s: number): { grid: CellState[][]; highlight: [number, number] | null } => {
    const g = createEmptyGrid();
    let hl: [number, number] | null = null;

    if (s === 1) {
      // Highlight (0,0)
      hl = [0, 0];
    } else if (s === 2) {
      // X at (0,0), highlight (2,0)
      g[0][0] = 'x';
      hl = [2, 0];
    } else if (s >= 3) {
      // Crown at (2,0)
      g[2][0] = 'crown';

      if (s >= 4) {
        // Row 2 eliminated
        g[2][1] = 'x';
        g[2][2] = 'x';
        g[2][3] = 'x';
      }

      if (s >= 5) {
        // Column 0 eliminated
        g[0][0] = 'x';
        g[1][0] = 'x';
        g[3][0] = 'x';
      }
    }

    return { grid: g, highlight: hl };
  }, []);

  // Update grid when step changes
  useEffect(() => {
    const { grid: g, highlight: hl } = buildGridForStep(step);
    setGrid(g);
    setHighlightCell(hl);
    setAnimating(false);
  }, [step, buildGridForStep]);

  const handleCTA = useCallback(() => {
    if (animating) return;

    if (step === 6) {
      onComplete();
      return;
    }

    const currentStep = STEPS[step];
    if (currentStep.autoAdvance) {
      setAnimating(true);
      // Animate the action
      if (step === 1) {
        // Place X at (0,0)
        setGrid(prev => {
          const g = prev.map(r => [...r]);
          g[0][0] = 'x';
          return g;
        });
        setHighlightCell(null);
      } else if (step === 2) {
        // Place crown at (2,0)
        setGrid(prev => {
          const g = prev.map(r => [...r]);
          g[2][0] = 'crown';
          return g;
        });
        setHighlightCell(null);
      }
      setTimeout(() => {
        setStep(s => s + 1);
      }, 800);
    } else {
      setStep(s => s + 1);
    }
  }, [step, animating, onComplete]);

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const currentStep = STEPS[step];
  const cellSize = 64;
  const gap = 2;

  // Step 5 (adjacency) shows a special illustrative grid
  const isAdjacencyStep = step === 5;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3" style={{ paddingTop: 'calc(12px + var(--safe-area-top, 0px))' }}>
        {step > 0 ? (
          <button onClick={handleBack} className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
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
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-muted-foreground/20'
              }`}
              disabled={i > step}
            />
          ))}
        </div>
        <button onClick={onDismiss} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
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
          {isAdjacencyStep ? (
            <AdjacencyIllustration cellSize={cellSize} gap={gap} />
          ) : (
            Array.from({ length: GRID_SIZE }).map((_, row) =>
              Array.from({ length: GRID_SIZE }).map((_, col) => {
                const region = REGION_MAP[row][col];
                const color = REGION_COLORS[region];
                const state = grid[row][col];
                const isHighlighted = highlightCell && highlightCell[0] === row && highlightCell[1] === col;

                return (
                  <div
                    key={`${row}-${col}`}
                    className="absolute flex items-center justify-center transition-all duration-200"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      left: col * (cellSize + gap),
                      top: row * (cellSize + gap),
                      backgroundColor: `${color}25`,
                      border: `2.5px solid ${color}60`,
                      borderRadius: 8,
                    }}
                  >
                    {isHighlighted && (
                      <motion.div
                        className="absolute inset-0 rounded-[6px]"
                        style={{ border: '2.5px solid hsl(var(--primary))' }}
                        animate={{ opacity: [0.4, 1, 0.4] }}
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
                          <X className="text-muted-foreground/60" size={20} strokeWidth={2.5} />
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
                          <CrownIcon size={24} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )
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
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentStep.text}
            </p>
          </div>

          <Button
            onClick={handleCTA}
            disabled={animating}
            className={`w-full h-12 text-base font-semibold ${step === 6 ? 'bg-primary hover:bg-primary/90' : ''}`}
          >
            {currentStep.cta}
          </Button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Adjacency illustration: two crowns touching diagonally with red indicators
function AdjacencyIllustration({ cellSize, gap }: { cellSize: number; gap: number }) {
  const grid: CellState[][] = [
    ['empty', 'crown', 'empty'],
    ['empty', 'empty', 'crown'],
    ['empty', 'empty', 'empty'],
  ];
  const size = 3;
  const colors = ['#E8735A', '#2A9D8F', '#E9C46A'];

  return (
    <div
      className="relative"
      style={{
        width: cellSize * size + gap * (size - 1),
        height: cellSize * size + gap * (size - 1),
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {Array.from({ length: size }).map((_, row) =>
        Array.from({ length: size }).map((_, col) => {
          const state = grid[row][col];
          const color = colors[row];
          // Check if this cell is adjacent to both crowns (diagonal between them)
          const isBadDiagonal = row === 0 && col === 2 || row === 1 && col === 1;

          return (
            <div
              key={`${row}-${col}`}
              className="absolute flex items-center justify-center"
              style={{
                width: cellSize,
                height: cellSize,
                left: col * (cellSize + gap),
                top: row * (cellSize + gap),
                backgroundColor: `${color}25`,
                border: `2.5px solid ${isBadDiagonal && state !== 'crown' ? '#ef4444' : `${color}60`}`,
                borderRadius: 8,
              }}
            >
              {state === 'crown' && (
                <CrownIcon size={24} />
              )}
              {isBadDiagonal && state !== 'crown' && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <X className="text-destructive" size={20} strokeWidth={3} />
                </motion.div>
              )}
            </div>
          );
        })
      )}
      {/* Red line between the two crowns */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{
          width: cellSize * size + gap * (size - 1),
          height: cellSize * size + gap * (size - 1),
        }}
      >
        <line
          x1={cellSize * 1.5 + gap}
          y1={cellSize * 0.5}
          x2={cellSize * 2.5 + gap * 2}
          y2={cellSize * 1.5 + gap}
          stroke="#ef4444"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          opacity={0.7}
        />
      </svg>
    </div>
  );
}
