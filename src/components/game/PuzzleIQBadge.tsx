import { getTier, RATING_TIERS } from '@/game/types';
import { motion } from 'framer-motion';

interface PuzzleIQBadgeProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  showTier?: boolean;
}

export function PuzzleIQBadge({ rating, size = 'md', showTier = true }: PuzzleIQBadgeProps) {
  const tier = getTier(rating);

  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-3xl',
    lg: 'text-5xl',
  };

  const tierColorClass = `text-${tier.color}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.span
        className={`font-bold font-mono ${sizeClasses[size]} ${tierColorClass}`}
        key={rating}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        {rating}
      </motion.span>
      {showTier && (
        <span className={`text-xs font-semibold uppercase tracking-wider ${tierColorClass}`}>
          {tier.name}
        </span>
      )}
    </div>
  );
}

export function RatingChange({ change }: { change: number }) {
  const positive = change > 0;
  return (
    <motion.span
      className={`font-mono font-semibold text-sm ${positive ? 'text-rating-up' : 'text-rating-down'}`}
      initial={{ opacity: 0, y: positive ? 10 : -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {positive ? '+' : ''}{change}
    </motion.span>
  );
}

export function TierProgress({ rating }: { rating: number }) {
  const tier = getTier(rating);
  const nextTier = RATING_TIERS.find(t => t.min > tier.min);
  if (!nextTier) return null;

  const progress = ((rating - tier.min) / (nextTier.min - tier.min)) * 100;

  return (
    <div className="w-full max-w-xs">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{tier.name}</span>
        <span>{nextTier.name}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className={`h-full bg-${tier.color} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1 text-center">
        {nextTier.min - rating} points to {nextTier.name}
      </p>
    </div>
  );
}
