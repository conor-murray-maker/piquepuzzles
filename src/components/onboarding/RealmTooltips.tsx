import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RealmTooltipsProps {
  crownsPlaced: number;
  totalCrowns: number;
  movesMade: number;
  gameStartedMs: number;
  isOnboarding: boolean;
}

export function RealmTooltips({ crownsPlaced, totalCrowns, movesMade, gameStartedMs, isOnboarding }: RealmTooltipsProps) {
  const [shownTooltips, setShownTooltips] = useState<Set<number>>(new Set());
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);

  const dismiss = useCallback(() => {
    if (activeTooltip !== null) {
      setShownTooltips(prev => new Set(prev).add(activeTooltip));
      setActiveTooltip(null);
    }
  }, [activeTooltip]);

  // Tooltip 1: immediately on game start
  useEffect(() => {
    if (!isOnboarding || shownTooltips.has(1)) return;
    const timer = setTimeout(() => {
      setActiveTooltip(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [isOnboarding, shownTooltips]);

  // Tooltip 2: after first crown placed OR 30s with no crown
  useEffect(() => {
    if (!isOnboarding || shownTooltips.has(2) || activeTooltip !== null) return;
    if (!shownTooltips.has(1)) return; // wait for tooltip 1 to be dismissed

    if (crownsPlaced >= 1) {
      setActiveTooltip(2);
      return;
    }

    const timer = setTimeout(() => {
      if (crownsPlaced === 0) setActiveTooltip(2);
    }, 30000);
    return () => clearTimeout(timer);
  }, [isOnboarding, shownTooltips, activeTooltip, crownsPlaced]);

  // Tooltip 3: when 3 crowns remain
  useEffect(() => {
    if (!isOnboarding || shownTooltips.has(3) || activeTooltip !== null) return;
    if (!shownTooltips.has(2)) return;

    const remaining = totalCrowns - crownsPlaced;
    if (remaining === 3 && totalCrowns > 0) {
      setActiveTooltip(3);
    }
  }, [isOnboarding, shownTooltips, activeTooltip, crownsPlaced, totalCrowns]);

  // Auto-dismiss tooltips on any interaction (movesMade changes)
  useEffect(() => {
    if (activeTooltip === 1 && movesMade > 0) {
      dismiss();
    }
  }, [movesMade, activeTooltip, dismiss]);

  const getMessage = () => {
    switch (activeTooltip) {
      case 1: return 'Tap a cell to eliminate it. Start by ruling out where a crown can\'t go.';
      case 2: return 'Long press a cell to place a crown. Tap again to cycle through states.';
      case 3: return 'Use the regions to narrow it down. Each coloured region needs exactly one.';
      default: return '';
    }
  };

  if (!isOnboarding || activeTooltip === null) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={activeTooltip}
        className="fixed left-4 right-4 z-[60] flex justify-center"
        style={{ top: 'calc(var(--safe-area-top, 0px) + 64px)' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.2 }}
        onClick={dismiss}
      >
        <div className="px-4 py-3 rounded-xl text-xs font-medium text-center max-w-sm backdrop-blur-sm"
          style={{
            backgroundColor: '#FFFFFF',
            color: '#1a1a1a',
            border: '1px solid #E0E0E0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {getMessage()}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
