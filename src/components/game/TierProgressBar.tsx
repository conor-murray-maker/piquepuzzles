import { motion, AnimatePresence } from 'framer-motion';
import { RATING_TIERS, getTier } from '@/game/types';
import { useState, useEffect } from 'react';

const TIER_COLORS: Record<string, [string, string]> = {
  bronze: ['hsl(25, 60%, 50%)', 'hsl(25, 60%, 65%)'],
  silver: ['hsl(220, 10%, 66%)', 'hsl(220, 10%, 88%)'],
  gold: ['hsl(45, 93%, 47%)', 'hsl(45, 93%, 75%)'],
  platinum: ['hsl(200, 50%, 55%)', 'hsl(200, 50%, 72%)'],
  elite: ['hsl(280, 60%, 55%)', 'hsl(280, 60%, 72%)'],
};

const TIER_TEXT_COLORS: Record<string, string> = {
  bronze: 'hsl(25, 60%, 50%)',
  silver: 'hsl(220, 10%, 66%)',
  gold: 'hsl(45, 93%, 47%)',
  platinum: 'hsl(200, 50%, 55%)',
  elite: 'hsl(280, 60%, 55%)',
};

function computeProgress(rating: number): number {
  const tier = getTier(rating);
  const tierIndex = RATING_TIERS.findIndex(t => t.name === tier.name);
  const tierWidth = 100 / RATING_TIERS.length;
  const nextTier = RATING_TIERS[tierIndex + 1];
  const progressInTier = nextTier
    ? ((rating - tier.min) / (nextTier.min - tier.min)) * 100
    : Math.min(100, ((rating - tier.min) / 250) * 100);
  return tierIndex * tierWidth + (progressInTier / 100) * tierWidth;
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

  const gradient = TIER_COLORS[tier.color] || TIER_COLORS.bronze;

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
    <div className="w-full space-y-1.5">
      {/* Tier labels */}
      <div className="flex">
        {RATING_TIERS.map((t, i) => (
          <div key={t.name} className="flex-1 text-center">
            <motion.span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{
                color: i === tierIndex
                  ? TIER_TEXT_COLORS[t.color]
                  : 'hsl(var(--muted-foreground) / 0.3)',
              }}
              animate={
                i === tierIndex && isIncrease
                  ? { scale: [1, 1.15, 1] }
                  : {}
              }
              transition={{ duration: 0.4, delay: 0.6 }}
            >
              {t.name}
            </motion.span>
          </div>
        ))}
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
                  ? '1px solid hsl(var(--background) / 0.3)'
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
              style={{ color: isIncrease ? TIER_TEXT_COLORS[tier.color] : 'hsl(var(--muted-foreground))' }}
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
