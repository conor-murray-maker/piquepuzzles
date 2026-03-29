import { motion, AnimatePresence } from 'framer-motion';
import { RATING_TIERS, getTier } from '@/game/types';
import { useState, useEffect } from 'react';

const TIER_HEX: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#A8A9AD',
  gold: '#FFB800',
  platinum: '#4A90D9',
  elite: '#7B2FBE',
  master: '#C0392B',
  grandmaster: '#FFD700',
};

const TIER_GRADIENT: Record<string, [string, string]> = {
  bronze: ['#CD7F32', '#D4954E'],
  silver: ['#A8A9AD', '#C0C1C5'],
  gold: ['#FFB800', '#FFCC44'],
  platinum: ['#4A90D9', '#6CAAE8'],
  elite: ['#7B2FBE', '#9B5FD4'],
  master: ['#C0392B', '#D35447'],
  grandmaster: ['#FFD700', '#FFE44D'],
};

/** Short labels for narrow viewports */
const TIER_SHORT: Record<string, string> = {
  Bronze: 'BRZ',
  Silver: 'SLV',
  Gold: 'GLD',
  Platinum: 'PLT',
  Elite: 'ELT',
  Master: 'MST',
  Grandmaster: 'GM',
};

function computeProgress(rating: number): number {
  const tier = getTier(rating);
  const tierIndex = RATING_TIERS.findIndex(t => t.name === tier.name);
  const tierWidth = 100 / RATING_TIERS.length;
  const progressInTier = (rating - tier.min) / (tier.max - tier.min + 1);
  return tierIndex * tierWidth + Math.min(progressInTier, 1) * tierWidth;
}

interface TierProgressBarProps {
  rating: number;
  previousRating?: number;
  ratingChange?: number;
}

export function TierProgressBar({ rating, previousRating, ratingChange }: TierProgressBarProps) {
  const tier = getTier(rating);
  const tierIndex = RATING_TIERS.findIndex(t => t.name === tier.name);
  const nextTier = RATING_TIERS[tierIndex + 1];
  const totalProgress = computeProgress(rating);
  const prevProgress = previousRating !== undefined ? computeProgress(previousRating) : 0;

  const isIncrease = ratingChange !== undefined && ratingChange > 0;
  const isDecrease = ratingChange !== undefined && ratingChange < 0;

  const gradient = TIER_GRADIENT[tier.color] || TIER_GRADIENT.bronze;

  const [showChange, setShowChange] = useState(false);
  const [showGlow, setShowGlow] = useState(false);

  useEffect(() => {
    if (ratingChange !== undefined && ratingChange !== 0) {
      const t1 = setTimeout(() => setShowChange(true), 600);
      const t2 = setTimeout(() => setShowChange(false), 1600);
      const timers = [t1, t2];
      if (isIncrease) {
        const t3 = setTimeout(() => setShowGlow(true), 400);
        const t4 = setTimeout(() => setShowGlow(false), 1000);
        timers.push(t3, t4);
      }
      return () => timers.forEach(clearTimeout);
    }
  }, [ratingChange, isIncrease]);

  return (
    <div className="w-full space-y-1">
      {/* Tier labels — responsive: abbreviate on small screens */}
      <div className="flex">
        {RATING_TIERS.map((t, i) => {
          const isActive = i === tierIndex;
          const isGM = t.color === 'grandmaster';
          return (
            <div key={t.name} className="flex-1 text-center min-w-0 px-[1px]">
              <motion.span
                className={`text-[8px] sm:text-[9px] font-semibold uppercase leading-none block truncate ${
                  isGM && isActive ? 'font-extrabold' : ''
                }`}
                style={{
                  color: isActive
                    ? TIER_HEX[t.color]
                    : 'hsl(var(--muted-foreground) / 0.3)',
                  ...(isGM && isActive ? { textShadow: `0 0 6px ${TIER_HEX.grandmaster}80` } : {}),
                }}
                animate={
                  isActive && isIncrease
                    ? { scale: [1, 1.15, 1] }
                    : {}
                }
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <span className="hidden sm:inline">{t.name}</span>
                <span className="sm:hidden">{TIER_SHORT[t.name] || t.name}</span>
              </motion.span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="relative h-5 rounded-full bg-secondary overflow-hidden">
        {/* Tier section dividers */}
        <div className="absolute inset-0 flex z-10 pointer-events-none">
          {RATING_TIERS.map((_, i) => (
            <div
              key={i}
              className="flex-1"
              style={{
                borderRight: i < RATING_TIERS.length - 1
                  ? '1.5px solid hsl(var(--background) / 0.4)'
                  : 'none',
              }}
            />
          ))}
        </div>

        {/* Fill */}
        <motion.div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`,
          }}
          initial={{ width: `${prevProgress}%` }}
          animate={{ width: `${totalProgress}%` }}
          transition={{
            duration: isDecrease ? 0.4 : 0.6,
            ease: isDecrease ? 'easeIn' : 'easeOut',
          }}
        />

        {/* Glow effect */}
        <AnimatePresence>
          {showGlow && (
            <motion.div
              className="absolute top-0 h-full rounded-full"
              style={{
                width: 32,
                left: `calc(${totalProgress}% - 16px)`,
                background: `radial-gradient(circle, ${gradient[1]}80, transparent)`,
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Floating rating change + points to next tier */}
      <div className="relative h-5">
        <AnimatePresence>
          {showChange && ratingChange !== undefined && ratingChange !== 0 && (
            <motion.span
              className="absolute left-1/2 -translate-x-1/2 font-mono font-bold text-sm"
              style={{ color: isIncrease ? TIER_HEX[tier.color] : 'hsl(var(--muted-foreground))' }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: -4 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5 }}
            >
              {isIncrease ? '+' : ''}{ratingChange}
            </motion.span>
          )}
        </AnimatePresence>

        {nextTier && !showChange && (
          <p className="text-[10px] text-muted-foreground text-center">
            {nextTier.min - rating} points to {nextTier.name}
          </p>
        )}
      </div>
    </div>
  );
}
