import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RATING_TIERS, getTier } from '@/game/types';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { ModeRating } from '@/hooks/usePlayerStats';

const FABRICATED_DISTRIBUTION: Record<string, number> = {
  Bronze: 15,
  Silver: 23,
  Gold: 26,
  Platinum: 18,
  Elite: 12,
  Master: 5,
  Grandmaster: 1,
};

const MIN_PLAYERS_FOR_LIVE = 500;

const MODE_LABELS: Record<string, string> = {
  klondike: 'Klondike',
  freecell: 'FreeCell',
  realm: 'Realm',
};

interface TierDistribution {
  [tierName: string]: number; // percentage
}

function computeDistribution(counts: Record<string, number>): TierDistribution {
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (total < MIN_PLAYERS_FOR_LIVE) return FABRICATED_DISTRIBUTION;
  const dist: TierDistribution = {};
  for (const tier of RATING_TIERS) {
    dist[tier.name] = Math.max(0, Math.round(((counts[tier.name] || 0) / total) * 100));
  }
  // Ensure sums to ~100
  const sum = Object.values(dist).reduce((s, v) => s + v, 0);
  if (sum > 0 && sum !== 100) {
    const largest = Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0];
    dist[largest] += 100 - sum;
  }
  return dist;
}

function getPercentile(distribution: TierDistribution, playerTierName: string): number {
  const tierOrder = RATING_TIERS.map(t => t.name);
  const playerIdx = tierOrder.indexOf(playerTierName);
  let abovePercent = 0;
  for (let i = playerIdx + 1; i < tierOrder.length; i++) {
    abovePercent += distribution[tierOrder[i]] || 0;
  }
  const currentTierPercent = distribution[playerTierName] || 0;
  const percentile = abovePercent + currentTierPercent / 2;
  return Math.max(1, Math.round(percentile));
}

function TierBar({ distribution, playerTierName }: { distribution: TierDistribution; playerTierName: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-6 rounded-md overflow-hidden border border-border">
        {RATING_TIERS.map((tier) => {
          const pct = distribution[tier.name] || 0;
          if (pct === 0) return null;
          const isPlayer = tier.name === playerTierName;
          const isGM = tier.name === 'Grandmaster';
          return (
            <div
              key={tier.name}
              className="relative flex items-center justify-center transition-all"
              style={{
                width: `${pct}%`,
                background: isGM
                  ? 'linear-gradient(135deg, hsl(45 100% 50%), hsl(35 100% 45%), hsl(45 100% 55%))'
                  : `hsl(var(--${tier.color}))`,
                opacity: isPlayer ? 1 : 0.5,
                boxShadow: isPlayer ? `0 0 8px 2px hsl(var(--${tier.color}) / 0.5)` : undefined,
              }}
            >
              {pct >= 8 && (
                <span className="text-[9px] font-bold text-white drop-shadow-sm">{pct}%</span>
              )}
              {isPlayer && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between px-0.5">
        {RATING_TIERS.map((tier) => {
          const pct = distribution[tier.name] || 0;
          if (pct < 5) return null;
          return (
            <span
              key={tier.name}
              className="text-[9px] text-muted-foreground"
              style={{ width: `${pct}%`, textAlign: 'center' }}
            >
              {tier.name.slice(0, 3)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ModeStandingCard({ mode, iq, distribution }: { mode: string; iq: number; distribution: TierDistribution }) {
  const tier = getTier(iq);
  const percentile = getPercentile(distribution, tier.name);
  const isGM = tier.name === 'Grandmaster';

  return (
    <Card className="min-w-[280px] flex-shrink-0">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{MODE_LABELS[mode] || mode}</span>
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded"
              style={{
                background: isGM
                  ? 'linear-gradient(135deg, hsl(45 100% 50%), hsl(35 100% 45%))'
                  : `hsl(var(--${tier.color}) / 0.15)`,
                color: isGM ? '#0A0A0A' : `hsl(var(--${tier.color}))`,
              }}
            >
              {tier.name}
            </span>
            <span className="text-xs font-mono text-muted-foreground">{iq}</span>
          </div>
        </div>
        <TierBar distribution={distribution} playerTierName={tier.name} />
        <p className="text-xs text-center">
          Top <span className="font-bold text-primary">{percentile}%</span> of {MODE_LABELS[mode] || mode} players
        </p>
      </CardContent>
    </Card>
  );
}

export function GlobalStanding({ modeRatings }: { modeRatings: ModeRating[] }) {
  // Try to fetch live tier counts
  const { data: liveDistributions } = useQuery({
    queryKey: ['global-tier-distributions'],
    queryFn: async () => {
      // Get mode rating counts grouped by tier
      const { data: modeData } = await supabase
        .from('player_mode_ratings' as any)
        .select('game_mode, iq') as any;

      if (!modeData || modeData.length === 0) return null;

      const modeCounts: Record<string, Record<string, number>> = {};
      for (const row of modeData as Array<{ game_mode: string; iq: number }>) {
        if (!modeCounts[row.game_mode]) {
          modeCounts[row.game_mode] = {};
          for (const t of RATING_TIERS) modeCounts[row.game_mode][t.name] = 0;
        }
        const tier = getTier(row.iq);
        modeCounts[row.game_mode][tier.name]++;
      }
      return modeCounts;
    },
    staleTime: 60000,
  });

  const distributions = useMemo(() => {
    const result: Record<string, TierDistribution> = {};
    const modes = ['klondike', 'freecell', 'realm'];
    for (const mode of modes) {
      if (liveDistributions && liveDistributions[mode]) {
        result[mode] = computeDistribution(liveDistributions[mode]);
      } else {
        result[mode] = FABRICATED_DISTRIBUTION;
      }
    }
    return result;
  }, [liveDistributions]);

  if (modeRatings.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Global Standing
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {modeRatings.map((mr) => (
            <ModeStandingCard
              key={mr.game_mode}
              mode={mr.game_mode}
              iq={mr.iq}
              distribution={distributions[mr.game_mode] || FABRICATED_DISTRIBUTION}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
