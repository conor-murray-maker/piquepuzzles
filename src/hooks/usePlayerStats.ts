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
  final_delta: number | null;
}

export interface ModeRating {
  game_mode: string;
  display_name: string;
  iq: number;
  games_played: number;
  todayDelta: number;
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

  // Fetch per-mode ratings
  const { data: rawModeRatings = [] } = useQuery({
    queryKey: ['player-mode-ratings', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const [modesRes, ratingsRes] = await Promise.all([
        supabase.from('game_modes' as any).select('id, display_name, is_active').eq('is_active', true) as any,
        supabase.from('player_mode_ratings' as any).select('game_mode, iq, games_played').eq('user_id', user.id) as any,
      ]);
      const modes = ((modesRes as any).data || []) as Array<{ id: string; display_name: string; is_active: boolean }>;
      const ratings = ((ratingsRes as any).data || []) as Array<{ game_mode: string; iq: number; games_played: number }>;
      const ratingMap = new Map(ratings.map(r => [r.game_mode, r]));

      return modes.map(m => ({
        game_mode: m.id,
        display_name: m.display_name,
        iq: ratingMap.get(m.id)?.iq ?? 1000,
        games_played: ratingMap.get(m.id)?.games_played ?? 0,
      }));
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const { data: percentile = 0 } = useQuery({
    queryKey: ['rating-percentile', profile?.rating],
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('games_played', 3);
      if (!count || count < 10) return 0;
      const { data } = await supabase.rpc('get_rating_percentile', {
        user_rating: profile?.rating ?? 1000,
      });
      return (data as number) ?? 0;
    },
    enabled: !!profile && (profile.games_played ?? 0) >= 3,
    staleTime: 30000,
  });

  const rating = profile?.rating ?? 1000;
  const tier = getTier(rating);
  const nextTier = RATING_TIERS.find(t => t.min > tier.min);
  const pointsToNextTier = nextTier ? nextTier.min - rating : 0;

  const wins = games.filter(g => g.won);
  const gamesPlayed = games.length;
  const winRate = gamesPlayed > 0 ? Math.round((wins.length / gamesPlayed) * 100) : 0;

  // Compute today's delta per mode from game_history
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();
  const todayDeltaByMode = new Map<string, number>();
  for (const g of games) {
    if (g.played_at >= todayISO && g.final_delta != null) {
      const mode = g.game_mode || 'klondike';
      todayDeltaByMode.set(mode, (todayDeltaByMode.get(mode) ?? 0) + g.final_delta);
    }
  }

  const modeRatings: ModeRating[] = rawModeRatings.map(mr => ({
    ...mr,
    todayDelta: todayDeltaByMode.get(mr.game_mode) ?? 0,
  }));

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
      realm: games.filter(g => g.game_mode === 'realm').length,
    },
    modeRatings,
    games,
    percentile,
    profile,
    loading: gamesLoading,
    formatTime,
  };
}
