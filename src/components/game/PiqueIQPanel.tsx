import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Info } from 'lucide-react';
import { getTier, RATING_TIERS } from '@/game/types';
import { ModeRating } from '@/hooks/usePlayerStats';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const TIER_COLORS: Record<string, string> = {
  bronze: 'hsl(25, 60%, 50%)',
  silver: 'hsl(220, 10%, 66%)',
  gold: 'hsl(45, 93%, 47%)',
  platinum: 'hsl(200, 50%, 55%)',
  elite: 'hsl(280, 60%, 55%)',
};

function MiniProgressBar({ rating, className = '' }: { rating: number; className?: string }) {
  const tier = getTier(rating);
  const tierIndex = RATING_TIERS.findIndex(t => t.name === tier.name);
  const nextTier = RATING_TIERS[tierIndex + 1];
  const progress = nextTier
    ? ((rating - tier.min) / (nextTier.min - tier.min)) * 100
    : Math.min(100, ((rating - tier.min) / 250) * 100);

  return (
    <div className={`h-1.5 rounded-full bg-secondary overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${progress}%`,
          backgroundColor: TIER_COLORS[tier.color] || TIER_COLORS.bronze,
        }}
      />
    </div>
  );
}

interface PiqueIQPanelProps {
  piqueIQ: number;
  modeRatings: ModeRating[];
  defaultExpanded?: boolean;
}

export function PiqueIQPanel({ piqueIQ, modeRatings, defaultExpanded = false }: PiqueIQPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tier = getTier(piqueIQ);
  const tierIndex = RATING_TIERS.findIndex(t => t.name === tier.name);
  const nextTier = RATING_TIERS[tierIndex + 1];

  return (
    <div className="stat-card overflow-hidden">
      {/* Collapsed / Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              Pique IQ
            </p>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  Pique IQ = average of all mode IQs. Unplayed modes count as 1000.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-baseline gap-2.5">
            <span
              className="text-3xl font-bold font-mono"
              style={{ color: TIER_COLORS[tier.color] }}
            >
              {piqueIQ}
            </span>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: TIER_COLORS[tier.color] }}
            >
              {tier.name}
            </span>
          </div>
          <MiniProgressBar rating={piqueIQ} className="mt-2 w-full" />
          {nextTier && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {nextTier.min - piqueIQ} points to {nextTier.name}
            </p>
          )}
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      {/* Expanded: mode IQ rows */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-border space-y-2.5">
              {modeRatings.map((mr) => {
                const modeTier = getTier(mr.iq);
                const isUnranked = mr.games_played === 0;
                return (
                  <div key={mr.game_mode} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium">{mr.display_name}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono font-bold text-sm ${isUnranked ? 'text-muted-foreground' : ''}`}
                            style={!isUnranked ? { color: TIER_COLORS[modeTier.color] } : undefined}
                          >
                            {mr.iq}
                          </span>
                          {isUnranked ? (
                            <span className="text-[10px] text-muted-foreground">Unranked</span>
                          ) : (
                            <span
                              className="text-[10px] font-medium uppercase tracking-wider"
                              style={{ color: TIER_COLORS[modeTier.color] }}
                            >
                              {modeTier.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <MiniProgressBar rating={mr.iq} className="w-full" />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
