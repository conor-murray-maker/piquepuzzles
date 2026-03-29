import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { KlondikeState, FreeCellState, GameMode } from '@/game/types';

export interface ScoreBreakdownData {
  baseDelta: number;
  finalDelta: number;
  dealDDS: number;
  dealAvgTime: number | null;
  dealAvgMoves: number | null;
  timeBonusPoints: number;
  movesBonusPoints: number;
  hintPenaltyPoints: number;
  undoPenaltyPoints: number;
  hintsUsed: number;
  undosUsed: number;
}

export interface ModeIQData {
  modeIQ: number;
  previousModeIQ: number;
  modeIQDelta: number;
  gameMode: string;
  puzzleIQ: number;
  puzzleIQDelta: number;
}

export interface GameResult {
  newRating: number;
  ratingChange: number;
  previousRating: number;
  breakdown: ScoreBreakdownData;
  modeIQData?: ModeIQData;
  streakUpdate?: {
    currentStreak: number;
    bestStreak: number;
    freezeUsed: boolean;
    milestoneReached: number | null;
  };
}

export function useGamePersistence() {
  const { user, profile, refreshProfile } = useAuth();

  const saveGameResult = useCallback(async (
    gameState: KlondikeState | FreeCellState,
    gameMode: GameMode = 'klondike',
    elapsedSeconds: number = 0,
    drawMode: number = 3,
    dealUuid?: string,
    isDaily?: boolean
  ): Promise<GameResult | null> => {
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
          dealDDS: gameState.difficultyScore || 0,
          timezoneOffset: new Date().getTimezoneOffset(),
        },
      });

      if (error) throw error;

      const r = data as any;
      await refreshProfile();

      const gameResult: GameResult = {
        newRating: r.newRating,
        ratingChange: r.puzzleIQDelta ?? r.finalDelta,
        previousRating: r.previousRating,
        breakdown: {
          baseDelta: r.baseDelta ?? r.finalDelta,
          finalDelta: r.finalDelta,
          dealDDS: r.dealDDS ?? 0,
          dealAvgTime: r.dealAvgTime ?? null,
          dealAvgMoves: r.dealAvgMoves ?? null,
          timeBonusPoints: r.timeBonusPoints ?? 0,
          movesBonusPoints: r.movesBonusPoints ?? 0,
          hintPenaltyPoints: r.hintPenaltyPoints ?? 0,
          hintsUsed: r.hintsUsed ?? 0,
        },
        modeIQData: r.modeIQ != null ? {
          modeIQ: r.modeIQ,
          previousModeIQ: r.previousModeIQ,
          modeIQDelta: r.modeIQDelta,
          gameMode: r.gameMode,
          puzzleIQ: r.puzzleIQ,
          puzzleIQDelta: r.puzzleIQDelta,
        } : undefined,
        streakUpdate: r.streakUpdate,
      };

      return gameResult;
    } catch (err) {
      console.error('Failed to save game result via edge function:', err);
      return null;
    }
  }, [user, profile, refreshProfile]);

  return { saveGameResult, rating: profile?.rating ?? 1000 };
}
