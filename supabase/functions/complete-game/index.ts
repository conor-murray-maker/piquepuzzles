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
  if (dds < 26) return 'Easy';
  if (dds < 56) return 'Medium';
  if (dds < 81) return 'Hard';
  return 'Expert';
}

function getTierName(rating: number): string {
  if (rating < 1000) return 'Bronze';
  if (rating < 1250) return 'Silver';
  if (rating < 1500) return 'Gold';
  if (rating < 1750) return 'Platinum';
  return 'Elite';
}

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

function getUserLocalDate(timezoneOffset: number, baseDate = new Date()): string {
  const localMs = baseDate.getTime() - timezoneOffset * 60000;
  const local = new Date(localMs);
  return local.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function updateStreak(
  supabaseAdmin: any,
  userId: string,
  result: string,
  isDailyChallenge: boolean,
  profile: any,
): Promise<{
  currentStreak: number;
  bestStreak: number;
  freezeUsed: boolean;
  milestoneReached: number | null;
  profileUpdate: Record<string, unknown>;
}> {
  const tzOffset = (profile.timezone_offset as number) ?? 0;
  const today = getUserLocalDate(tzOffset);
  const lastStreakDate = profile.last_streak_date as string | null;
  const lastWinDate = profile.last_win_date as string | null;

  let dailyWinsToday = profile.daily_wins_today as number;
  let dailyChallengeCompletedToday = profile.daily_challenge_completed_today as boolean;
  const initialConditionMet = dailyChallengeCompletedToday || dailyWinsToday >= 2;

  console.log('[complete-game] streak start:', {
    userId,
    today,
    lastStreakDate,
    lastWinDate,
    dailyWinsToday,
    dailyChallengeCompletedToday,
    conditionMet: initialConditionMet,
  });

  // Reset daily counters if last_win_date is not today
  if (!lastWinDate || lastWinDate < today) {
    dailyWinsToday = 0;
    dailyChallengeCompletedToday = false;
    console.log('[complete-game] streak counters reset:', {
      userId,
      today,
      lastWinDate,
    });
  }

  const isWin = result === 'win';
  if (isDailyChallenge && isWin) {
    dailyChallengeCompletedToday = true;
  }
  if (isWin) {
    dailyWinsToday += 1;
  }

  const conditionMet = dailyChallengeCompletedToday || dailyWinsToday >= 2;
  const conditionType = dailyChallengeCompletedToday ? 'daily_challenge' : (dailyWinsToday >= 2 ? 'two_wins' : 'none');

  console.log('[complete-game] streak evaluation:', {
    userId,
    result,
    isDailyChallenge,
    today,
    dailyWinsToday,
    dailyChallengeCompletedToday,
    conditionMet,
    conditionType,
  });

  // Check if streak was already earned today
  const { data: existingStreakToday } = await supabaseAdmin
    .from('streak_history')
    .select('id')
    .eq('user_id', userId)
    .eq('date', today)
    .limit(1);
  const streakAlreadyEarnedToday = (existingStreakToday?.length ?? 0) > 0;

  console.log('[complete-game] streak debug:', {
    conditionMet, lastStreakDate, lastWinDate, today, dailyWinsToday,
    dailyChallengeCompletedToday, isWin: result === 'win',
    streakAlreadyEarnedToday,
    willWrite: conditionMet && !streakAlreadyEarnedToday,
  });

  let currentStreak = profile.current_streak as number;
  let bestStreak = profile.best_streak as number;
  let freezesRemaining = profile.streak_freezes_remaining as number;
  let freezeUsedOn = profile.streak_freeze_used_on as string | null;
  let freezeUsed = false;
  let milestoneReached: number | null = null;

  if (conditionMet && !streakAlreadyEarnedToday) {
    const yesterday = addDays(today, -1);
    const dayBeforeYesterday = addDays(today, -2);

    if (lastStreakDate === yesterday) {
      currentStreak += 1;
    } else if (
      lastStreakDate === dayBeforeYesterday &&
      freezesRemaining > 0 &&
      freezeUsedOn !== yesterday
    ) {
      currentStreak += 1;
      freezesRemaining -= 1;
      freezeUsedOn = yesterday;
      freezeUsed = true;
    } else if (!lastStreakDate) {
      // First ever streak day
      currentStreak = 1;
    } else {
      currentStreak = 1;
    }

    bestStreak = Math.max(currentStreak, bestStreak);

    if (STREAK_MILESTONES.includes(currentStreak)) {
      milestoneReached = currentStreak;
    }

    // Insert streak history — wrapped in try/catch to prevent silent failures
    try {
      const { error: shError } = await supabaseAdmin.from('streak_history').insert({
        user_id: userId,
        date: today,
        streak_day_number: currentStreak,
        condition_met: conditionType,
        streak_length_at_time: currentStreak,
      });
      if (shError) {
        console.error('[complete-game] streak_history insert failed:', shError);
      } else {
        console.log('[complete-game] streak_history written: day', currentStreak, 'for user', userId);
      }
    } catch (shErr) {
      console.error('[complete-game] streak_history insert exception:', shErr);
    }
  }

  // Update profile with streak data — always write daily counters even if condition not met
  const streakUpdate: Record<string, unknown> = {
    daily_wins_today: dailyWinsToday,
    daily_challenge_completed_today: dailyChallengeCompletedToday,
    current_streak: currentStreak,
    best_streak: bestStreak,
    streak_freezes_remaining: freezesRemaining,
  };

  // Only set last_streak_date when condition is actually met and streak earned
  if (conditionMet && !streakAlreadyEarnedToday) {
    streakUpdate.last_streak_date = today;
  }

  if (freezeUsed) {
    streakUpdate.streak_freeze_used_on = freezeUsedOn;
  }
  if (milestoneReached !== null) {
    streakUpdate.pending_milestone = milestoneReached;
  }
  if (isWin) {
    streakUpdate.last_win_date = today;
  }

  console.log('[complete-game] streak profile update prepared:', {
    userId,
    streakUpdate,
  });

  return { currentStreak, bestStreak, freezeUsed, milestoneReached, profileUpdate: streakUpdate };
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

    const { data: { user: authUser }, error: authError } = await supabaseUser.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = authUser.id;

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
      timezoneOffset = 0,
      dealDDS: clientDealDDS = 0,
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

    // === Step 5: Duplicate detection ===
    // Check for duplicate game within last 30 seconds
    const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: existingGame } = await supabaseAdmin
      .from('game_history')
      .select('id')
      .eq('user_id', userId)
      .eq('deal_id', clientDealId || `deal-${dealSeed}`)
      .eq('won', result === 'win')
      .eq('moves', actualMoves)
      .gte('played_at', thirtySecsAgo)
      .limit(1);

    if (existingGame && existingGame.length > 0) {
      console.log('[complete-game] duplicate detected, skipping:', existingGame[0].id);
      return new Response(JSON.stringify({ error: 'duplicate_game', message: 'Game already recorded' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Server-side isDaily verification
    let isDaily = false;
    if (clientIsDaily && clientDealUuid) {
      const now = new Date();
      const todayStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        .toISOString().split('T')[0];
      const { data: dc } = await supabaseAdmin
        .from('daily_challenges')
        .select('deal_id')
        .eq('date', todayStr)
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

    // Update timezone offset in-memory; it will be persisted with the profile update below
    if (Number.isInteger(timezoneOffset) && timezoneOffset >= -720 && timezoneOffset <= 840) {
      profile.timezone_offset = timezoneOffset;
    }

    // 2. Fetch deal — with robust fallback for DDS
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

    // === Step 3: Robust DDS — resolution chain with logging ===
    let dds = 0;
    let ddsSource = 'fallback';

    // 1. Try client-provided dealDDS
    if (clientDealDDS > 0) {
      dds = clientDealDDS;
      ddsSource = 'client-parameter';
    }
    // 2. Try deal record dds_blended
    if (dds === 0 && deal && (deal.dds_blended as number) > 0) {
      dds = deal.dds_blended as number;
      ddsSource = 'deal-lookup';
    }
    // 3. Try recalculating from min_moves with updated curves
    const minMoves = deal ? (deal.min_moves as number) : 0;
    if (dds === 0 && minMoves > 0) {
      if (gameMode === 'freecell') {
        if (minMoves < 125) dds = Math.round((minMoves / 125) * 25);
        else if (minMoves < 175) dds = Math.round(26 + ((minMoves - 125) / 50) * 29);
        else if (minMoves < 250) dds = Math.round(56 + ((minMoves - 175) / 75) * 24);
        else dds = Math.round(Math.min(100, 81 + ((minMoves - 250) / 100) * 19));
      } else {
        if (minMoves < 100) dds = Math.round((minMoves / 100) * 25);
        else if (minMoves < 130) dds = Math.round(26 + ((minMoves - 100) / 30) * 29);
        else if (minMoves < 160) dds = Math.round(56 + ((minMoves - 130) / 30) * 24);
        else dds = Math.round(Math.min(100, 81 + ((minMoves - 160) / 60) * 19));
      }
      ddsSource = 'calculated-from-min-moves';
    }
    // 4. Neutral fallback — never block rating update
    if (dds === 0) {
      dds = 50;
      ddsSource = 'neutral-fallback';
    }

    console.log('[complete-game] DDS resolution:', { dds, ddsSource, clientDealDDS, dealDdsBlended: deal?.dds_blended, minMoves });

    // 3. Performance modifier — with fallbacks that actually produce non-1.0 values
    let performanceModifier = 1.0;
    let timeEfficiency = 1.0;
    let moveEfficiency = 1.0;
    let hintPenalty = 1.0;
    const hasPoolData = deal && (deal.pool_attempts as number) >= 10;
    const dealAvgTime = hasPoolData ? (deal.pool_avg_time as number) : null;
    const dealAvgMoves = hasPoolData ? (deal.pool_avg_moves as number) : null;

    if (isWin) {
      // DDS-based fallbacks when no pool data
      const klondikeExpTime = 60 + (dds / 100) * 480;
      const klondikeExpMoves = 80 + (dds / 100) * 120;
      const freecellExpTime = 90 + (dds / 100) * 300;
      const freecellExpMoves = 60 + (dds / 100) * 100;

      const poolAvgTime = dealAvgTime ?? (gameMode === 'freecell' ? freecellExpTime : klondikeExpTime);
      const expectedTime = Math.max(poolAvgTime, 30);
      timeEfficiency = Math.max(0.5, Math.min(1.5, expectedTime / Math.max(actualTime, 10)));

      const poolAvgMoves = dealAvgMoves ?? (gameMode === 'freecell' ? freecellExpMoves : klondikeExpMoves);
      const expectedMoves = Math.max(poolAvgMoves, 20);
      moveEfficiency = Math.max(0.5, Math.min(1.5, expectedMoves / Math.max(actualMoves, 10)));

      hintPenalty = Math.max(0.7, 1 - hintsUsed * 0.05);

      performanceModifier = Math.max(0.5, Math.min(1.5,
        (timeEfficiency * 0.4 + moveEfficiency * 0.4) * hintPenalty
      ));

      console.log('[complete-game] perf calc:', {
        expectedTime, actualTime, timeEfficiency,
        expectedMoves, actualMoves, moveEfficiency,
        hintPenalty, performanceModifier, minMoves, hasPoolData,
      });
    }

    // 4. ELO calculation — pure formula, no context multipliers
    const dealRating = 800 + (dds / 100) * 1200;
    const playerRating = profile.rating as number;
    const gamesPlayed = profile.games_played as number;

    const K = gamesPlayed < 20 ? 32 : gamesPlayed < 50 ? 24 : 16;
    const expected = 1 / (1 + Math.pow(10, (dealRating - playerRating) / 400));
    const outcome = isWin ? 1 : 0;
    const baseDelta = Math.round(K * (outcome - expected));

    let finalDelta = Math.round(baseDelta * performanceModifier);

    // Win floor and loss ceiling — no other adjustments
    if (isWin) finalDelta = Math.max(1, finalDelta);
    else finalDelta = Math.max(-20, finalDelta);

    const newRating = Math.max(0, playerRating + finalDelta);

    console.log('[complete-game] ELO:', {
      playerRating, dealRating, dds, K, expected: expected.toFixed(3),
      outcome, baseDelta, performanceModifier: performanceModifier.toFixed(3),
      finalDelta, newRating,
    });

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

    // 6. Evaluate streak progression before persisting the final profile state
    const streakResult = await updateStreak(
      supabaseAdmin,
      userId,
      result,
      isDaily,
      profile,
    );

    // 7. Update profile rating, timezone, game counts, and streak state in one write
    const perModeKey = `games_played_${gameMode}` as string;
    const currentPerMode = (profile[perModeKey] as number) ?? 0;
    const profileUpdate: Record<string, unknown> = {
      rating: newRating,
      games_played: gamesPlayed + 1,
      games_won: (profile.games_won as number) + (isWin ? 1 : 0),
      [perModeKey]: currentPerMode + 1,
      updated_at: new Date().toISOString(),
      ...streakResult.profileUpdate,
    };

    if (Number.isInteger(timezoneOffset) && timezoneOffset >= -720 && timezoneOffset <= 840) {
      profileUpdate.timezone_offset = timezoneOffset;
    }

    const { error: profileUpdateErr } = await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', userId);
    if (profileUpdateErr) {
      console.error('[complete-game] profiles update failed:', profileUpdateErr);
    } else {
      console.log('[complete-game] profiles updated with streak state:', {
        userId,
        profileUpdate,
      });
    }

    // 8. Insert game history
    const { error: historyErr } = await supabaseAdmin.from('game_history').insert({
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
    if (historyErr) {
      console.error('[complete-game] game_history insert failed:', historyErr);
    }

    // 9. Compute breakdown points that sum exactly to finalDelta
    let timeBonusPoints = 0;
    let movesBonusPoints = 0;
    let hintPenaltyPoints = 0;
    const baseDeltaForBreakdown = baseDelta;

    if (isWin) {
      timeBonusPoints = Math.round(baseDelta * (timeEfficiency - 1.0) * 0.4);
      movesBonusPoints = Math.round(baseDelta * (moveEfficiency - 1.0) * 0.4);
      hintPenaltyPoints = Math.round(baseDelta * (1 - hintPenalty));
      // Fix rounding: adjust baseDelta display so sum equals finalDelta
      const partialSum = timeBonusPoints + movesBonusPoints - hintPenaltyPoints;
      // finalDelta = baseDeltaDisplay + timeBonusPoints + movesBonusPoints - hintPenaltyPoints
      // so baseDeltaDisplay = finalDelta - partialSum
    }
    const baseDeltaDisplay = isWin ? (finalDelta - timeBonusPoints - movesBonusPoints + hintPenaltyPoints) : finalDelta;

    // 10. Return result
    return new Response(JSON.stringify({
      finalDelta,
      baseDelta: baseDeltaDisplay,
      newRating,
      previousRating: playerRating,
      newTier: getTierName(newRating),
      performanceModifier,
      dealDDS: dds,
      dealAvgTime: dealAvgTime,
      dealAvgMoves: dealAvgMoves,
      timeBonusPoints,
      movesBonusPoints,
      hintPenaltyPoints,
      hintsUsed,
      currentStreak: streakResult.currentStreak,
      streakUpdate: {
        currentStreak: streakResult.currentStreak,
        bestStreak: streakResult.bestStreak,
        freezeUsed: streakResult.freezeUsed,
        milestoneReached: streakResult.milestoneReached,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[complete-game] internal error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
