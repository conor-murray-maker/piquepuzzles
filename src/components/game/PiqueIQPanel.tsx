import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Info } from 'lucide-react';
import { getTier, RATING_TIERS } from '@/game/types';
import { ModeRating } from '@/hooks/usePlayerStats';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TierProgressBar } from '@/components/game/TierProgressBar';

const TIER_HEX: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#A8A9AD',
  gold: '#FFB800',
  platinum: '#4A90D9',
  elite: '#7B2FBE',
  master: '#C0392B',
  grandmaster: '#FFD700',
};

/** Within-tier progress: 0–100% of the current tier only */
function withinTierProgress(rating: number): number {
  const tier = getTier(rating);
  const range = tier.max - tier.min + 1;
  return Math.min(100, Math.max(0, ((rating - tier.min) / range) * 100));
}

function MiniProgressBar({ rating, className = '' }: { rating: number; className?: string }) {
  const tier = getTier(rating);
  const progress = withinTierProgress(rating);
  const isGM = tier.color === 'grandmaster';

  return (
    <div className={`h-1.5 rounded-full bg-secondary overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${progress}%`,
          backgroundColor: TIER_HEX[tier.color] || TIER_HEX.bronze,
          ...(isGM ? { boxShadow: `0 0 4px ${TIER_HEX.grandmaster}80` } : {}),
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
  const isGM = tier.color === 'grandmaster';

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
          <div className="flex items-baseline gap-2.5 mb-2">
            <span
              className={`text-3xl font-bold font-mono ${isGM ? 'font-extrabold' : ''}`}
              style={{
                color: TIER_HEX[tier.color],
                ...(isGM ? { textShadow: `0 0 8px ${TIER_HEX.grandmaster}60` } : {}),
              }}
            >
              {piqueIQ}
            </span>
          </div>
          <TierProgressBar rating={piqueIQ} />
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 self-start mt-1"
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
                const modeIsGM = modeTier.color === 'grandmaster';
                return (
                  <div key={mr.game_mode} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium">{mr.display_name}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono font-bold text-sm ${isUnranked ? 'text-muted-foreground' : ''} ${
                              modeIsGM && !isUnranked ? 'font-extrabold' : ''
                            }`}
                            style={!isUnranked ? {
                              color: TIER_HEX[modeTier.color],
                              ...(modeIsGM ? { textShadow: `0 0 6px ${TIER_HEX.grandmaster}60` } : {}),
                            } : undefined}
                          >
                            {mr.iq}
                          </span>
                          {isUnranked ? (
                            <span className="text-[10px] text-muted-foreground">Unranked</span>
                          ) : (
                            <span
                              className={`text-[10px] font-medium uppercase tracking-wider ${
                                modeIsGM ? 'font-extrabold' : ''
                              }`}
                              style={{
                                color: TIER_HEX[modeTier.color],
                                ...(modeIsGM ? { textShadow: `0 0 4px ${TIER_HEX.grandmaster}60` } : {}),
                              }}
                            >
                              {modeTier.name}
                            </span>
                          )}
                          {mr.todayDelta !== 0 && (
                            <span
                              className={`text-[10px] font-mono font-semibold ${
                                mr.todayDelta > 0 ? 'text-green-500' : 'text-red-500'
                              }`}
                            >
                              {mr.todayDelta > 0 ? '+' : ''}{mr.todayDelta}
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
