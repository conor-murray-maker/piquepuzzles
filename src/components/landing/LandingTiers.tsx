import { motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { RATING_TIERS } from '@/game/types';

const TIER_COLORS: Record<string, string> = {
  Bronze: 'hsl(var(--bronze))',
  Silver: 'hsl(var(--silver))',
  Gold: 'hsl(var(--gold))',
  Platinum: 'hsl(var(--platinum))',
  Elite: 'hsl(var(--elite))',
  Master: 'hsl(var(--master))',
  Grandmaster: 'hsl(var(--grandmaster))',
};

export default function LandingTiers() {
  return (
    <section className="px-5 py-16 max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium mb-8 text-center">
          Pique IQ Tiers
        </h2>

        <div className="flex items-center justify-center gap-4 mb-3">
          {RATING_TIERS.map((tier) => {
            const isGM = tier.name === 'Grandmaster';
            const isBronze = tier.name === 'Bronze';
            return (
              <div key={tier.name} className="flex flex-col items-center" style={{ minWidth: 0 }}>
                <div
                  className={`rounded-full mb-1 ${isGM ? 'gm-shimmer' : ''}`}
                  style={{
                    backgroundColor: TIER_COLORS[tier.name],
                    width: isGM ? '14px' : '10px',
                    height: isGM ? '14px' : '10px',
                  }}
                />
                <span className={`font-medium leading-tight ${isGM ? 'gm-shimmer-text text-[9px]' : 'text-muted-foreground/70 text-[8px]'}`}>
                  {tier.name}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground/50 text-center mb-1">
          <ChevronUp className="w-3 h-3 inline-block -mt-0.5" />
          {' '}Everyone starts at Bronze
        </p>

        <p className="text-xs text-muted-foreground/60 text-center mt-4">
          Seven tiers. One number that tells you exactly where you stand.
        </p>
      </motion.div>
    </section>
  );
}
