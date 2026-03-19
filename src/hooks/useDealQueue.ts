import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GameMode, DrawMode } from '@/game/types';
import { createVerifiedKlondikeGame, createVerifiedFreeCellGame } from '@/game/solver';

export interface QueuedDeal {
  queueId: string;
  dealUuid: string;
  seed: number;
  gameMode: string;
  tier: string;
  minMoves: number;
  ddsInitial: number;
  ddsBlended: number;
  difficulty: string;
  difficultyScore: number;
  drawMode: number;
}

function ddsToLabel(dds: number): string {
  if (dds <= 25) return 'Easy';
  if (dds <= 55) return 'Medium';
  if (dds <= 80) return 'Hard';
  return 'Expert';
}

export function useDealQueue() {
  const { user } = useAuth();

  /**
   * Pop the next unserved deal from the queue for this user+mode.
   * Returns deal info including the dealUuid from the deals table.
   */
  const popNextDeal = useCallback(async (
    gameMode: GameMode,
    drawMode: DrawMode = 3
  ): Promise<QueuedDeal | null> => {
    if (!user) return null;

    try {
      // Get next unserved deal from queue with deal info
      const { data: queueItems } = await (supabase as any)
        .from('deal_queue')
        .select('id, tier, deal_id, deals(id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended)')
        .eq('user_id', user.id)
        .eq('game_mode', gameMode)
        .is('served_at', null)
        .order('queued_at', { ascending: true })
        .limit(1);

      if (!queueItems || queueItems.length === 0) return null;

      const item = queueItems[0];
      const deal = item.deals;
      if (!deal) return null;

      // Mark as served
      await (supabase as any)
        .from('deal_queue')
        .update({ served_at: new Date().toISOString() })
        .eq('id', item.id);

      // Track in user_played_deals
      await (supabase as any)
        .from('user_played_deals')
        .upsert(
          { user_id: user.id, deal_id: deal.id },
          { onConflict: 'user_id,deal_id', ignoreDuplicates: true }
        );

      // Update calibration progress if calibration deal
      if (item.tier === 'calibration') {
        const { data: progress } = await (supabase as any)
          .from('user_calibration_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('game_mode', gameMode)
          .single();

        if (progress) {
          const played = [...(progress.calibration_deal_ids_played || []), deal.id];
          await (supabase as any)
            .from('user_calibration_progress')
            .update({ calibration_deal_ids_played: played, updated_at: new Date().toISOString() })
            .eq('id', progress.id);
        } else {
          await (supabase as any)
            .from('user_calibration_progress')
            .insert({
              user_id: user.id,
              game_mode: gameMode,
              calibration_deal_ids_played: [deal.id],
            });
        }
      }

      return {
        queueId: item.id,
        dealUuid: deal.id,
        seed: deal.seed,
        gameMode: deal.game_mode,
        tier: item.tier,
        minMoves: deal.min_moves,
        ddsInitial: deal.dds_initial,
        ddsBlended: deal.dds_blended,
        difficulty: ddsToLabel(deal.dds_blended),
        difficultyScore: deal.dds_blended,
        drawMode: deal.draw_mode,
      };
    } catch (err) {
      console.warn('Failed to pop deal from queue:', err);
      return null;
    }
  }, [user]);

  /**
   * Refill the deal queue in the background.
   * Generates fresh deals client-side, then calls the edge function
   * to insert them and pick calibration deals.
   */
  const refillQueue = useCallback(async (gameMode: GameMode, drawMode: DrawMode = 3) => {
    if (!user) return;

    try {
      // Count unserved deals
      const { count } = await (supabase as any)
        .from('deal_queue')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('game_mode', gameMode)
        .is('served_at', null);

      const needed = 10 - (count ?? 0);
      if (needed <= 0) return;

      const calibrationCount = Math.max(1, Math.round(needed * 0.2));
      const freshCount = needed - calibrationCount;

      // Generate fresh verified deals client-side
      const freshDeals: Array<{ seed: number; minMoves: number; ddsInitial: number }> = [];
      for (let i = 0; i < freshCount; i++) {
        try {
          if (gameMode === 'klondike') {
            const game = createVerifiedKlondikeGame(drawMode as DrawMode);
            if (game.seed !== undefined && game.minMoves && game.minMoves > 0) {
              freshDeals.push({
                seed: game.seed,
                minMoves: game.minMoves,
                ddsInitial: game.difficultyScore,
              });
            }
          } else {
            const game = createVerifiedFreeCellGame();
            if (game.seed !== undefined && game.minMoves && game.minMoves > 0) {
              freshDeals.push({
                seed: game.seed,
                minMoves: game.minMoves,
                ddsInitial: game.difficultyScore,
              });
            }
          }
        } catch {
          // Skip failed deal generation
        }
      }

      // Call edge function to manage queue
      await supabase.functions.invoke('refill-deal-queue', {
        body: { gameMode, drawMode, freshDeals, calibrationCount },
      });
    } catch (err) {
      console.warn('Failed to refill deal queue:', err);
    }
  }, [user]);

  return { popNextDeal, refillQueue };
}
