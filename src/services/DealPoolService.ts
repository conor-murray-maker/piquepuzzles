import { supabase } from '@/integrations/supabase/client';
import { EngineRegistry } from '@/engines/EngineRegistry';
import { PerformanceSignals, GameMode } from '@/engines/PuzzleEngine';
import { DDSService } from './DDSService';
import { generateSeed } from '@/game/deck';

export interface VerifiedDeal {
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

export class DealPoolService {
  /**
   * Get next deal for a user. Tries queue first, then generates on demand.
   */
  static async getNextDeal(userId: string, gameMode: GameMode, drawMode: number = 3, gamesPlayed: number = 999): Promise<VerifiedDeal | null> {
    // New players (< 3 games) get Easy/low-Medium deals exclusively
    if (gamesPlayed < 3) {
      const onboarding = await this.popOnboardingDeal(gameMode);
      if (onboarding) return onboarding;
    }

    // 1. Pop from user's pre-buffered queue
    const queued = await this.popFromQueue(userId, gameMode);
    if (queued) return queued;

    // 2. Generate fresh deal on demand
    return this.generateFreshDeal(gameMode, drawMode);
  }

  /**
   * Buffer deals in background. Fire and forget.
   */
  static async bufferDeals(userId: string, gameMode: GameMode, drawMode: number = 3): Promise<void> {
    try {
      await supabase.functions.invoke('refill-deal-queue', {
        body: { gameMode, drawMode, freshDeals: await this.generateFreshDealBatch(gameMode, drawMode, 8), calibrationCount: 2 },
      });
    } catch (err) {
      console.warn('Failed to buffer deals:', err);
    }
  }

  /**
   * Record a game completion — called by the edge function, but pool stats update is also there.
   * This client method just triggers the refill.
   */
  static async recordCompletion(dealId: string, signals: PerformanceSignals, result: 'win' | 'loss' | 'abandon'): Promise<void> {
    // Pool stats are updated server-side in complete-game edge function
    // This is a no-op on client — actual recording is server-side
  }

  private static async popFromQueue(userId: string, gameMode: string): Promise<VerifiedDeal | null> {
    try {
      const { data: queueItems } = await (supabase as any)
        .from('deal_queue')
        .select('id, tier, deal_id, deals(id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended)')
        .eq('user_id', userId)
        .eq('game_mode', gameMode)
        .is('served_at', null)
        .order('queued_at', { ascending: true })
        .limit(1);

      if (!queueItems?.length) return null;

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
          { user_id: userId, deal_id: deal.id },
          { onConflict: 'user_id,deal_id', ignoreDuplicates: true }
        );

      // Update calibration progress if calibration deal
      if (item.tier === 'calibration') {
        const { data: progress } = await (supabase as any)
          .from('user_calibration_progress')
          .select('*')
          .eq('user_id', userId)
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
              user_id: userId,
              game_mode: gameMode,
              calibration_deal_ids_played: [deal.id],
            });
        }
      }

      return {
        dealUuid: deal.id,
        seed: deal.seed,
        gameMode: deal.game_mode,
        tier: item.tier,
        minMoves: deal.min_moves,
        ddsInitial: deal.dds_initial,
        ddsBlended: deal.dds_blended,
        difficulty: DDSService.ddsToLabel(deal.dds_blended),
        difficultyScore: deal.dds_blended,
        drawMode: deal.draw_mode,
      };
    } catch (err) {
      console.warn('Failed to pop deal from queue:', err);
      return null;
    }
  }

  /**
   * Serve Easy or low-Medium deals for new players (games_played < 3).
   * Prioritizes onboarding-reserved Easy deals, then any deal with dds_blended <= 40.
   */
  private static async popOnboardingDeal(gameMode: string): Promise<VerifiedDeal | null> {
    try {
      // First try reserved onboarding deals (Easy)
      const { data: easyDeals } = await (supabase as any)
        .from('deals')
        .select('id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended')
        .eq('game_mode', gameMode)
        .eq('reserved_for', 'onboarding')
        .limit(5);

      let deal = easyDeals?.[0];

      // Fallback: any Easy or low-Medium deal (dds_blended <= 40)
      if (!deal) {
        const { data: lowDeals } = await (supabase as any)
          .from('deals')
          .select('id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended')
          .eq('game_mode', gameMode)
          .lte('dds_blended', 40)
          .order('dds_blended', { ascending: true })
          .limit(10);

        if (lowDeals?.length) {
          deal = lowDeals[Math.floor(Math.random() * lowDeals.length)];
        }
      }

      if (!deal) return null;

      return {
        dealUuid: deal.id,
        seed: deal.seed,
        gameMode: deal.game_mode,
        tier: 'onboarding',
        minMoves: deal.min_moves,
        ddsInitial: deal.dds_initial,
        ddsBlended: deal.dds_blended,
        difficulty: DDSService.ddsToLabel(deal.dds_blended),
        difficultyScore: deal.dds_blended,
        drawMode: deal.draw_mode,
      };
    } catch (err) {
      console.warn('Failed to pop onboarding deal:', err);
      return null;
    }
  }

  private static generateFreshDeal(gameMode: string, drawMode: number): VerifiedDeal | null {
    try {
      const engine = EngineRegistry.get(gameMode);
      for (let attempt = 0; attempt < 5; attempt++) {
        const seed = generateSeed();
        const deal = engine.generateDeal(seed);
        const result = engine.verifySolvable(deal, 50);
        if (result.solvable && result.minSolutionLength > 0) {
          const dds = result.complexityScore;
          return {
            dealUuid: '', // Will be set after DB insert
            seed,
            gameMode,
            tier: 'fresh',
            minMoves: result.minSolutionLength,
            ddsInitial: dds,
            ddsBlended: dds,
            difficulty: DDSService.ddsToLabel(dds),
            difficultyScore: dds,
            drawMode,
          };
        }
      }
      console.error('Could not generate verified deal after 5 attempts');
      return null;
    } catch (err) {
      console.error('Deal generation failed:', err);
      return null;
    }
  }

  private static async generateFreshDealBatch(
    gameMode: string,
    drawMode: number,
    count: number
  ): Promise<Array<{ seed: number; minMoves: number; ddsInitial: number }>> {
    const engine = EngineRegistry.get(gameMode);
    const deals: Array<{ seed: number; minMoves: number; ddsInitial: number }> = [];

    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const seed = generateSeed();
          const deal = engine.generateDeal(seed);
          const result = engine.verifySolvable(deal, 50);
          if (result.solvable && result.minSolutionLength > 0) {
            deals.push({
              seed,
              minMoves: result.minSolutionLength,
              ddsInitial: result.complexityScore,
            });
            break;
          }
        } catch {
          // Skip failed attempt
        }
      }
    }
    return deals;
  }
}
