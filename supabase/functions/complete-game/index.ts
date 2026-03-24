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

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

/** Get a date string in the user's local timezone given their UTC offset in minutes */
function getUserLocalDate(timezoneOffset: number): string {
  const now = new Date();
  const localMs = now.getTime() + timezoneOffset * 60000;
  const local = new Date(localMs);
  return local.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/** Update streak after game completion */
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
}> {
  const tzOffset = (profile.timezone_offset as number) ?? 0;
  const today = getUserLocalDate(tzOffset);
  const lastStreakDate = profile.last_streak_date as string | null;

  let dailyWinsToday = profile.daily_wins_today as number;
  let dailyChallengeCompletedToday = profile.daily_challenge_completed_today as boolean;

  // Reset daily counters if it's a new day
  if (lastStreakDate !== today && profile.last_streak_date !== null) {
    // Check if last_streak_date is before today (new day)
    const lastDate = profile.last_streak_date as string | null;
    // We check based on whether any counter update happened today
    // Simple: if last_streak_date != today, we may need to reset counters
    // But we should track the "counter date" separately. Use a simpler approach:
    // Reset if the stored date is not today
  }

  // We need a separate "counter_date" concept. Let's use the profile fields directly:
  // If last_streak_date < today, reset counters
  if (!lastStreakDate || lastStreakDate < today) {
    dailyWinsToday = 0;
    dailyChallengeCompletedToday = false;
  }

  // Update daily counters
  const isWin = result === 'win';
  if (isDailyChallenge && isWin) {
    dailyChallengeCompletedToday = true;
  }
  if (isWin) {
    dailyWinsToday += 1;
  }

  // Check if streak condition met today
  const conditionMet = dailyChallengeCompletedToday || dailyWinsToday >= 2;
  const conditionType = dailyChallengeCompletedToday ? 'daily_challenge' : 'two_wins';

  let currentStreak = profile.current_streak as number;
  let bestStreak = profile.best_streak as number;
  let freezesRemaining = profile.streak_freezes_remaining as number;
  let freezeUsedOn = profile.streak_freeze_used_on as string | null;
  let freezeUsed = false;
  let milestoneReached: number | null = null;

  if (conditionMet && lastStreakDate !== today) {
    const yesterday = addDays(today, -1);
    const dayBeforeYesterday = addDays(today, -2);

    if (lastStreakDate === yesterday) {
      // Continuing streak
      currentStreak += 1;
    } else if (
      lastStreakDate === dayBeforeYesterday &&
      freezesRemaining > 0 &&
      freezeUsedOn !== yesterday
    ) {
      // Missed yesterday — auto-apply freeze
      currentStreak += 1;
      freezesRemaining -= 1;
      freezeUsedOn = yesterday;
      freezeUsed = true;
    } else {
      // Streak broken or first day
      currentStreak = 1;
    }

    bestStreak = Math.max(currentStreak, bestStreak);

    // Check milestones
    if (STREAK_MILESTONES.includes(currentStreak)) {
      milestoneReached = currentStreak;
    }

    // Insert streak history
    await supabaseAdmin.from('streak_history').insert({
      user_id: userId,
      date: today,
      streak_day_number: currentStreak,
      condition_met: conditionType,
      streak_length_at_time: currentStreak,
    });
  }

  // Update profile with streak data
  const streakUpdate: Record<string, unknown> = {
    daily_wins_today: dailyWinsToday,
    daily_challenge_completed_today: dailyChallengeCompletedToday,
    current_streak: currentStreak,
    best_streak: bestStreak,
    streak_freezes_remaining: freezesRemaining,
  };

  if (conditionMet && lastStreakDate !== today) {
    streakUpdate.last_streak_date = today;
  }
  if (freezeUsed) {
    streakUpdate.streak_freeze_used_on = freezeUsedOn;
  }
  if (milestoneReached !== null) {
    streakUpdate.pending_milestone = milestoneReached;
  }

  await supabaseAdmin.from('profiles').update(streakUpdate).eq('id', userId);

  return { currentStreak, bestStreak, freezeUsed, milestoneReached };
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
      timezoneOffset = 0,
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

    // Update timezone offset on profile
    if (Number.isInteger(timezoneOffset) && timezoneOffset >= -720 && timezoneOffset <= 840) {
      await supabaseAdmin.from('profiles').update({ timezone_offset: timezoneOffset }).eq('id', userId);
      profile.timezone_offset = timezoneOffset;
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

    // 4. ELO calculation — pure formula, no daily/context multipliers
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

    // 6. Update profile rating and game counts
    const profileUpdate: Record<string, unknown> = {
      rating: newRating,
      games_played: gamesPlayed + 1,
      games_won: (profile.games_won as number) + (isWin ? 1 : 0),
      updated_at: new Date().toISOString(),
    };

    if (isWin) {
      profileUpdate.last_win_date = new Date().toISOString().split('T')[0];
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

    // 8. Streak update — separate from ELO, retention layer only
    // Re-fetch profile to get latest state after rating update
    const { data: freshProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const streakResult = await updateStreak(
      supabaseAdmin,
      userId,
      result,
      isDaily,
      freshProfile || profile,
    );

    // 9. Return result
    return new Response(JSON.stringify({
      finalDelta,
      newRating,
      previousRating: playerRating,
      newTier: getTierName(newRating),
      performanceModifier,
      dealDDS: dds,
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
