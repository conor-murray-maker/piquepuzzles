import { supabase } from '@/integrations/supabase/client';

/**
 * Registers a deal in the deals table if it doesn't already have a UUID from the queue.
 * Returns the deal UUID.
 */
export async function registerDeal(params: {
  seed: number;
  gameMode: string;
  drawMode: number;
  minMoves: number;
  difficultyScore: number;
}): Promise<string | null> {
  try {
    const { data } = await (supabase as any).from('deals').upsert({
      seed: params.seed,
      game_mode: params.gameMode,
      draw_mode: params.drawMode,
      min_moves: params.minMoves || 0,
      dds_initial: params.difficultyScore,
      dds_blended: params.difficultyScore,
      tier: 'fresh',
    }, { onConflict: 'seed,game_mode,draw_mode', ignoreDuplicates: true })
    .select('id')
    .single();

    return data?.id ?? null;
  } catch (err) {
    console.error('Failed to register deal:', err);
    return null;
  }
}
