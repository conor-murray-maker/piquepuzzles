import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ddsToLabel, formatTimeRaw } from '@/lib/format';
import { Calendar, Timer, Hash, Trophy, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DailyChallenge {
  id: string;
  date: string;
  game_mode: string;
  deal_id: string;
  deals?: {
    seed: number;
    draw_mode: number;
    dds_blended: number;
    min_moves: number;
  };
}

interface Completion {
  user_id: string;
  result: string;
  actual_moves: number;
  actual_time: number;
  final_delta: number;
  completed_at: string;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  actual_moves: number;
  actual_time: number;
  result: string;
}

export default function Daily() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [myCompletion, setMyCompletion] = useState<Completion | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState('');

  const todayStr = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString().split('T')[0];
  }, []);

  // Countdown timer to midnight UTC
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch today's challenge
  useEffect(() => {
    async function fetchChallenge() {
      setLoading(true);
      try {
        const { data: ch } = await (supabase as any)
          .from('daily_challenges')
          .select('*, deals(seed, draw_mode, dds_blended, min_moves)')
          .eq('date', todayStr)
          .single();

        if (ch) {
          setChallenge(ch);

          // Check my completion
          if (user) {
            const { data: comp } = await (supabase as any)
              .from('daily_challenge_completions')
              .select('*')
              .eq('date', todayStr)
              .eq('user_id', user.id)
              .single();
            setMyCompletion(comp || null);
          }

          // Leaderboard: top 10
          const { data: lb } = await (supabase as any)
            .from('daily_challenge_completions')
            .select('user_id, actual_moves, actual_time, result')
            .eq('date', todayStr)
            .order('result', { ascending: false })
            .order('actual_moves', { ascending: true })
            .order('actual_time', { ascending: true })
            .limit(10);

          // Get display names for leaderboard
          if (lb && lb.length > 0) {
            const userIds = [...new Set(lb.map((e: any) => e.user_id))];
            const { data: profiles } = await (supabase as any)
              .from('profiles')
              .select('id, display_name')
              .in('id', userIds);

            const nameMap: Record<string, string> = {};
            profiles?.forEach((p: any) => { nameMap[p.id] = p.display_name || 'Player'; });

            setLeaderboard(lb.map((e: any) => ({
              ...e,
              display_name: nameMap[e.user_id] || 'Player',
            })));
          }

          // Total attempts
          const { count } = await (supabase as any)
            .from('daily_challenge_completions')
            .select('*', { count: 'exact', head: true })
            .eq('date', todayStr);
          setTotalAttempts(count ?? 0);
        }
      } catch (err) {
        console.warn('Failed to fetch daily challenge:', err);
      }
      setLoading(false);
    }

    fetchChallenge();
  }, [todayStr, user]);

  const handlePlay = () => {
    if (!challenge?.deals) return;
    navigate(
      `/play?mode=${challenge.game_mode}&seed=${challenge.deals.seed}&drawMode=${challenge.deals.draw_mode}&daily=${todayStr}&dailyDealId=${challenge.deal_id}`
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold">Daily Challenge</h1>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 max-w-md mx-auto space-y-6">
        {/* Countdown */}
        <motion.div
          className="stat-card text-center py-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider font-medium">Next challenge in</span>
          </div>
          <p className="font-mono text-xl font-bold">{countdown}</p>
        </motion.div>

        {!challenge ? (
          <motion.div
            className="stat-card text-center py-8 space-y-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="font-semibold">No challenge today</p>
            <p className="text-sm text-muted-foreground">
              The daily challenge pool is being set up. Check back soon!
            </p>
          </motion.div>
        ) : (
          <>
            {/* Challenge info */}
            <motion.div
              className="stat-card py-4 space-y-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold capitalize">{challenge.game_mode}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  ddsToLabel(challenge.deals?.dds_blended ?? 50) === 'Easy'
                    ? 'bg-rating-up/20 text-rating-up'
                    : ddsToLabel(challenge.deals?.dds_blended ?? 50) === 'Medium'
                    ? 'bg-gold/20 text-gold'
                    : ddsToLabel(challenge.deals?.dds_blended ?? 50) === 'Hard'
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-elite/20 text-elite'
                }`}>
                  {ddsToLabel(challenge.deals?.dds_blended ?? 50)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{totalAttempts} player{totalAttempts !== 1 ? 's' : ''} attempted</span>
              </div>
            </motion.div>

            {/* My completion or CTA */}
            {myCompletion ? (
              <motion.div
                className="stat-card py-4 space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center gap-2">
                  <Trophy className={`w-5 h-5 ${myCompletion.result === 'win' ? 'text-gold' : 'text-muted-foreground'}`} />
                  <span className="font-semibold text-sm">
                    {myCompletion.result === 'win' ? 'Completed!' : 'Attempted'}
                  </span>
                  {myCompletion.final_delta !== 0 && (
                    <span className={`text-xs font-mono ${myCompletion.final_delta > 0 ? 'text-rating-up' : 'text-destructive'}`}>
                      {myCompletion.final_delta > 0 ? '+' : ''}{myCompletion.final_delta}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Time</p>
                      <p className="font-mono font-semibold text-sm">{formatTimeRaw(myCompletion.actual_time)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Moves</p>
                      <p className="font-mono font-semibold text-sm">{myCompletion.actual_moves}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Button className="w-full" size="lg" onClick={handlePlay}>
                  Play Today's Challenge
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Daily challenges earn 1.2× rating points
                </p>
              </motion.div>
            )}

            {/* Leaderboard */}
            {leaderboard.length > 0 && (
              <motion.div
                className="stat-card py-4 space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                  Today's Leaderboard
                </h3>
                <div className="space-y-2">
                  {leaderboard.map((entry, i) => (
                    <div
                      key={`${entry.user_id}-${i}`}
                      className={`flex items-center gap-3 text-sm ${
                        entry.user_id === user?.id ? 'font-semibold' : ''
                      }`}
                    >
                      <span className="w-5 text-right text-muted-foreground font-mono text-xs">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate">{entry.display_name}</span>
                      <span className="font-mono text-xs">{entry.actual_moves}m</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatTimeRaw(entry.actual_time)}
                      </span>
                      {entry.result === 'win' && (
                        <Trophy className="w-3 h-3 text-gold flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
