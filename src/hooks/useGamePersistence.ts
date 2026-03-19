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

  /** Register a deal in Supabase (upsert on seed+mode+drawMode). */
  const registerDeal = useCallback(async (
    seed: number,
    gameMode: GameMode,
    drawMode: number,
    minMoves: number,
    ddsInitial: number
  ) => {
    if (!user) return;
    try {
      await (supabase as any).from('deals').upsert({
        seed,
        game_mode: gameMode,
        draw_mode: drawMode,
        min_moves: minMoves,
        dds_initial: ddsInitial,
        dds_blended: ddsInitial,
      }, { onConflict: 'seed,game_mode,draw_mode', ignoreDuplicates: true });
    } catch {
      // Silent — deal might already exist
    }
  }, [user]);

  /**
   * Save game result via server-side edge function.
   * The edge function handles ELO calculation, deal pool updates, and profile updates.
   * No client-side rating calculation — all values come from the server response.
   */
  const saveGameResult = useCallback(async (
    gameState: KlondikeState | FreeCellState,
    gameMode: GameMode = 'klondike',
    elapsedSeconds: number = 0,
    drawMode: number = 3
  ): Promise<{ newRating: number; ratingChange: number; previousRating: number } | null> => {
    if (!user || !profile) return null;

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

  return { saveGameResult, registerDeal, rating: profile?.rating ?? 1000 };
}
