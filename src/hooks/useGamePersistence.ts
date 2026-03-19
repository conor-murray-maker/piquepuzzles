import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { KlondikeState, FreeCellState, GameMode } from '@/game/types';

interface CompleteGameResponse {
  finalDelta: number;
  newRating: number;
  previousRating: number;
  newTier: string;
  performanceModifier: number;
  dealDDS: number;
}

export function useGamePersistence() {
  const { user, profile, refreshProfile } = useAuth();

  /**
   * Save game result via server-side edge function.
   * dealUuid is required — if missing, logs an error and does not call the edge function.
   */
  const saveGameResult = useCallback(async (
    gameState: KlondikeState | FreeCellState,
    gameMode: GameMode = 'klondike',
    elapsedSeconds: number = 0,
    drawMode: number = 3,
    dealUuid?: string,
    isDaily?: boolean
  ): Promise<{ newRating: number; ratingChange: number; previousRating: number } | null> => {
    if (!user || !profile) return null;

    const effectiveDealUuid = dealUuid || (gameState as any).dealUuid;

    if (!effectiveDealUuid) {
      console.error('Cannot save game result: deal_uuid is missing. Game will not be recorded.');
      return null;
    }

    try {
      const { data, error } = await supabase.functions.invoke('complete-game', {
        body: {
          dealSeed: (gameState as any).seed ?? 0,
          gameMode,
          drawMode,
          result: gameState.isWon ? 'win' : 'loss',
          actualMoves: gameState.moves,
          actualTime: elapsedSeconds,
          hintsUsed: gameState.hintsUsed,
          undosUsed: gameState.undosUsed,
          dealId: gameState.dealId,
          dealUuid: effectiveDealUuid,
          isDaily: isDaily || false,
        },
      });

      if (error) throw error;

      const response = data as CompleteGameResponse;
      await refreshProfile();

      return {
        newRating: response.newRating,
        ratingChange: response.finalDelta,
        previousRating: response.previousRating,
      };
    } catch (err) {
      console.error('Failed to save game result via edge function:', err);
      return null;
    }
  }, [user, profile, refreshProfile]);

  return { saveGameResult, rating: profile?.rating ?? 1000 };
}
