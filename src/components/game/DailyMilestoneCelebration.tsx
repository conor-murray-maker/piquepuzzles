import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { haptic } from '@/lib/haptics';
import { getCurrentMilestone, getStreakCopy, STREAK_MILESTONES } from './DailyStreakBadge';

interface DailyMilestoneCelebrationProps {
  milestone: number;
  streak: number;
  percentile?: number | null;
  onDismiss: () => void;
}

export function DailyMilestoneCelebration({
  milestone, streak, percentile, onDismiss,
}: DailyMilestoneCelebrationProps) {
  const [visible, setVisible] = useState(true);
  const info = STREAK_MILESTONES[milestone] || getCurrentMilestone(streak);

  useEffect(() => {
    haptic.success();
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) {
      const exit = setTimeout(onDismiss, 400);
      return () => clearTimeout(exit);
    }
  }, [visible, onDismiss]);

  if (!info) return null;

  const Icon = info.icon;
  const copy = getStreakCopy(streak, percentile);
  const isLegend = milestone >= 365;
  const isCentury = milestone >= 100;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setVisible(false)}
          style={{
            paddingTop: 'var(--safe-area-top, 0px)',
            paddingBottom: 'var(--safe-area-bottom, 0px)',
          }}
        >
          {/* Backdrop with milestone color tint */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `${info.hslColor.replace(')', ', 0.92)')}` }}
          />

          {/* Confetti-like particles */}
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                backgroundColor: i % 3 === 0 ? info.hslColor : i % 3 === 1 ? '#fff' : 'hsl(42, 100%, 50%)',
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 80}%`,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
                y: [0, -100 - Math.random() * 200],
                x: [(Math.random() - 0.5) * 100],
              }}
              transition={{
                duration: 2 + Math.random(),
                delay: Math.random() * 0.5,
                ease: 'easeOut',
              }}
            />
          ))}

          <motion.div
            className="relative z-10 text-center space-y-4 max-w-sm"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1], opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {/* Icon with glow */}
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="relative inline-block"
            >
              <div
                className="absolute inset-0 rounded-full blur-xl opacity-50"
                style={{ backgroundColor: info.hslColor, transform: 'scale(2)' }}
              />
              <Icon
                className="w-20 h-20 relative"
                style={{
                  color: '#fff',
                  filter: `drop-shadow(0 0 20px ${info.hslColor})`,
                  ...(isLegend ? {
                    background: 'linear-gradient(135deg, #ff0000, #ff7700, #ffff00, #00ff00, #0000ff, #8b00ff)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundSize: '200% 200%',
                    animation: 'rainbow-shift 2s linear infinite',
                  } : isCentury ? {
                    background: 'linear-gradient(135deg, #B8860B, #FFD700, #FFF8DC, #FFD700, #B8860B)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'gm-shimmer 3s linear infinite',
                  } : {}),
                }}
              />
            </motion.div>

            <h1 className="text-4xl font-bold text-white drop-shadow-lg">
              {info.name}!
            </h1>
            <p className="text-xl font-mono font-bold text-white/90">
              {streak} day streak
            </p>
            <p className="text-white/70 text-sm max-w-xs mx-auto">
              {copy}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
