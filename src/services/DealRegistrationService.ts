import { supabase } from '@/integrations/supabase/client';

/**
 * Registers a deal in the deals table if it doesn't already have a UUID from the queue.
 * Returns the deal UUID. Uses server-side edge function to bypass RLS.
 */
export async function registerDeal(params: {
  seed: number;
  gameMode: string;
  drawMode: number;
  minMoves: number;
  difficultyScore: number;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('register-deal', {
      body: {
        seed: params.seed,
        gameMode: params.gameMode,
        drawMode: params.drawMode,
        minMoves: params.minMoves || 0,
        difficultyScore: params.difficultyScore,
      },
    });

    if (error) {
      console.error('Failed to register deal via edge function:', error);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('Failed to register deal:', err);
    return null;
  }
}
