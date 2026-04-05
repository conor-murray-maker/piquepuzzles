import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { KlondikeState, FreeCellState, GameMode } from '@/game/types';
import { toast } from 'sonner';

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
  breakdownItems?: { label: string; value: number }[];
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

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function invokeWithRetry(
  body: Record<string, unknown>,
): Promise<{ data: any; error: any }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data, error } = await supabase.functions.invoke('complete-game', { body });

    // Success
    if (!error && data && !data.error?.includes?.('completion_failed')) {
      return { data, error: null };
    }

    // Don't retry validation/auth errors or duplicates
    const errorMsg = error?.message || data?.error || '';
    if (
      errorMsg === 'duplicate_game' ||
      errorMsg === 'Unauthorized' ||
      errorMsg.startsWith('Invalid')
    ) {
      return { data, error };
    }

    // Retry with exponential backoff
    if (attempt < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[useGamePersistence] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, errorMsg);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { data: null, error: new Error('Game completion failed after 3 attempts') };
}

export function useGamePersistence() {
  const { user, profile } = useAuth();

  const saveGameResult = useCallback(async (
    gameState: KlondikeState | FreeCellState,
    gameMode: GameMode = 'klondike',
    elapsedSeconds: number = 0,
    drawMode: number = 3,
    dealUuid?: string,
    isDaily?: boolean
  ): Promise<GameResult | null> => {
    if (!user || !profile) return null;

    const effectiveDealUuid = dealUuid || (gameState as any).dealUuid || undefined;

    if (!effectiveDealUuid) {
      console.warn('[useGamePersistence] deal_uuid missing — server will fall back to seed-based lookup');
    }

    try {
      const { data, error } = await invokeWithRetry({
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
      });

      if (error) {
        console.error('Failed to save game result after retries:', error);
        toast.error('Could not save game result. Your progress may not have been recorded.');
        return null;
      }

      const r = data as any;

      // Check for server-side completion failure
      if (r?.error === 'completion_failed') {
        console.error('Server reported completion failure:', r.message);
        toast.error('Could not save game result. Your progress may not have been recorded.');
        return null;
      }

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
          undoPenaltyPoints: r.undoPenaltyPoints ?? 0,
          hintsUsed: r.hintsUsed ?? 0,
          undosUsed: r.undosUsed ?? 0,
          breakdownItems: r.breakdown ?? undefined,
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
      toast.error('Could not save game result. Your progress may not have been recorded.');
      return null;
    }
  }, [user, profile]);

  return { saveGameResult, rating: profile?.rating ?? 1000 };
}
