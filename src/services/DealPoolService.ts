import { supabase } from '@/integrations/supabase/client';
import { EngineRegistry } from '@/engines/EngineRegistry';
import { GameMode } from '@/engines/PuzzleEngine';
import { DDSService } from './DDSService';
import { generateSeed } from '@/game/deck';
import { getRealmDifficulty } from '@/lib/difficulty';

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

/** When true, Realm serving switches from grid-size brackets to empirical DDS brackets
 *  once sufficient sample data exists. Requires manual enable. */
const USE_EMPIRICAL_REALM_SERVING = false;

/** Realm IQ → allowed grid sizes (min_moves) bracket map */
const REALM_IQ_GRID_BRACKETS: { maxIQ: number; gridSizes: number[] }[] = [
  { maxIQ: 1100, gridSizes: [5] },
  { maxIQ: 1300, gridSizes: [5, 6] },
  { maxIQ: 1500, gridSizes: [6, 7] },
  { maxIQ: 1700, gridSizes: [7, 8] },
  { maxIQ: 2000, gridSizes: [8, 9] },
  { maxIQ: 2500, gridSizes: [9, 10] },
  { maxIQ: Infinity, gridSizes: [10] },
];

function getRealmGridBracket(rating: number): number[] {
  for (const b of REALM_IQ_GRID_BRACKETS) {
    if (rating < b.maxIQ) return b.gridSizes;
  }
  return [10];
}

/** DDS bracket — Realm uses recalibrated ranges (max DDS ~113) */
function getDdsBracket(rating: number, gameMode: string): { min: number; max: number } {
  // ── Realm DDS brackets ──────────────────────────────────────────────
  // RESERVED FOR FUTURE EMPIRICAL SERVING (USE_EMPIRICAL_REALM_SERVING).
  // These ranges are calibrated to the actual Realm DDS distribution
  // (max ~113) and will be used when empirical serving is enabled.
  // Currently NOT active — Realm always routes through getRealmGridBracket().
  // ────────────────────────────────────────────────────────────────────
  if (gameMode === 'realm') {
    if (rating < 1100) return { min: 0, max: 40 };
    if (rating < 1300) return { min: 25, max: 55 };
    if (rating < 1500) return { min: 35, max: 65 };
    if (rating < 1700) return { min: 45, max: 80 };
    if (rating < 2000) return { min: 60, max: 95 };
    if (rating < 2500) return { min: 75, max: 110 };
    return { min: 90, max: 113 };
  }
  // Non-Realm: original brackets unchanged
  if (rating < 1100) return { min: 0, max: 40 };
  if (rating < 1300) return { min: 25, max: 55 };
  if (rating < 1500) return { min: 45, max: 70 };
  if (rating < 1700) return { min: 60, max: 85 };
  if (rating < 2000) return { min: 75, max: 100 };
  if (rating < 2500) return { min: 90, max: 130 };
  return { min: 115, max: 150 };
}

/** Removed — getDdsBracket now handles all modes */

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

function ddsToLabel(dds: number, gameMode?: string): string {
  if (dds < 26) return 'Easy';
  if (dds < 51) return 'Medium';
  if (dds < 76) return 'Hard';
  if (dds < 101) return 'Expert';
  if (gameMode === 'klondike' || gameMode === 'freecell') return 'Master';
  if (dds < 131) return 'Master';
  return 'Grandmaster';
}

function dealRowToVerified(deal: any, tier: string): VerifiedDeal {
  // Realm: derive difficulty from grid size (min_moves = N); others: from DDS
  const difficulty = deal.game_mode === 'realm' && deal.min_moves >= 5 && deal.min_moves <= 10
    ? getRealmDifficulty(deal.min_moves, deal.dds_blended, deal.pool_attempts ?? 0)
    : ddsToLabel(deal.dds_blended, deal.game_mode);

  return {
    dealUuid: deal.id,
    seed: deal.seed,
    gameMode: deal.game_mode,
    tier,
    minMoves: deal.min_moves,
    ddsInitial: deal.dds_initial,
    ddsBlended: deal.dds_blended,
    difficulty,
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
    const isRealm = gameMode === 'realm';

    // Realm: use grid-size brackets by default; switch to DDS if empirical serving is enabled
    // and all grid sizes in the bracket have sufficient sample data
    let useEmpiricalForRealm = false;
    let realmGridSizes: number[] | null = isRealm ? getRealmGridBracket(modeIQ) : null;
    let bracket: { min: number; max: number } | null = null;

    if (isRealm && USE_EMPIRICAL_REALM_SERVING && realmGridSizes) {
      // Check if all grid sizes in the player's bracket have ≥30 samples
      try {
        const gridDdsBuckets: Record<number, string> = { 5: '0-25', 6: '26-50', 7: '51-75', 8: '76-100', 9: '101-130', 10: '131-150' };
        const iqBucket = modeIQ < 1100 ? '<1100' : modeIQ < 1300 ? '1100-1300' : modeIQ < 1500 ? '1300-1500' : modeIQ < 1700 ? '1500-1700' : modeIQ < 2000 ? '1700-2000' : modeIQ < 2500 ? '2000-2500' : '2500+';
        const { data: perfData } = await (supabase as any)
          .from('performance_expectations')
          .select('dds_bucket, sample_count')
          .eq('game_mode', 'realm')
          .eq('iq_bucket', iqBucket);
        const sampleMap = new Map((perfData || []).map((p: any) => [p.dds_bucket, p.sample_count]));
        const allSufficient = realmGridSizes.every(gs => {
          const bucket = gridDdsBuckets[gs];
          return bucket && ((sampleMap.get(bucket) as number) ?? 0) >= 30;
        });
        if (allSufficient) {
          useEmpiricalForRealm = true;
          bracket = getDdsBracket(modeIQ, gameMode);
          realmGridSizes = null; // switch to DDS-based serving
          console.log(`[DealPoolService] Realm empirical serving ACTIVE for IQ ${modeIQ}`);
        }
      } catch (err) {
        console.warn('[DealPoolService] Failed to check empirical samples, staying on grid-size serving', err);
      }
    }

    if (!isRealm) {
      bracket = gamesPlayedThisMode >= 3 ? getDdsBracket(modeIQ, gameMode) : null;
    }
    // For non-Realm, enforce DDS floor in fallbacks
    const ddsFloor = !isRealm && bracket ? bracket.min : null;

    const allowedDiffs = getAllowedDifficulties(gamesPlayedThisMode);
    const minConf = getMinConfidence(gamesPlayedThisMode);
    const concentrationCap = getConcentrationCap(gamesPlayedThisMode);

    console.log(`[DealPoolService] getNextDeal`, {
      userId,
      gameMode,
      modeIQ,
      iqSource: 'player_mode_ratings',
      ...(isRealm ? { realmGridSizes } : { ddsBracket: bracket, ddsFloor }),
      gamesPlayedThisMode,
      allowedDiffs,
      minConfidence: minConf,
      concentrationCap,
      playedDealCount: playedIds.size,
    });

    // Step 1: Query eligible deals with concentration cap
    const { deal: deal1, totalFound: found1, unplayedCount: unplayed1 } = await this.queryEligibleWithStats(
      gameMode, playedIds, bracket, allowedDiffs, minConf, concentrationCap, realmGridSizes
    );
    console.log(`[DealPoolService] Priority 1 (bracket+concentration):`, { totalFound: found1, unplayed: unplayed1, served: !!deal1 });
    if (deal1) {
      console.log('[DealPoolService] Serving from pool, Priority 1');
      await this.markPlayed(userId, deal1.id);
      return dealRowToVerified(deal1, 'served');
    }

    // Fallback 1: Expand to full eligible pool (remove concentration cap)
    let found2 = 0, unplayed2 = 0;
    if (concentrationCap !== null) {
      const { deal: expanded, totalFound: f2, unplayedCount: u2 } = await this.queryEligibleWithStats(
        gameMode, playedIds, bracket, allowedDiffs, minConf, null, realmGridSizes
      );
      found2 = f2; unplayed2 = u2;
      console.log(`[DealPoolService] Priority 2 (bracket, no cap):`, { totalFound: found2, unplayed: unplayed2, served: !!expanded });
      if (expanded) {
        await this.markPlayed(userId, expanded.id);
        return dealRowToVerified(expanded, 'expanded');
      }
    }

    // Fallback 2: For non-Realm, remove bracket ceiling but keep floor; for Realm, widen grid sizes
    const floorBracket = ddsFloor !== null ? { min: ddsFloor, max: 9999 } : null;
    // Realm fallback: expand to all grid sizes at or above the player's minimum
    const realmWideGridSizes = isRealm && realmGridSizes ? Array.from({ length: 10 - Math.min(...realmGridSizes) + 1 }, (_, i) => Math.min(...realmGridSizes) + i).filter(s => s >= 5 && s <= 10) : null;
    const { deal: noBracket, totalFound: found3, unplayedCount: unplayed3 } = await this.queryEligibleWithStats(
      gameMode, playedIds, floorBracket, allowedDiffs, minConf, null, realmWideGridSizes
    );
    console.log(`[DealPoolService] Priority 3 (floor/wide grid):`, { ddsFloor, realmWideGridSizes, totalFound: found3, unplayed: unplayed3, served: !!noBracket });
    if (noBracket) {
      await this.markPlayed(userId, noBracket.id);
      return dealRowToVerified(noBracket, 'expanded-no-bracket');
    }

    // Fallback 3: Remove difficulty + confidence filters, keep floor/grid constraint
    const { deal: anyDeal, totalFound: found4, unplayedCount: unplayed4 } = await this.queryEligibleWithStats(
      gameMode, playedIds, floorBracket, null, 0, null, realmWideGridSizes
    );
    console.log(`[DealPoolService] Priority 4 (any unplayed, floor/grid enforced):`, { ddsFloor, realmWideGridSizes, totalFound: found4, unplayed: unplayed4, served: !!anyDeal });
    if (anyDeal) {
      await this.markPlayed(userId, anyDeal.id);
      return dealRowToVerified(anyDeal, 'any-unplayed');
    }

    // For Realm: if nothing in grid bracket exists, return null (no undershooting)
    if (isRealm) {
      console.warn(`[DealPoolService] No Realm deals available for grid sizes ${JSON.stringify(realmWideGridSizes)} — refusing to undershoot`);
      return null;
    }

    // Non-Realm: if nothing above the floor exists, return null
    if (ddsFloor !== null) {
      console.warn(`[DealPoolService] No deals available above DDS floor ${ddsFloor} — refusing to undershoot`);
      return null;
    }

    // Fallback 4: Replay oldest played eligible deal — respects DDS floor
    const replayBracket = ddsFloor !== null ? { min: ddsFloor, max: 9999 } : null;
    const replay = await this.getOldestPlayedDeal(userId, gameMode, replayBracket, allowedDiffs, minConf);
    if (replay) {
      console.log(`[DealPoolService] Priority 5 (replay):`, { served: true, ddsFloor });
      await this.markPlayed(userId, replay.id);
      return dealRowToVerified(replay, 'replay');
    }
    console.log(`[DealPoolService] Priority 5 (replay): no eligible deal above DDS floor ${ddsFloor ?? 'none'}`);

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
    concentrationCap: number | null,
    realmGridSizes: number[] | null = null
  ): Promise<{ deal: any | null; totalFound: number; unplayedCount: number }> {
    const filters: Record<string, any> = { game_mode: gameMode, orderBy: 'pool_attempts ASC' };
    try {
      let query = (supabase as any)
        .from('deals')
        .select('id, seed, game_mode, draw_mode, min_moves, dds_initial, dds_blended, confidence')
        .eq('game_mode', gameMode)
        .order('pool_attempts', { ascending: true });

      // Realm: filter by grid size (min_moves); non-Realm: filter by DDS bracket
      if (realmGridSizes) {
        query = query.in('min_moves', realmGridSizes);
        filters.realmGridSizes = realmGridSizes;
      } else if (bracket) {
        query = query.gte('dds_blended', bracket.min).lte('dds_blended', bracket.max);
        filters.dds_blended_gte = bracket.min;
        filters.dds_blended_lte = bracket.max;
      }

      // allowedDiffs DDS filter only applies to non-Realm
      if (allowedDiffs && !realmGridSizes) {
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
        firstRow: data?.[0] ? { id: data[0].id, dds_blended: data[0].dds_blended, min_moves: data[0].min_moves, game_mode: data[0].game_mode, confidence: data[0].confidence } : null,
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
                       bracket.max <= 85 ? [7, 8] :
                       bracket.max <= 100 ? [9, 10] : [10];
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
