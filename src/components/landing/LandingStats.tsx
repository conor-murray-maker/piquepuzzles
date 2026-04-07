import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

interface StatData {
  gamesPlayed: number;
  grandmasters: number;
  activeStreaks: number;
}

function roundDown100(n: number): string {
  const rounded = Math.floor(n / 100) * 100;
  return rounded.toLocaleString() + '+';
}

export default function LandingStats() {
  const [stats, setStats] = useState<StatData | null>(null);

  useEffect(() => {
    async function load() {
      const [gamesRes, gmRes, streakRes] = await Promise.all([
        supabase.from('game_history').select('id', { count: 'exact', head: true }),
        supabase.from('player_mode_ratings' as any).select('user_id', { count: 'exact', head: true }).gte('iq', 2500) as any,
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gt('current_streak', 0),
      ]);
      setStats({
        gamesPlayed: gamesRes.count ?? 0,
        grandmasters: (gmRes as any).count ?? 0,
        activeStreaks: streakRes.count ?? 0,
      });
    }
    load();
  }, []);

  if (!stats) return <div className="h-16" />; // reserve space, no spinner

  const items: { label: string; value: string }[] = [];
  if (stats.gamesPlayed >= 500) items.push({ value: roundDown100(stats.gamesPlayed), label: 'Games played' });
  if (stats.grandmasters >= 1) items.push({ value: stats.grandmasters.toLocaleString(), label: 'Grandmasters' });
  if (stats.activeStreaks >= 5) items.push({ value: stats.activeStreaks.toLocaleString(), label: 'Active streaks' });

  return (
    <AnimatePresence>
      <motion.section
        className="px-5 py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground/70">
            Join the sharpest puzzle players on the web.
          </p>
        ) : (
          <div className={`grid gap-4 max-w-md mx-auto text-center ${
            items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
          }`}>
            {items.map(({ value, label }) => (
              <div key={label}>
                <p className="text-lg font-bold font-mono">{value}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
