import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
    const rating = profile?.rating ?? 1000;
    const gamesPlayed = profile?.games_played ?? 0;

    // Use per-mode column from profile if available, fallback to game_history count
    const perModeKey = `games_played_${gameMode}` as keyof typeof profile;
    const profilePerMode = profile?.[perModeKey] as number | undefined;
    const gamesPlayedThisMode = profilePerMode != null && profilePerMode > 0
      ? profilePerMode
      : await getGamesPlayed(gameMode);

    return DealPoolService.getNextDeal(user.id, gameMode, drawMode, gamesPlayed, rating, gamesPlayedThisMode);
  }, [user, profile, getGamesPlayed]);

  return { popNextDeal };
}
