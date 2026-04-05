import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RATING_TIERS, getTier } from '@/game/types';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { ModeRating } from '@/hooks/usePlayerStats';

const FABRICATED_DISTRIBUTIONS: Record<string, Record<string, number>> = {
  composite: {
    Bronze: 8, Silver: 22, Gold: 31.9, Platinum: 24,
    Elite: 10, Master: 4, Grandmaster: 0.1,
  },
  realm: {
    Bronze: 18, Silver: 24, Gold: 25, Platinum: 17,
    Elite: 10, Master: 5, Grandmaster: 1,
  },
  freecell: {
    Bronze: 20, Silver: 26, Gold: 24, Platinum: 16,
    Elite: 9, Master: 4, Grandmaster: 1,
  },
  klondike: {
    Bronze: 16, Silver: 25, Gold: 28, Platinum: 18,
    Elite: 8, Master: 4, Grandmaster: 1,
  },
};

const MIN_PLAYERS_FOR_LIVE = 50;

interface TierDistribution {
  [tierName: string]: number;
}

function computeDistribution(counts: Record<string, number>): TierDistribution | null {
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (total < MIN_PLAYERS_FOR_LIVE) return null;
  const dist: TierDistribution = {};
  for (const tier of RATING_TIERS) {
    dist[tier.name] = Math.max(0, +( ((counts[tier.name] || 0) / total) * 100 ).toFixed(1));
  }
  const sum = Object.values(dist).reduce((s, v) => s + v, 0);
  if (sum > 0 && Math.abs(sum - 100) > 0.01) {
    const largest = Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0];
    dist[largest] = +(dist[largest] + (100 - sum)).toFixed(1);
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
  const raw = abovePercent + currentTierPercent / 2;
  return Math.max(0.1, +raw.toFixed(1));
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
              {pct >= 6 && (
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
          if (pct < 4) return null;
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

const MODE_LABELS: Record<string, string> = {
  klondike: 'Klondike',
  freecell: 'FreeCell',
  realm: 'Realm',
  composite: 'Pique',
};

interface GlobalStandingProps {
  modeRatings: ModeRating[];
  activeTab: string; // 'all' | 'klondike' | 'freecell' | 'realm'
  compositeIQ: number;
}

export function GlobalStanding({ modeRatings, activeTab, compositeIQ }: GlobalStandingProps) {
  const { data: liveDistributions } = useQuery({
    queryKey: ['global-tier-distributions'],
    queryFn: async () => {
      const { data: modeData } = await supabase
        .from('player_mode_ratings')
        .select('game_mode, iq');

      if (!modeData || modeData.length === 0) return null;

      const modeCounts: Record<string, Record<string, number>> = {};
      const compositeCounts: Record<string, number> = {};
      for (const t of RATING_TIERS) compositeCounts[t.name] = 0;

      for (const row of modeData) {
        if (!modeCounts[row.game_mode]) {
          modeCounts[row.game_mode] = {};
          for (const t of RATING_TIERS) modeCounts[row.game_mode][t.name] = 0;
        }
        const tier = getTier(row.iq);
        modeCounts[row.game_mode][tier.name]++;
      }

      // Composite: average across modes per user would be ideal,
      // but we approximate by aggregating all mode ratings
      for (const row of modeData) {
        const tier = getTier(row.iq);
        compositeCounts[tier.name]++;
      }

      return { modes: modeCounts, composite: compositeCounts };
    },
    staleTime: 60000,
  });

  const { distribution, iq, label } = useMemo(() => {
    const isComposite = activeTab === 'all';
    const modeKey = isComposite ? 'composite' : activeTab;

    // Determine IQ
    let currentIQ: number;
    if (isComposite) {
      currentIQ = compositeIQ;
    } else {
      currentIQ = modeRatings.find(r => r.game_mode === activeTab)?.iq ?? 1000;
    }

    // Determine distribution
    let dist: TierDistribution;
    if (isComposite && liveDistributions?.composite) {
      dist = computeDistribution(liveDistributions.composite) ?? FABRICATED_DISTRIBUTIONS.composite;
    } else if (!isComposite && liveDistributions?.modes?.[activeTab]) {
      dist = computeDistribution(liveDistributions.modes[activeTab]) ?? FABRICATED_DISTRIBUTIONS[activeTab] ?? FABRICATED_DISTRIBUTIONS.composite;
    } else {
      dist = FABRICATED_DISTRIBUTIONS[modeKey] ?? FABRICATED_DISTRIBUTIONS.composite;
    }

    return {
      distribution: dist,
      iq: currentIQ,
      label: MODE_LABELS[modeKey] || 'Pique',
    };
  }, [activeTab, compositeIQ, modeRatings, liveDistributions]);

  const tier = getTier(iq);
  const percentile = getPercentile(distribution, tier.name);
  const isGM = tier.name === 'Grandmaster';

  if (modeRatings.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Global Standing
            </h2>
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
            Top <span className="font-bold text-primary">{percentile}%</span> of {label} players
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
