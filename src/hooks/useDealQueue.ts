import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { GameMode, DrawMode } from '@/game/types';
import { DealPoolService, VerifiedDeal } from '@/services/DealPoolService';

export type { VerifiedDeal as QueuedDeal };

export function useDealQueue() {
  const { user, profile } = useAuth();

  const popNextDeal = useCallback(async (
    gameMode: GameMode,
    drawMode: DrawMode = 3
  ): Promise<VerifiedDeal | null> => {
    if (!user) return null;
    const gamesPlayed = profile?.games_played ?? 0;
    return DealPoolService.getNextDeal(user.id, gameMode, drawMode, gamesPlayed);
  }, [user, profile]);

  const refillQueue = useCallback(async (gameMode: GameMode, drawMode: DrawMode = 3) => {
    if (!user) return;
    // Fire and forget
    DealPoolService.bufferDeals(user.id, gameMode, drawMode);
  }, [user]);

  return { popNextDeal, refillQueue };
}
