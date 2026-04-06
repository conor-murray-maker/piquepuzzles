import { Lightbulb, Undo2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface GameActionBarProps {
  onHint: () => void;
  onUndo: () => void;
  undoDisabled: boolean;
  moveCount: number;
  hintLoading?: boolean;
  undoPulse?: boolean;
}

export function GameActionBar({ onHint, onUndo, undoDisabled, moveCount, hintLoading, undoPulse }: GameActionBarProps) {
  return (
    <div
      className="fixed left-0 right-0 z-40 bg-card border-t flex items-stretch"
      style={{
        bottom: 'calc(56px + var(--safe-area-bottom, 0px))',
        borderColor: '#e2e8f0',
        padding: '12px 0',
        boxShadow: '0 -1px 4px rgba(0,0,0,0.08)',
      }}
    >
      {/* Undo */}
      <motion.button
        onClick={onUndo}
        disabled={undoDisabled}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-opacity disabled:opacity-40"
        animate={undoPulse ? {
          scale: [1, 1.15, 1, 1.15, 1],
          transition: { duration: 0.6, ease: 'easeInOut' }
        } : {}}
      >
        <Undo2 className={`w-5 h-5 text-foreground ${undoPulse ? 'text-amber-500' : ''}`} />
        <span className={`text-xs font-medium ${undoPulse ? 'text-amber-500' : 'text-foreground'}`}>Undo</span>
        <span className="text-[10px] text-muted-foreground">Move {moveCount}</span>
      </motion.button>

      {/* Divider */}
      <div className="w-px self-stretch my-2" style={{ backgroundColor: '#e2e8f0' }} />

      {/* Hint */}
      <button
        onClick={onHint}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-opacity"
      >
        <Lightbulb className={`w-5 h-5 text-foreground ${hintLoading ? 'animate-pulse' : ''}`} />
        <span className={`text-xs font-medium text-foreground ${hintLoading ? 'animate-pulse' : ''}`}>
          {hintLoading ? 'Thinking...' : 'Hint'}
        </span>
        
      </button>
    </div>
  );
}
