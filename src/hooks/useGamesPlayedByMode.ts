import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Derives per-mode games_played from game_history.
 * Used for per-mode onboarding (first 3 games per mode = Easy).
 */
export function useGamesPlayedByMode() {
  const { user } = useAuth();

  const getGamesPlayed = useCallback(async (gameMode: string): Promise<number> => {
    if (!user) return 999;
    try {
      const { count } = await supabase
        .from('game_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('game_mode', gameMode);
      return count ?? 0;
    } catch {
      return 999; // Default to non-onboarding on error
    }
  }, [user]);

  return { getGamesPlayed };
}
