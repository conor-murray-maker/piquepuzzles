import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { getTier, RATING_TIERS } from '@/game/types';

const TIER_COLORS: Record<string, string> = {
  bronze: 'hsl(25, 60%, 50%)',
  silver: 'hsl(225, 3%, 67%)',
  gold: 'hsl(42, 100%, 50%)',
  platinum: 'hsl(214, 58%, 57%)',
  elite: 'hsl(270, 58%, 47%)',
  master: 'hsl(4, 66%, 48%)',
  grandmaster: 'hsl(45, 100%, 50%)',
};

interface IQRevealOverlayProps {
  targetIQ: number;
  onComplete: () => void;
}

export function IQRevealOverlay({ targetIQ, onComplete }: IQRevealOverlayProps) {
  const [displayIQ, setDisplayIQ] = useState(0);
  const [phase, setPhase] = useState<'flash' | 'counting' | 'hold'>('flash');
  const frameRef = useRef<number>();

  // Phase transitions
  useEffect(() => {
    // Brief white flash
    const flashTimer = setTimeout(() => setPhase('counting'), 300);
    return () => clearTimeout(flashTimer);
  }, []);

  // Count up animation
  useEffect(() => {
    if (phase !== 'counting') return;

    const duration = 1500; // 1.5s
    const start = performance.now();
    const startVal = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (targetIQ - startVal) * eased);
      setDisplayIQ(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setPhase('hold');
        setTimeout(onComplete, 1500);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [phase, targetIQ, onComplete]);

  const tier = getTier(displayIQ);
  const color = TIER_COLORS[tier.color] || TIER_COLORS.bronze;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Flash */}
      {phase === 'flash' && (
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Dark background */}
      <div className="absolute inset-0 bg-background/95 backdrop-blur-md" />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center space-y-4"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
      >
        <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
          Your Pique IQ
        </p>
        <motion.div
          className="text-7xl font-bold font-mono"
          style={{ color }}
          key={phase}
        >
          {displayIQ.toLocaleString()}
        </motion.div>
        <motion.p
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'hold' ? 1 : 0.5 }}
        >
          {tier.name}
        </motion.p>
        {phase === 'hold' && (
          <motion.p
            className="text-xs text-muted-foreground pt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Every game updates this number. Keep climbing.
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}
