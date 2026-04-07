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

        <div className="flex items-end justify-center gap-3 mb-3 flex-wrap">
          {RATING_TIERS.map((tier) => {
            const isGM = tier.name === 'Grandmaster';
            const isBronze = tier.name === 'Bronze';
            return (
              <div key={tier.name} className="flex flex-col items-center px-1 py-1.5 relative">
                {isBronze && (
                  <ChevronUp className="w-3 h-3 text-muted-foreground/50 mb-0.5" />
                )}
                <div
                  className={`rounded-full mb-1 ${isGM ? 'gm-shimmer' : ''}`}
                  style={{
                    backgroundColor: TIER_COLORS[tier.name],
                    width: isGM ? '14px' : '10px',
                    height: isGM ? '14px' : '10px',
                  }}
                />
                <span className={`font-medium ${isGM ? 'gm-shimmer-text text-[10px]' : 'text-muted-foreground/70 text-[9px]'}`}>
                  {tier.name}
                </span>
                {isBronze && (
                  <span className="text-muted-foreground/50 mt-0.5 whitespace-nowrap" style={{ fontSize: '11px' }}>
                    Everyone starts here
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground/60 text-center mt-4">
          Seven tiers. One number that tells you exactly where you stand.
        </p>
      </motion.div>
    </section>
  );
}
