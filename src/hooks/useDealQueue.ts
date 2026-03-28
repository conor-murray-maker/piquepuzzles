import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { GameMode } from '@/game/types';
import { DealPoolService, VerifiedDeal } from '@/services/DealPoolService';
import { useGamesPlayedByMode } from '@/hooks/useGamesPlayedByMode';

export type { VerifiedDeal as QueuedDeal };

export function useDealQueue() {
  const { user, profile } = useAuth();
  const { getGamesPlayed } = useGamesPlayedByMode();

  const popNextDeal = useCallback(async (
    gameMode: GameMode,
    drawMode: number = 3
  ): Promise<VerifiedDeal | null> => {
    if (!user) return null;
    const gamesPlayed = profile?.games_played ?? 0;

    // Use per-mode column from profile if available, fallback to game_history count
    const perModeKey = `games_played_${gameMode}` as keyof typeof profile;
    const profilePerMode = profile?.[perModeKey] as number | undefined;
    const gamesPlayedThisMode = profilePerMode != null && profilePerMode > 0
      ? profilePerMode
      : await getGamesPlayed(gameMode);

    // Fetch mode-specific IQ from player_mode_ratings, NOT composite Pique IQ
    let modeIQ = 1000;
    try {
      const { data } = await (supabase as any)
        .from('player_mode_ratings')
        .select('iq')
        .eq('user_id', user.id)
        .eq('game_mode', gameMode)
        .single();
      if (data?.iq != null) modeIQ = data.iq;
    } catch {
      // Default to 1000 if no rating exists yet
    }

    return DealPoolService.getNextDeal(user.id, gameMode, drawMode, gamesPlayed, modeIQ, gamesPlayedThisMode);
  }, [user, profile, getGamesPlayed]);

  return { popNextDeal };
}
