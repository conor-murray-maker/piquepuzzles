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

/** DDS bracket based on mode IQ */
function getDdsBracket(rating: number): { min: number; max: number } {
  if (rating < 1100) return { min: 0, max: 45 };
  if (rating < 1300) return { min: 25, max: 65 };
  if (rating < 1500) return { min: 45, max: 80 };
  return { min: 60, max: 100 };
}

/** Concentration set size based on games played in this mode */
function getConcentrationCap(gamesPlayedThisMode: number): number | null {
  if (gamesPlayedThisMode < 3) return 15;
  if (gamesPlayedThisMode <= 20) return 50;
  if (gamesPlayedThisMode <= 100) return 150;
  return null; // no cap
}

/** Difficulty labels allowed based on games played in this mode */
function getAllowedDifficulties(gamesPlayedThisMode: number): string[] | null {
  if (gamesPlayedThisMode < 3) return ['Easy'];
  if (gamesPlayedThisMode <= 20) return ['Easy', 'Medium'];
  return null; // all allowed
}

/** Minimum confidence required based on games played in this mode */
function getMinConfidence(gamesPlayedThisMode: number): number {
  if (gamesPlayedThisMode < 3) return 0.85;
  if (gamesPlayedThisMode <= 20) return 0.75;
  return 0; // no minimum
}

function ddsToLabel(dds: number): string {
  if (dds < 26) return 'Easy';
  if (dds < 56) return 'Medium';
  if (dds < 81) return 'Hard';
  return 'Expert';
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
    difficulty: ddsToLabel(deal.dds_blended),
    difficultyScore: deal.dds_blended,
    drawMode: deal.draw_mode,
  };
}

export class DealPoolService {
  private static inFlightKeys = new Set<string>();

  /**
   * Unified eligibility + concentration model for deal serving.
   */
  static async getNextDeal(
    userId: string,
    gameMode: GameMode,
    drawMode: number = 3,
    gamesPlayed: number = 999,
    modeIQ: number = 1000,
    gamesPlayedThisMode: number = 999
  ): Promise<VerifiedDeal | null> {
    const flightKey = `${userId}:${gameMode}`;
    if (this.inFlightKeys.has(flightKey)) {
      console.warn(`[DealPoolService] DUPLICATE CALL blocked for ${flightKey}`);
      return null;
    }
    this.inFlightKeys.add(flightKey);
    try {
      return await this._getNextDealInner(userId, gameMode, drawMode, gamesPlayed, modeIQ, gamesPlayedThisMode);
    } finally {
      this.inFlightKeys.delete(flightKey);
    }
  }

  private static async _getNextDealInner(
    userId: string,
    gameMode: GameMode,
    drawMode: number,
    gamesPlayed: number,
    modeIQ: number,
    gamesPlayedThisMode: number
  ): Promise<VerifiedDeal | null> {
    const playedIds = await this.getUserPlayedDealIds(userId);
    // DDS bracket based on mode IQ (preference, not hard filter)
    // First 3 games per mode: no bracket (Easy-only via allowedDiffs handles it)
    const bracket = gamesPlayedThisMode >= 3 ? getDdsBracket(modeIQ) : null;
    const allowedDiffs = getAllowedDifficulties(gamesPlayedThisMode);
    const minConf = getMinConfidence(gamesPlayedThisMode);
    const concentrationCap = getConcentrationCap(gamesPlayedThisMode);

    console.log(`[DealPoolService] getNextDeal`, {
      userId,
      gameMode,
      modeIQ,
      iqSource: 'player_mode_ratings',
      ddsBracket: bracket,
      gamesPlayedThisMode,
      allowedDiffs,
      minConfidence: minConf,
      concentrationCap,
      playedDealCount: playedIds.size,
    });

    // Step 1: Query eligible deals with concentration cap
    const { deal: deal1, totalFound: found1, unplayedCount: unplayed1 } = await this.queryEligibleWithStats(
      gameMode, playedIds, bracket, allowedDiffs, minConf, concentrationCap
    );
    console.log(`[DealPoolService] Priority 1 (bracket+concentration):`, { totalFound: found1, unplayed: unplayed1, served: !!deal1 });
    if (deal1) {
      await this.markPlayed(userId, deal1.id);
      return dealRowToVerified(deal1, 'served');
    }

    // Fallback 1: Expand to full eligible pool (remove concentration cap)
    let found2 = 0, unplayed2 = 0;
    if (concentrationCap !== null) {
      const { deal: expanded, totalFound: f2, unplayedCount: u2 } = await this.queryEligibleWithStats(
        gameMode, playedIds, bracket, allowedDiffs, minConf, null
      );
      found2 = f2; unplayed2 = u2;
      console.log(`[DealPoolService] Priority 2 (bracket, no cap):`, { totalFound: found2, unplayed: unplayed2, served: !!expanded });
      if (expanded) {
        await this.markPlayed(userId, expanded.id);
        return dealRowToVerified(expanded, 'expanded');
      }
    }

    // Fallback 2: Remove bracket preference — serve any unplayed deal for this mode
    const { deal: noBracket, totalFound: found3, unplayedCount: unplayed3 } = await this.queryEligibleWithStats(
      gameMode, playedIds, null, allowedDiffs, minConf, null
    );
    console.log(`[DealPoolService] Priority 3 (no bracket):`, { totalFound: found3, unplayed: unplayed3, served: !!noBracket });
    if (noBracket) {
      await this.markPlayed(userId, noBracket.id);
      return dealRowToVerified(noBracket, 'expanded-no-bracket');
    }

    // Fallback 3: Remove difficulty + confidence filters — any unplayed deal for this mode
    const { deal: anyDeal, totalFound: found4, unplayedCount: unplayed4 } = await this.queryEligibleWithStats(
      gameMode, playedIds, null, null, 0, null
    );
    console.log(`[DealPoolService] Priority 4 (any unplayed):`, { totalFound: found4, unplayed: unplayed4, served: !!anyDeal });
    if (anyDeal) {
      await this.markPlayed(userId, anyDeal.id);
      return dealRowToVerified(anyDeal, 'any-unplayed');
    }

    // Fallback 4: Replay oldest played eligible deal
    const replay = await this.getOldestPlayedDeal(userId, gameMode, null, allowedDiffs, minConf);
    console.log(`[DealPoolService] Priority 5 (replay):`, { served: !!replay });
    if (replay) {
      await this.markPlayed(userId, replay.id);
      return dealRowToVerified(replay, 'replay');
    }

    // Fallback 5: Generate on client — should only trigger if pool is truly empty
    console.warn(`[DealPoolService] Fallback generation triggered for ${gameMode} — pool exhausted (total deals: ${found4}, all played)`);
    const targetBracket = bracket ?? { min: 0, max: 45 };
    return this.generateAndInsertFallback(userId, gameMode, drawMode, targetBracket);
  }

  /**
   * Query eligible deals with concentration and eligibility filters.
   * Returns lowest pool_attempts unplayed deal within the concentration set,
   * plus stats for diagnostic logging.
   */
  private static async queryEligibleWithStats(
    gameMode: string,
    playedIds: Set<string>,
    bracket: { min: number; max: number } | null,
    allowedDiffs: string[] | null,
    minConfidence: number,
    concentrationCap: number | null
  ): Promise<{ deal: any | null; totalFound: number; unplayedCount: number }> {
    // Build filter description for logging
    const filters: Record<string, any> = { game_mode: gameMode, orderBy: 'pool_attempts ASC' };
    try {
      let query = (supabase as any)
        .from('deals')
        .select('id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended, confidence')
        .eq('game_mode', gameMode)
        .order('pool_attempts', { ascending: true });

      if (bracket) {
        query = query.gte('dds_blended', bracket.min).lte('dds_blended', bracket.max);
        filters.dds_blended_gte = bracket.min;
        filters.dds_blended_lte = bracket.max;
      }

      if (allowedDiffs) {
        let ddsMin = 0, ddsMax = 100;
        if (allowedDiffs.length === 1 && allowedDiffs[0] === 'Easy') {
          ddsMax = 25;
        } else if (allowedDiffs.length === 2) {
          ddsMax = 55;
        }
        query = query.gte('dds_blended', ddsMin).lte('dds_blended', ddsMax);
        filters.allowedDiffs_ddsMin = ddsMin;
        filters.allowedDiffs_ddsMax = ddsMax;
      }

      if (minConfidence > 0) {
        query = query.gte('confidence', minConfidence);
        filters.confidence_gte = minConfidence;
      }

      const fetchLimit = concentrationCap ? concentrationCap * 2 : 200;
      query = query.limit(fetchLimit);
      filters.fetchLimit = fetchLimit;
      filters.concentrationCap = concentrationCap;

      console.log(`[DealPoolService] QUERY BEFORE exec`, filters);

      const { data, error } = await query;

      console.log(`[DealPoolService] QUERY AFTER exec`, {
        filters,
        rowsReturned: data?.length ?? 0,
        error: error ?? null,
        firstRow: data?.[0] ? { id: data[0].id, dds_blended: data[0].dds_blended, game_mode: data[0].game_mode, confidence: data[0].confidence } : null,
      });

      if (!data?.length) return { deal: null, totalFound: 0, unplayedCount: 0 };

      let candidates = data;
      if (concentrationCap && candidates.length > concentrationCap) {
        candidates = candidates.slice(0, concentrationCap);
      }

      const unplayed = candidates.filter((d: any) => !playedIds.has(d.id));

      console.log(`[DealPoolService] EXCLUSION`, {
        candidateCount: candidates.length,
        playedIdsCount: playedIds.size,
        playedIdsJoinField: 'deal_id from user_played_deals matched against deals.id (UUID)',
        unplayedCount: unplayed.length,
        samplePlayedIds: [...playedIds].slice(0, 3),
        sampleCandidateIds: candidates.slice(0, 3).map((d: any) => d.id),
      });

      return {
        deal: unplayed.length > 0 ? unplayed[0] : null,
        totalFound: data.length,
        unplayedCount: unplayed.length,
      };
    } catch (err) {
      console.warn('Failed to query deal pool:', err);
      return { deal: null, totalFound: 0, unplayedCount: 0 };
    }
  }

  private static async getUserPlayedDealIds(userId: string): Promise<Set<string>> {
    try {
      console.log(`[DealPoolService] getUserPlayedDealIds BEFORE`, { userId, table: 'user_played_deals', select: 'deal_id', filter: `user_id = ${userId}` });
      const { data, error } = await (supabase as any)
        .from('user_played_deals')
        .select('deal_id')
        .eq('user_id', userId);
      const ids = new Set<string>((data || []).map((d: any) => d.deal_id as string));
      console.log(`[DealPoolService] getUserPlayedDealIds AFTER`, { userId, count: ids.size, error: error ?? null, sampleIds: [...ids].slice(0, 5) });
      return ids;
    } catch (err) {
      console.warn('[DealPoolService] getUserPlayedDealIds FAILED', err);
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

  private static async getOldestPlayedDeal(
    userId: string,
    gameMode: string,
    bracket: { min: number; max: number } | null,
    allowedDiffs: string[] | null,
    minConfidence: number
  ): Promise<any | null> {
    try {
      const { data } = await (supabase as any)
        .from('user_played_deals')
        .select('deal_id, played_at')
        .eq('user_id', userId)
        .order('played_at', { ascending: true })
        .limit(20);

      if (!data?.length) return null;

      for (const entry of data) {
        let query = (supabase as any)
          .from('deals')
          .select('id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended, confidence')
          .eq('id', entry.deal_id)
          .eq('game_mode', gameMode);

        if (bracket) {
          query = query.gte('dds_blended', bracket.min).lte('dds_blended', bracket.max);
        }
        if (allowedDiffs) {
          let ddsMax = 100;
          if (allowedDiffs.length === 1 && allowedDiffs[0] === 'Easy') ddsMax = 25;
          else if (allowedDiffs.length === 2) ddsMax = 55;
          query = query.lte('dds_blended', ddsMax);
        }
        if (minConfidence > 0) {
          query = query.gte('confidence', minConfidence);
        }

        const { data: deal } = await query.single();
        if (deal) return deal;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fallback: Generate a deal on the client, insert into pool, and serve it.
   */
  private static async generateAndInsertFallback(
    userId: string,
    gameMode: string,
    drawMode: number,
    bracket: { min: number; max: number }
  ): Promise<VerifiedDeal | null> {
    try {
      const engine = EngineRegistry.get(gameMode);

      for (let attempt = 0; attempt < 10; attempt++) {
        const seed = generateSeed();
        let deal;
        if (gameMode === 'realm') {
          const sizes = bracket.max <= 35 ? [5] :
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
