import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TOOLTIP_KEYS = {
  winbar: 'pique-tooltip-winbar',
  moves: 'pique-tooltip-moves',
  hints: 'pique-tooltip-hints',
  firstwin: 'pique-tooltip-firstwin',
};

function wasShown(key: string): boolean {
  return localStorage.getItem(key) === 'true';
}

function markShown(key: string) {
  localStorage.setItem(key, 'true');
}

interface TooltipOverlayProps {
  message: string;
  onDismiss: () => void;
  autoMs?: number;
  position?: 'top' | 'center' | 'bottom';
}

function TooltipOverlay({ message, onDismiss, autoMs = 4000, position = 'top' }: TooltipOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoMs]);

  const positionClass = position === 'top' ? 'top-16' : position === 'bottom' ? 'bottom-32' : 'top-1/2 -translate-y-1/2';

  return (
    <motion.div
      className={`fixed left-4 right-4 z-[60] flex justify-center ${positionClass}`}
      initial={{ opacity: 0, y: position === 'bottom' ? 8 : -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: position === 'bottom' ? 8 : -8 }}
      onClick={onDismiss}
    >
      <div className="bg-foreground/90 text-background px-4 py-2.5 rounded-xl text-xs font-medium text-center max-w-sm backdrop-blur-sm">
        {message}
      </div>
    </motion.div>
  );
}

interface GameTooltipsProps {
  gamesPlayed: number;
  moveCount: number;
  hintJustUsed: boolean;
  gameWon: boolean;
}

export function GameTooltips({ gamesPlayed, moveCount, hintJustUsed, gameWon }: GameTooltipsProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const isNewPlayer = gamesPlayed < 3;

  const dismiss = useCallback(() => {
    if (activeTooltip) {
      markShown(activeTooltip);
      setActiveTooltip(null);
    }
  }, [activeTooltip]);

  // Win bar tooltip on first board load
  useEffect(() => {
    if (!isNewPlayer || wasShown(TOOLTIP_KEYS.winbar)) return;
    const timer = setTimeout(() => {
      setActiveTooltip(TOOLTIP_KEYS.winbar);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isNewPlayer]);

  // Moves tooltip on first valid move
  useEffect(() => {
    if (!isNewPlayer || wasShown(TOOLTIP_KEYS.moves) || moveCount !== 1) return;
    if (activeTooltip) return;
    setActiveTooltip(TOOLTIP_KEYS.moves);
  }, [moveCount, isNewPlayer, activeTooltip]);

  // Hint tooltip
  useEffect(() => {
    if (!isNewPlayer || wasShown(TOOLTIP_KEYS.hints) || !hintJustUsed) return;
    if (activeTooltip) return;
    setActiveTooltip(TOOLTIP_KEYS.hints);
  }, [hintJustUsed, isNewPlayer, activeTooltip]);

  // First win tooltip
  useEffect(() => {
    if (!isNewPlayer || wasShown(TOOLTIP_KEYS.firstwin) || !gameWon) return;
    setActiveTooltip(TOOLTIP_KEYS.firstwin);
  }, [gameWon, isNewPlayer]);

  const getMessage = () => {
    switch (activeTooltip) {
      case TOOLTIP_KEYS.winbar:
        return 'This shows your chances of winning. It updates as you play.';
      case TOOLTIP_KEYS.moves:
        return 'Every move counts toward your score';
      case TOOLTIP_KEYS.hints:
        return 'Using hints reduces your rating bonus';
      case TOOLTIP_KEYS.firstwin:
        return '🎉 Your Puzzle IQ has been updated!';
      default:
        return '';
    }
  };

  const getPosition = (): 'top' | 'center' | 'bottom' => {
    switch (activeTooltip) {
      case TOOLTIP_KEYS.winbar: return 'top';
      case TOOLTIP_KEYS.moves: return 'top';
      case TOOLTIP_KEYS.hints: return 'bottom';
      case TOOLTIP_KEYS.firstwin: return 'center';
      default: return 'top';
    }
  };

  const getAutoMs = () => {
    switch (activeTooltip) {
      case TOOLTIP_KEYS.winbar: return 4000;
      case TOOLTIP_KEYS.moves: return 3000;
      case TOOLTIP_KEYS.hints: return 2000;
      case TOOLTIP_KEYS.firstwin: return 2000;
      default: return 3000;
    }
  };

  return (
    <AnimatePresence>
      {activeTooltip && (
        <TooltipOverlay
          key={activeTooltip}
          message={getMessage()}
          onDismiss={dismiss}
          autoMs={getAutoMs()}
          position={getPosition()}
        />
      )}
    </AnimatePresence>
  );
}
