import { supabase } from '@/integrations/supabase/client';
import { EngineRegistry } from '@/engines/EngineRegistry';
import { GameMode } from '@/engines/PuzzleEngine';
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

/** Skill bracket DDS ranges based on puzzle IQ */
function getSkillBracket(rating: number, gamesPlayed: number): { min: number; max: number } {
  if (gamesPlayed < 3) return { min: 0, max: 35 };
  if (rating < 1100) return { min: 0, max: 40 };
  if (rating < 1300) return { min: 30, max: 65 };
  if (rating < 1500) return { min: 50, max: 80 };
  return { min: 65, max: 100 };
}

function dealRowToVerified(deal: any, tier: string): VerifiedDeal {
  return {
    dealUuid: deal.id,
    seed: deal.seed,
    gameMode: deal.game_mode,
    tier,
    minMoves: deal.min_moves,
    ddsInitial: deal.dds_initial,
    ddsBlended: deal.dds_blended,
    difficulty: DDSService.ddsToLabel(deal.dds_blended),
    difficultyScore: deal.dds_blended,
    drawMode: deal.draw_mode,
  };
}

export class DealPoolService {
  /**
   * Get next deal for a user via priority-ordered direct pool queries.
   * No queue infrastructure needed.
   */
  static async getNextDeal(
    userId: string,
    gameMode: GameMode,
    drawMode: number = 3,
    gamesPlayed: number = 999,
    rating: number = 1000,
    gamesPlayedThisMode: number = 999
  ): Promise<VerifiedDeal | null> {
    // Get user's played deal IDs to exclude
    const playedIds = await this.getUserPlayedDealIds(userId);

    // Priority 1: New players (< 3 games in this mode) get Easy starters
    if (gamesPlayedThisMode < 3) {
      const deal = await this.queryPool(gameMode, playedIds, { min: 0, max: 35 }, 'starter');
      if (deal) {
        await this.markPlayed(userId, deal.id);
        return dealRowToVerified(deal, 'onboarding');
      }
    }

    const bracket = getSkillBracket(rating, gamesPlayedThisMode);

    // Priority 2: Starter deals matching skill bracket
    const starter = await this.queryPool(gameMode, playedIds, bracket, 'starter');
    if (starter) {
      await this.markPlayed(userId, starter.id);
      return dealRowToVerified(starter, 'starter');
    }

    // Priority 3: Fresh deals matching skill bracket
    const fresh = await this.queryPool(gameMode, playedIds, bracket, null);
    if (fresh) {
      await this.markPlayed(userId, fresh.id);
      return dealRowToVerified(fresh, 'fresh');
    }

    // Priority 4: Any unplayed deal regardless of difficulty
    const any = await this.queryPool(gameMode, playedIds, null, null);
    if (any) {
      await this.markPlayed(userId, any.id);
      return dealRowToVerified(any, 'any');
    }

    // Priority 5: Replay oldest-played deal
    const replay = await this.getOldestPlayedDeal(userId, gameMode);
    if (replay) {
      await this.markPlayed(userId, replay.id);
      return dealRowToVerified(replay, 'replay');
    }

    // Priority 6: Generate fallback deal
    console.warn(`[DealPoolService] Fallback generation triggered for ${gameMode} — pool is exhausted`);
    return this.generateAndInsertFallback(userId, gameMode, drawMode, bracket);
  }

  /**
   * Query the deals pool with optional filters, excluding played deals.
   * Orders by ascending pool_attempts to concentrate calibration.
   */
  private static async queryPool(
    gameMode: string,
    playedIds: Set<string>,
    bracket: { min: number; max: number } | null,
    tier: string | null
  ): Promise<any | null> {
    try {
      let query = (supabase as any)
        .from('deals')
        .select('id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended')
        .eq('game_mode', gameMode)
        .order('pool_attempts', { ascending: true })
        .limit(20);

      if (bracket) {
        query = query.gte('dds_blended', bracket.min).lte('dds_blended', bracket.max);
      }

      if (tier === 'starter') {
        query = query.eq('is_calibration', true);
      }

      const { data } = await query;
      if (!data?.length) return null;

      // Filter out played deals client-side
      const unplayed = data.filter((d: any) => !playedIds.has(d.id));
      return unplayed.length > 0 ? unplayed[0] : null;
    } catch (err) {
      console.warn('Failed to query deal pool:', err);
      return null;
    }
  }

  private static async getUserPlayedDealIds(userId: string): Promise<Set<string>> {
    try {
      const { data } = await (supabase as any)
        .from('user_played_deals')
        .select('deal_id')
        .eq('user_id', userId);
      return new Set((data || []).map((d: any) => d.deal_id));
    } catch {
      return new Set();
    }
  }

  private static async markPlayed(userId: string, dealId: string): Promise<void> {
    try {
      await (supabase as any)
        .from('user_played_deals')
        .upsert(
          { user_id: userId, deal_id: dealId },
          { onConflict: 'user_id,deal_id', ignoreDuplicates: true }
        );
    } catch (err) {
      console.warn('Failed to mark deal as played:', err);
    }
  }

  private static async getOldestPlayedDeal(userId: string, gameMode: string): Promise<any | null> {
    try {
      const { data } = await (supabase as any)
        .from('user_played_deals')
        .select('deal_id, played_at')
        .eq('user_id', userId)
        .order('played_at', { ascending: true })
        .limit(5);

      if (!data?.length) return null;

      for (const entry of data) {
        const { data: deal } = await (supabase as any)
          .from('deals')
          .select('id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended')
          .eq('id', entry.deal_id)
          .eq('game_mode', gameMode)
          .single();
        if (deal) return deal;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Priority 6: Generate a deal on the client, insert into pool, and serve it.
   */
  private static async generateAndInsertFallback(
    userId: string,
    gameMode: string,
    drawMode: number,
    bracket: { min: number; max: number }
  ): Promise<VerifiedDeal | null> {
    try {
      const engine = EngineRegistry.get(gameMode);
      const targetDDS = (bracket.min + bracket.max) / 2;

      for (let attempt = 0; attempt < 10; attempt++) {
        const seed = generateSeed();
        let deal;
        if (gameMode === 'realm') {
          // Pick grid size based on bracket
          const sizes = bracket.max <= 35 ? [4, 5] :
                       bracket.max <= 65 ? [6] :
                       bracket.max <= 80 ? [7, 8] : [9, 10];
          const size = sizes[Math.floor(Math.random() * sizes.length)];
          deal = engine.generateDeal(seed, { gridSize: size, skipSpatialSurprise: size <= 5 });
        } else {
          deal = engine.generateDeal(seed);
        }
        const result = engine.verifySolvable(deal, 50);
        if (result.solvable && result.minSolutionLength > 0) {
          const dds = result.complexityScore;

          // Insert into deals table via register-deal edge function
          const { data: regData } = await supabase.functions.invoke('register-deal', {
            body: {
              seed,
              gameMode,
              drawMode,
              minMoves: result.minSolutionLength,
              difficultyScore: dds,
            },
          });

          const dealUuid = regData?.id || '';

          if (dealUuid) {
            await this.markPlayed(userId, dealUuid);
          }

          return {
            dealUuid,
            seed,
            gameMode,
            tier: 'fallback',
            minMoves: result.minSolutionLength,
            ddsInitial: dds,
            ddsBlended: dds,
            difficulty: DDSService.ddsToLabel(dds),
            difficultyScore: dds,
            drawMode,
          };
        }
      }

      console.error('[DealPoolService] Fallback generation failed after 10 attempts');
      return null;
    } catch (err) {
      console.error('[DealPoolService] Fallback generation error:', err);
      return null;
    }
  }
}
