import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTier, RATING_TIERS } from '@/game/types';
import { formatTime } from '@/lib/format';

interface GameRecord {
  id: string;
  won: boolean;
  moves: number;
  time_seconds: number;
  difficulty: string;
  rating_after: number;
  rating_change: number;
  played_at: string;
  hints_used: number;
  undos_used: number;
  game_mode: string;
}

export function usePlayerStats() {
  const { user, profile } = useAuth();

  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['player-game-history', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('game_history')
        .select('*')
        .order('played_at', { ascending: true })
        .limit(1000);
      return (data || []) as GameRecord[];
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const { data: percentile = 50 } = useQuery({
    queryKey: ['rating-percentile', profile?.rating],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_rating_percentile', {
        user_rating: profile?.rating ?? 1000,
      });
      return (data as number) ?? 50;
    },
    enabled: !!profile,
    staleTime: 30000,
  });

  const rating = profile?.rating ?? 1000;
  const tier = getTier(rating);
  const nextTier = RATING_TIERS.find(t => t.min > tier.min);
  const pointsToNextTier = nextTier ? nextTier.min - rating : 0;

  const wins = games.filter(g => g.won);
  const gamesPlayed = games.length;
  const winRate = gamesPlayed > 0 ? Math.round((wins.length / gamesPlayed) * 100) : 0;

  // formatTime imported from @/lib/format

  return {
    puzzleIQ: rating,
    tier,
    pointsToNextTier,
    wins: wins.length,
    gamesPlayed,
    winRate,
    currentStreak: profile?.current_streak ?? 0,
    bestStreak: profile?.best_streak ?? 0,
    avgMoves: wins.length > 0 ? Math.round(wins.reduce((s, g) => s + g.moves, 0) / wins.length) : 0,
    avgTime: wins.length > 0 ? formatTime(Math.round(wins.reduce((s, g) => s + g.time_seconds, 0) / wins.length)) : '--',
    bestTime: wins.length > 0 ? formatTime(Math.min(...wins.map(g => g.time_seconds))) : '--',
    bestMoves: wins.length > 0 ? Math.min(...wins.map(g => g.moves)) : 0,
    gameBreakdown: {
      klondike: games.filter(g => !g.game_mode || g.game_mode === 'klondike').length,
      freecell: games.filter(g => g.game_mode === 'freecell').length,
    },
    games,
    percentile,
    profile,
    loading: gamesLoading,
    formatTime,
  };
}
