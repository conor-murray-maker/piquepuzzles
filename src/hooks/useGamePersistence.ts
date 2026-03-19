import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { KlondikeState, FreeCellState, GameMode } from '@/game/types';
import { calculateRatingChange } from '@/game/rating';

export function useGamePersistence() {
  const { user, profile, refreshProfile } = useAuth();

  const saveGameResult = useCallback(async (gameState: KlondikeState | FreeCellState, gameMode: GameMode = 'klondike') => {
    if (!user || !profile) return null;

    const timeSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);
    const ratingChange = calculateRatingChange(profile.rating, {
      won: gameState.isWon,
      moves: gameState.moves,
      timeSeconds,
      hintsUsed: gameState.hintsUsed,
      undosUsed: gameState.undosUsed,
      difficultyScore: gameState.difficultyScore,
      difficulty: gameState.difficulty,
    });

    const newRating = Math.max(0, profile.rating + ratingChange);
    const newStreak = gameState.isWon ? profile.current_streak + 1 : 0;

    await supabase.from('game_history').insert({
      user_id: user.id,
      deal_id: gameState.dealId,
      won: gameState.isWon,
      moves: gameState.moves,
      time_seconds: timeSeconds,
      hints_used: gameState.hintsUsed,
      undos_used: gameState.undosUsed,
      difficulty: gameState.difficulty,
      difficulty_score: gameState.difficultyScore,
      rating_before: profile.rating,
      rating_after: newRating,
      rating_change: ratingChange,
      game_mode: gameMode,
    } as any);

    await supabase.from('profiles').update({
      rating: newRating,
      games_played: profile.games_played + 1,
      games_won: profile.games_won + (gameState.isWon ? 1 : 0),
      current_streak: newStreak,
      best_streak: Math.max(profile.best_streak, newStreak),
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    await refreshProfile();

    return { newRating, ratingChange };
  }, [user, profile, refreshProfile]);

  return { saveGameResult, rating: profile?.rating ?? 1000 };
}
