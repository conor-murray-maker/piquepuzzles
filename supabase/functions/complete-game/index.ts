import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Game-agnostic normalisation config
const NORM_CONFIG: Record<string, { movesMin: number; movesRange: number; timeMin: number; timeRange: number }> = {
  klondike: { movesMin: 50, movesRange: 150, timeMin: 60, timeRange: 540 },
  freecell: { movesMin: 40, movesRange: 140, timeMin: 60, timeRange: 480 },
};

function getNormConfig(gameMode: string) {
  return NORM_CONFIG[gameMode] ?? NORM_CONFIG.klondike;
}

function ddsToLabel(dds: number): string {
  if (dds <= 25) return 'Easy';
  if (dds <= 55) return 'Medium';
  if (dds <= 80) return 'Hard';
  return 'Expert';
}

function getTierName(rating: number): string {
  if (rating < 1000) return 'Bronze';
  if (rating < 1250) return 'Silver';
  if (rating < 1500) return 'Gold';
  if (rating < 1750) return 'Platinum';
  return 'Elite';
}

/** Get today's date string in YYYY-MM-DD UTC */
function todayUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString().split('T')[0];
}

/** Get yesterday's date string in YYYY-MM-DD UTC */
function yesterdayUTC(): string {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseUser.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const {
      dealSeed,
      gameMode,
      drawMode = 3,
      result,
      actualMoves,
      actualTime,
      hintsUsed = 0,
      undosUsed = 0,
      dealId: clientDealId,
      dealUuid: clientDealUuid,
      isDaily: clientIsDaily = false,
    } = body;

    // Input validation
    if (!['win', 'loss', 'abandon'].includes(result)) {
      return new Response(JSON.stringify({ error: 'Invalid result value' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isInteger(actualMoves) || actualMoves < 0 || actualMoves > 10000) {
      return new Response(JSON.stringify({ error: 'Invalid actualMoves' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isInteger(actualTime) || actualTime < 0 || actualTime > 86400) {
      return new Response(JSON.stringify({ error: 'Invalid actualTime' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed > 1000) {
      return new Response(JSON.stringify({ error: 'Invalid hintsUsed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Server-side isDaily verification
    let isDaily = false;
    if (clientIsDaily && clientDealUuid) {
      const today = todayUTC();
      const { data: dc } = await supabaseAdmin
        .from('daily_challenges')
        .select('deal_id')
        .eq('date', today)
        .single();
      isDaily = dc?.deal_id === clientDealUuid;
    }

    const isWin = result === 'win';

    // 1. Fetch user profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch deal
    let deal: any = null;
    if (clientDealUuid) {
      const { data } = await supabaseAdmin
        .from('deals')
        .select('*')
        .eq('id', clientDealUuid)
        .single();
      deal = data;
    }
    if (!deal) {
      const { data } = await supabaseAdmin
        .from('deals')
        .select('*')
        .eq('seed', dealSeed)
        .eq('game_mode', gameMode)
        .eq('draw_mode', drawMode)
        .single();
      deal = data;
    }

    const dds = deal ? (deal.dds_blended as number) : 50;
    const minMoves = deal ? (deal.min_moves as number) : 0;

    // 3. Performance modifier
    let performanceModifier = 1.0;

    if (isWin) {
      const poolAvgTime = (deal && (deal.pool_attempts as number) >= 10)
        ? (deal.pool_avg_time as number)
        : (minMoves > 0 ? minMoves * 4 : 300);
      const expectedTime = Math.max(poolAvgTime, 30);
      const timeEfficiency = Math.max(0.5, Math.min(1.5, expectedTime / Math.max(actualTime, 10)));

      const poolAvgMoves = (deal && (deal.pool_attempts as number) >= 10)
        ? (deal.pool_avg_moves as number)
        : (minMoves > 0 ? minMoves * 1.8 : 150);
      const expectedMoves = Math.max(poolAvgMoves, 20);
      const moveEfficiency = Math.max(0.5, Math.min(1.5, expectedMoves / Math.max(actualMoves, 10)));

      const hintPenalty = Math.max(0.7, 1 - hintsUsed * 0.05);

      performanceModifier = Math.max(0.5, Math.min(1.5,
        (timeEfficiency * 0.4 + moveEfficiency * 0.4) * hintPenalty
      ));
    }

    // 4. ELO calculation
    const dealRating = 800 + (dds / 100) * 1200;
    const playerRating = profile.rating as number;
    const gamesPlayed = profile.games_played as number;

    const K = gamesPlayed < 20 ? 32 : gamesPlayed < 50 ? 24 : 16;
    const expected = 1 / (1 + Math.pow(10, (dealRating - playerRating) / 400));
    const outcome = isWin ? 1 : 0;
    const baseDelta = Math.round(K * (outcome - expected));

    let finalDelta = Math.round(baseDelta * performanceModifier);

    if (isDaily) {
      finalDelta = Math.round(finalDelta * 1.2);
    }

    if (isWin) finalDelta = Math.max(1, finalDelta);
    else finalDelta = Math.max(-20, finalDelta);

    const newRating = Math.max(0, playerRating + finalDelta);

    // 5. Update deal pool stats
    if (deal) {
      const pa = deal.pool_attempts as number;
      const newAttempts = pa + 1;
      const newWins = (deal.pool_wins as number) + (isWin ? 1 : 0);
      const oldTotalMoves = (deal.pool_avg_moves as number) * pa;
      const oldTotalTime = (deal.pool_avg_time as number) * pa;
      const newAvgMoves = (oldTotalMoves + actualMoves) / newAttempts;
      const newAvgTime = (oldTotalTime + actualTime) / newAttempts;
      const isAbandon = result === 'abandon';
      const newAbandons = isAbandon
        ? ((deal.pool_abandons as number) * pa + 1) / newAttempts
        : ((deal.pool_abandons as number) * pa) / newAttempts;

      const winRate = newWins / newAttempts;
      const norm = getNormConfig(gameMode);
      const normMoves = Math.max(0, Math.min(1, (newAvgMoves - norm.movesMin) / norm.movesRange));
      const normTime = Math.max(0, Math.min(1, (newAvgTime - norm.timeMin) / norm.timeRange));
      const ddsEmpirical = (1 - winRate) * 25 + normMoves * 25 + normTime * 25 + newAbandons * 25;

      const ddsInitial = deal.dds_initial as number;
      let ddsBlended: number;
      if (newAttempts < 30) ddsBlended = ddsInitial;
      else if (newAttempts < 100) {
        const blend = (newAttempts - 30) / 70;
        ddsBlended = ddsInitial * (1 - blend) + ddsEmpirical * blend;
      } else ddsBlended = ddsEmpirical;

      await supabaseAdmin.from('deals').update({
        pool_attempts: newAttempts,
        pool_wins: newWins,
        pool_avg_moves: newAvgMoves,
        pool_avg_time: newAvgTime,
        pool_abandons: newAbandons,
        dds_empirical: ddsEmpirical,
        dds_blended: ddsBlended,
      }).eq('id', deal.id);
    }

    // 6. Calendar-day streak logic
    const today = todayUTC();
    const yesterday = yesterdayUTC();
    const lastWinDate = profile.last_win_date as string | null;
    const currentStreak = profile.current_streak as number;
    const bestStreak = profile.best_streak as number;
    const isPremium = profile.subscription_status === 'premium';
    let freezesRemaining = profile.streak_freezes_remaining as number;

    let newStreak: number;
    let streakFrozen = false;

    if (isWin) {
      if (lastWinDate === today) {
        // Already won today, streak unchanged
        newStreak = currentStreak;
      } else if (lastWinDate === yesterday || lastWinDate === null) {
        // Consecutive day or first win ever
        newStreak = currentStreak + 1;
      } else {
        // Gap of more than 1 day
        if (isPremium && freezesRemaining > 0) {
          // Streak freeze saves it
          freezesRemaining--;
          newStreak = currentStreak + 1;
          streakFrozen = true;
        } else {
          // Streak resets, start fresh
          newStreak = 1;
        }
      }
    } else {
      // Loss does not break streak (only missing a calendar day does)
      newStreak = currentStreak;
    }

    const profileUpdate: Record<string, unknown> = {
      rating: newRating,
      games_played: gamesPlayed + 1,
      games_won: (profile.games_won as number) + (isWin ? 1 : 0),
      current_streak: newStreak,
      best_streak: Math.max(bestStreak, newStreak),
      updated_at: new Date().toISOString(),
    };

    if (isWin) {
      profileUpdate.last_win_date = today;
    }

    if (streakFrozen) {
      profileUpdate.streak_freezes_remaining = freezesRemaining;
    }

    await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', userId);

    // 7. Insert game history
    await supabaseAdmin.from('game_history').insert({
      user_id: userId,
      deal_id: clientDealId || `deal-${dealSeed}`,
      won: isWin,
      moves: actualMoves,
      time_seconds: actualTime,
      hints_used: hintsUsed,
      undos_used: undosUsed,
      difficulty: ddsToLabel(dds),
      difficulty_score: dds,
      rating_before: playerRating,
      rating_after: newRating,
      rating_change: finalDelta,
      game_mode: gameMode,
      performance_modifier: performanceModifier,
      base_delta: baseDelta,
      final_delta: finalDelta,
      deal_uuid: deal?.id || null,
    } as Record<string, unknown>);

    // 8. Return result
    return new Response(JSON.stringify({
      finalDelta,
      newRating,
      previousRating: playerRating,
      newTier: getTierName(newRating),
      performanceModifier,
      dealDDS: dds,
      streakFrozen,
      currentStreak: newStreak,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
