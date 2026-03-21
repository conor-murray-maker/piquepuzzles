import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { GameMode, DrawMode } from '@/game/types';
import { DealPoolService, VerifiedDeal } from '@/services/DealPoolService';

export type { VerifiedDeal as QueuedDeal };

export function useDealQueue() {
  const { user } = useAuth();

  const popNextDeal = useCallback(async (
    gameMode: GameMode,
    drawMode: DrawMode = 3
  ): Promise<VerifiedDeal | null> => {
    if (!user) return null;
    return DealPoolService.getNextDeal(user.id, gameMode, drawMode);
  }, [user]);

  const refillQueue = useCallback(async (gameMode: GameMode, drawMode: DrawMode = 3) => {
    if (!user) return;
    // Fire and forget
    DealPoolService.bufferDeals(user.id, gameMode, drawMode);
  }, [user]);

  return { popNextDeal, refillQueue };
}
