import { motion } from 'framer-motion';
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
    <section className="px-5 py-8 max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium mb-4 text-center">
          Pique IQ Tiers
        </h2>

        <div className="flex items-center justify-center gap-[3px] mb-3">
          {RATING_TIERS.map((tier, i) => {
            const isGM = tier.name === 'Grandmaster';
            const isBronze = tier.name === 'Bronze';
            return (
              <div key={tier.name} className="flex flex-col items-center px-1.5 py-1.5 rounded-lg relative">
                <div
                  className={`w-2.5 h-2.5 rounded-full mb-1 ${isGM ? 'gm-shimmer' : ''}`}
                  style={{ backgroundColor: TIER_COLORS[tier.name] }}
                />
                <span className={`text-[9px] font-medium ${isGM ? 'gm-shimmer-text' : 'text-muted-foreground/70'}`}>
                  {tier.name}
                </span>
                {isBronze && (
                  <span className="text-[7px] text-muted-foreground/50 mt-0.5 whitespace-nowrap">
                    Everyone starts here
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground/60 text-center">
          Seven tiers. One number that tells you exactly where you stand.
        </p>
      </motion.div>
    </section>
  );
}
