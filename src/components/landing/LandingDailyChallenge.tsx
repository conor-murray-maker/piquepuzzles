import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface ChallengeInfo {
  id: string;
  game_mode: string;
  difficulty: string | null;
  completionCount: number;
}

function getModeLabel(mode: string) {
  if (mode === 'freecell') return 'FreeCell';
  if (mode === 'realm') return 'Realm';
  return 'Klondike';
}

function useCountdown() {
  const [text, setText] = useState('');
  useEffect(() => {
    function update() {
      const now = new Date();
      const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diff = utcMidnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setText(`${h}h ${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return text;
}

export default function LandingDailyChallenge({ onSignIn }: { onSignIn: () => void }) {
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const countdown = useCountdown();

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split('T')[0];
      const { data: challenge } = await supabase
        .from('daily_challenges')
        .select('id, game_mode, difficulty')
        .eq('date', today)
        .maybeSingle();
      
      if (!challenge) {
        setLoaded(true);
        return;
      }

      const { count } = await supabase
        .from('daily_challenge_results')
        .select('id', { count: 'exact', head: true })
        .eq('challenge_id', challenge.id);

      setInfo({
        id: challenge.id,
        game_mode: challenge.game_mode,
        difficulty: challenge.difficulty,
        completionCount: count ?? 0,
      });
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return null;
  if (!info) return null;

  return (
    <motion.section
      className="px-5 py-16 max-w-md mx-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="rounded-xl border border-border/50 bg-card/30 p-5 space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Flame className="w-4 h-4 text-destructive" />
          <span className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium">
            Daily Challenge
          </span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {getModeLabel(info.game_mode)}
          </span>
          {info.difficulty && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {info.difficulty}
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground/60">
          <span>Resets in {countdown}</span>
          {info.completionCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {info.completionCount} completed
            </span>
          )}
        </div>

        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={onSignIn}>
            Try Today's Challenge
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
