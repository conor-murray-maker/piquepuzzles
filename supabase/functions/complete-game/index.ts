import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ─── Scoring Engine ────────────────────────────────────────────

interface ScoreInput {
  gameMode: 'realm' | 'klondike' | 'freecell';
  dealDDS: number;
  playerIQ: number;
  actualTime: number;
  actualMoves: number;
  hintsUsed: number;
  undosUsed: number;
  completed: boolean;
  avgTime: number;
  avgMoves: number;
  baseDelta: number; // raw ELO delta before modifiers
}

interface ScoreResult {
  baseCompletion: number;
  timeDelta: number;
  movesDelta: number;
  undoPenalty: number;
  hintPenalty: number;
  total: number;
  breakdown: { label: string; value: number }[];
}

interface ModeConfig {
  timeWeight: number;     // coefficient for time formula
  movesWeight: number;    // coefficient for moves formula (0 for realm)
  undoPenaltyPerUndo: number; // flat per-undo penalty (0 for card games)
  baseCompletionFraction: number; // fraction of baseDelta used as completion reward
  lossPenalty: number;    // fixed loss penalty (worst possible)
  winFloor: number | null; // minimum win delta (null = no floor)
}

const MODE_CONFIGS: Record<string, ModeConfig> = {
  realm: {
    timeWeight: 20,
    movesWeight: 0,
    undoPenaltyPerUndo: 2,
    baseCompletionFraction: 0.4,
    lossPenalty: -20,
    winFloor: null, // net negative allowed
  },
  freecell: {
    timeWeight: 20,
    movesWeight: 10,
    undoPenaltyPerUndo: 0, // folded into moves
    baseCompletionFraction: 0.5,
    lossPenalty: -20,
    winFloor: 1,
  },
  klondike: {
    timeWeight: 10,
    movesWeight: 20,
    undoPenaltyPerUndo: 0, // folded into moves
    baseCompletionFraction: 0.6, // higher — completion not guaranteed
    lossPenalty: -20,
    winFloor: 1,
  },
};

function computeScore(input: ScoreInput): ScoreResult {
  const config = MODE_CONFIGS[input.gameMode] ?? MODE_CONFIGS.klondike;

  if (!input.completed) {
    // Loss: fixed penalty
    return {
      baseCompletion: config.lossPenalty,
      timeDelta: 0,
      movesDelta: 0,
      undoPenalty: 0,
      hintPenalty: 0,
      total: config.lossPenalty,
      breakdown: [
        { label: `${ddsToLabel(input.dealDDS)} deal — not solved`, value: config.lossPenalty },
      ],
    };
  }

  // Base completion points
  const baseCompletion = Math.round(input.baseDelta * config.baseCompletionFraction);

  // Time delta: weight × (ratio^1.3 - 1)
  const timeRatio = Math.max(input.avgTime, 1) / Math.max(input.actualTime, 1);
  const timeDelta = Math.round(config.timeWeight * (Math.pow(timeRatio, 1.3) - 1));

  // Moves delta: weight × (ratio^1.3 - 1) — 0 for realm
  let movesDelta = 0;
  if (config.movesWeight > 0 && input.avgMoves > 0) {
    const movesRatio = input.avgMoves / Math.max(input.actualMoves, 1);
    movesDelta = Math.round(config.movesWeight * (Math.pow(movesRatio, 1.3) - 1));
  }

  // Undo penalty (realm only; card games have undos folded into moves)
  const undoPenalty = config.undoPenaltyPerUndo * input.undosUsed;

  // Hint penalty: percentage of base completion
  const hintPenaltyFraction = Math.max(0.7, 1 - input.hintsUsed * 0.05);
  const hintPenalty = Math.round(baseCompletion * (1 - hintPenaltyFraction));

  let total = baseCompletion + timeDelta + movesDelta - undoPenalty - hintPenalty;

  // Win floor (card games get +1 minimum; realm allows net negative)
  if (config.winFloor !== null) {
    total = Math.max(config.winFloor, total);
  }

  // Ensure completion never scores worse than loss
  total = Math.max(config.lossPenalty + 1, total);

  // Build breakdown
  const breakdown: { label: string; value: number }[] = [];
  const diffLabel = ddsToLabel(input.dealDDS);

  breakdown.push({ label: `${diffLabel} deal won`, value: baseCompletion });

  if (timeDelta >= 0) {
    breakdown.push({ label: 'Faster than expected', value: timeDelta });
  } else {
    breakdown.push({ label: 'Slower than expected', value: timeDelta });
  }

  if (config.movesWeight > 0) {
    if (movesDelta >= 0) {
      breakdown.push({ label: 'Fewer moves than expected', value: movesDelta });
    } else {
      breakdown.push({ label: 'More moves than expected', value: movesDelta });
    }
  }

  if (config.undoPenaltyPerUndo > 0) {
    breakdown.push({
      label: input.undosUsed > 0 ? `Undos used × ${input.undosUsed}` : 'Undos',
      value: input.undosUsed > 0 ? -undoPenalty : 0,
    });
  }

  breakdown.push({
    label: input.hintsUsed > 0 ? `Hints used × ${input.hintsUsed}` : 'Hints',
    value: input.hintsUsed > 0 ? -hintPenalty : 0,
  });

  return { baseCompletion, timeDelta, movesDelta, undoPenalty, hintPenalty, total, breakdown };
}

// ─── Utility functions ─────────────────────────────────────────

// Game-agnostic normalisation config (for deal pool stats)
const NORM_CONFIG: Record<string, { movesMin: number; movesRange: number; timeMin: number; timeRange: number }> = {
  klondike: { movesMin: 50, movesRange: 150, timeMin: 60, timeRange: 540 },
  freecell: { movesMin: 40, movesRange: 140, timeMin: 60, timeRange: 480 },
};

function getNormConfig(gameMode: string) {
  return NORM_CONFIG[gameMode] ?? NORM_CONFIG.klondike;
}

function ddsToLabel(dds: number): string {
  if (dds < 26) return 'Easy';
  if (dds < 51) return 'Medium';
  if (dds < 76) return 'Hard';
  if (dds < 101) return 'Expert';
  if (dds < 131) return 'Master';
  return 'Grandmaster';
}

function getTierName(rating: number): string {
  if (rating < 1100) return 'Bronze';
  if (rating < 1300) return 'Silver';
  if (rating < 1500) return 'Gold';
  if (rating < 1700) return 'Platinum';
  if (rating < 2000) return 'Elite';
  if (rating < 2500) return 'Master';
  return 'Grandmaster';
}

function getDdsBucket(dds: number): string {
  if (dds <= 25) return '0-25';
  if (dds <= 50) return '26-50';
  if (dds <= 75) return '51-75';
  if (dds <= 100) return '76-100';
  if (dds <= 130) return '101-130';
  return '131-150';
}

function getIqBucket(iq: number): string {
  if (iq < 1100) return '<1100';
  if (iq < 1300) return '1100-1300';
  if (iq < 1500) return '1300-1500';
  if (iq < 1700) return '1500-1700';
  if (iq < 2000) return '1700-2000';
  if (iq < 2500) return '2000-2500';
  return '2500+';
}

// ─── Hardcoded priors ──────────────────────────────────────────

const REALM_PRIORS: Record<string, Record<string, { time: number; moves: number }>> = {
  '0-25':   { '<1100': { time: 45, moves: 12 },  '1100-1300': { time: 30, moves: 10 }, '1300-1500': { time: 20, moves: 8 },  '1500-1700': { time: 14, moves: 6 },  '1700-2000': { time: 10, moves: 5 }, '2000-2500': { time: 5, moves: 4 },  '2500+': { time: 3, moves: 3 } },
  '26-50':  { '<1100': { time: 120, moves: 22 }, '1100-1300': { time: 75, moves: 18 }, '1300-1500': { time: 45, moves: 14 }, '1500-1700': { time: 30, moves: 10 }, '1700-2000': { time: 20, moves: 8 }, '2000-2500': { time: 9, moves: 6 },  '2500+': { time: 5, moves: 5 } },
  '51-75':  { '<1100': { time: 240, moves: 35 }, '1100-1300': { time: 150, moves: 28 }, '1300-1500': { time: 90, moves: 22 }, '1500-1700': { time: 60, moves: 16 }, '1700-2000': { time: 40, moves: 12 }, '2000-2500': { time: 18, moves: 9 }, '2500+': { time: 10, moves: 7 } },
  '76-100': { '<1100': { time: 420, moves: 55 }, '1100-1300': { time: 270, moves: 42 }, '1300-1500': { time: 160, moves: 32 }, '1500-1700': { time: 100, moves: 22 }, '1700-2000': { time: 65, moves: 16 }, '2000-2500': { time: 28, moves: 11 }, '2500+': { time: 15, moves: 8 } },
  '101-130': { '<1100': { time: 700, moves: 75 }, '1100-1300': { time: 480, moves: 58 }, '1300-1500': { time: 300, moves: 44 }, '1500-1700': { time: 180, moves: 30 }, '1700-2000': { time: 110, moves: 22 }, '2000-2500': { time: 40, moves: 14 }, '2500+': { time: 22, moves: 10 } },
  '131-150': { '<1100': { time: 900, moves: 90 }, '1100-1300': { time: 600, moves: 70 }, '1300-1500': { time: 400, moves: 52 }, '1500-1700': { time: 240, moves: 36 }, '1700-2000': { time: 150, moves: 26 }, '2000-2500': { time: 55, moves: 17 }, '2500+': { time: 30, moves: 12 } },
};

const FREECELL_PRIORS: Record<string, Record<string, { time: number; moves: number }>> = {
  '0-25':   { '<1100': { time: 480, moves: 130 }, '1100-1300': { time: 360, moves: 115 }, '1300-1500': { time: 270, moves: 105 }, '1500-1700': { time: 200, moves: 95 }, '1700-2000': { time: 150, moves: 88 }, '2000-2500': { time: 110, moves: 82 }, '2500+': { time: 80, moves: 76 } },
  '26-50':  { '<1100': { time: 720, moves: 160 }, '1100-1300': { time: 540, moves: 140 }, '1300-1500': { time: 390, moves: 125 }, '1500-1700': { time: 280, moves: 112 }, '1700-2000': { time: 200, moves: 102 }, '2000-2500': { time: 145, moves: 94 }, '2500+': { time: 105, moves: 86 } },
  '51-75':  { '<1100': { time: 1020, moves: 200 }, '1100-1300': { time: 760, moves: 175 }, '1300-1500': { time: 560, moves: 155 }, '1500-1700': { time: 400, moves: 138 }, '1700-2000': { time: 280, moves: 124 }, '2000-2500': { time: 200, moves: 112 }, '2500+': { time: 145, moves: 100 } },
  '76-100': { '<1100': { time: 1380, moves: 250 }, '1100-1300': { time: 1020, moves: 220 }, '1300-1500': { time: 750, moves: 195 }, '1500-1700': { time: 540, moves: 172 }, '1700-2000': { time: 380, moves: 152 }, '2000-2500': { time: 270, moves: 135 }, '2500+': { time: 195, moves: 118 } },
  '101-130': { '<1100': { time: 1800, moves: 300 }, '1100-1300': { time: 1350, moves: 265 }, '1300-1500': { time: 1000, moves: 235 }, '1500-1700': { time: 720, moves: 208 }, '1700-2000': { time: 500, moves: 185 }, '2000-2500': { time: 350, moves: 160 }, '2500+': { time: 250, moves: 140 } },
  '131-150': { '<1100': { time: 2400, moves: 360 }, '1100-1300': { time: 1800, moves: 320 }, '1300-1500': { time: 1350, moves: 280 }, '1500-1700': { time: 960, moves: 250 }, '1700-2000': { time: 680, moves: 220 }, '2000-2500': { time: 480, moves: 190 }, '2500+': { time: 340, moves: 165 } },
};

const KLONDIKE_PRIORS: Record<string, Record<string, { time: number; moves: number }>> = {
  '0-25':   { '<1100': { time: 300, moves: 120 }, '1100-1300': { time: 210, moves: 105 }, '1300-1500': { time: 150, moves: 92 }, '1500-1700': { time: 110, moves: 82 }, '1700-2000': { time: 80, moves: 74 }, '2000-2500': { time: 60, moves: 67 }, '2500+': { time: 45, moves: 60 } },
  '26-50':  { '<1100': { time: 540, moves: 160 }, '1100-1300': { time: 380, moves: 138 }, '1300-1500': { time: 270, moves: 120 }, '1500-1700': { time: 195, moves: 105 }, '1700-2000': { time: 140, moves: 93 }, '2000-2500': { time: 100, moves: 82 }, '2500+': { time: 75, moves: 73 } },
  '51-75':  { '<1100': { time: 840, moves: 210 }, '1100-1300': { time: 600, moves: 180 }, '1300-1500': { time: 430, moves: 155 }, '1500-1700': { time: 310, moves: 135 }, '1700-2000': { time: 220, moves: 118 }, '2000-2500': { time: 155, moves: 103 }, '2500+': { time: 110, moves: 90 } },
  '76-100': { '<1100': { time: 1260, moves: 270 }, '1100-1300': { time: 900, moves: 232 }, '1300-1500': { time: 650, moves: 198 }, '1500-1700': { time: 470, moves: 170 }, '1700-2000': { time: 335, moves: 146 }, '2000-2500': { time: 235, moves: 125 }, '2500+': { time: 165, moves: 107 } },
  '101-130': { '<1100': { time: 1800, moves: 340 }, '1100-1300': { time: 1300, moves: 290 }, '1300-1500': { time: 940, moves: 248 }, '1500-1700': { time: 680, moves: 212 }, '1700-2000': { time: 480, moves: 180 }, '2000-2500': { time: 340, moves: 152 }, '2500+': { time: 240, moves: 130 } },
  '131-150': { '<1100': { time: 2400, moves: 420 }, '1100-1300': { time: 1750, moves: 360 }, '1300-1500': { time: 1260, moves: 305 }, '1500-1700': { time: 910, moves: 260 }, '1700-2000': { time: 650, moves: 220 }, '2000-2500': { time: 460, moves: 185 }, '2500+': { time: 330, moves: 155 } },
};

function getHardcodedPriors(gameMode: string, ddsBucket: string, iqBucket: string): { time: number; moves: number } {
  if (gameMode === 'realm') return REALM_PRIORS[ddsBucket]?.[iqBucket] ?? { time: 120, moves: 22 };
  if (gameMode === 'freecell') return FREECELL_PRIORS[ddsBucket]?.[iqBucket] ?? { time: 390, moves: 125 };
  return KLONDIKE_PRIORS[ddsBucket]?.[iqBucket] ?? { time: 270, moves: 120 };
}

// ─── Streak logic ──────────────────────────────────────────────

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
    userId, today, lastStreakDate, lastWinDate, dailyWinsToday,
    dailyChallengeCompletedToday, conditionMet: initialConditionMet,
  });

  if (!lastWinDate || lastWinDate < today) {
    dailyWinsToday = 0;
    dailyChallengeCompletedToday = false;
  }

  const isWin = result === 'win';
  if (isDailyChallenge && isWin) dailyChallengeCompletedToday = true;
  if (isWin) dailyWinsToday += 1;

  const conditionMet = dailyChallengeCompletedToday || dailyWinsToday >= 2;
  const conditionType = dailyChallengeCompletedToday ? 'daily_challenge' : (dailyWinsToday >= 2 ? 'two_wins' : 'none');

  const { data: existingStreakToday } = await supabaseAdmin
    .from('streak_history').select('id').eq('user_id', userId).eq('date', today).limit(1);
  const streakAlreadyEarnedToday = (existingStreakToday?.length ?? 0) > 0;

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
    } else if (lastStreakDate === dayBeforeYesterday && freezesRemaining > 0 && freezeUsedOn !== yesterday) {
      currentStreak += 1;
      freezesRemaining -= 1;
      freezeUsedOn = yesterday;
      freezeUsed = true;
    } else if (!lastStreakDate) {
      currentStreak = 1;
    } else {
      currentStreak = 1;
    }

    bestStreak = Math.max(currentStreak, bestStreak);
    if (STREAK_MILESTONES.includes(currentStreak)) milestoneReached = currentStreak;

    try {
      const { error: shError } = await supabaseAdmin.from('streak_history').insert({
        user_id: userId, date: today, streak_day_number: currentStreak,
        condition_met: conditionType, streak_length_at_time: currentStreak,
      });
      if (shError) console.error('[complete-game] streak_history insert failed:', shError);
    } catch (shErr) {
      console.error('[complete-game] streak_history insert exception:', shErr);
    }
  }

  const streakUpdate: Record<string, unknown> = {
    daily_wins_today: dailyWinsToday,
    daily_challenge_completed_today: dailyChallengeCompletedToday,
    current_streak: currentStreak,
    best_streak: bestStreak,
    streak_freezes_remaining: freezesRemaining,
  };

  if (conditionMet && !streakAlreadyEarnedToday) streakUpdate.last_streak_date = today;
  if (freezeUsed) streakUpdate.streak_freeze_used_on = freezeUsedOn;
  if (milestoneReached !== null) streakUpdate.pending_milestone = milestoneReached;
  if (isWin) streakUpdate.last_win_date = today;

  return { currentStreak, bestStreak, freezeUsed, milestoneReached, profileUpdate: streakUpdate };
}

// ─── Main handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: authUser }, error: authError } = await supabaseUser.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = authUser.id;

    const body = await req.json();
    const {
      dealSeed, gameMode, drawMode = 3, result, actualMoves, actualTime,
      hintsUsed = 0, undosUsed = 0, dealId: clientDealId, dealUuid: clientDealUuid,
      isDaily: clientIsDaily = false, timezoneOffset = 0, dealDDS: clientDealDDS = 0,
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

    // Duplicate detection
    const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: existingGame } = await supabaseAdmin
      .from('game_history').select('id')
      .eq('user_id', userId).eq('deal_id', clientDealId || `deal-${dealSeed}`)
      .eq('won', result === 'win').eq('moves', actualMoves)
      .gte('played_at', thirtySecsAgo).limit(1);

    if (existingGame && existingGame.length > 0) {
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
        .from('daily_challenges').select('deal_id').eq('date', todayStr).single();
      isDaily = dc?.deal_id === clientDealUuid;
    }

    const isWin = result === 'win';

    // 1. Fetch user profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single();
    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (Number.isInteger(timezoneOffset) && timezoneOffset >= -720 && timezoneOffset <= 840) {
      profile.timezone_offset = timezoneOffset;
    }

    // 2. Fetch deal
    let deal: any = null;
    if (clientDealUuid) {
      const { data } = await supabaseAdmin.from('deals').select('*').eq('id', clientDealUuid).single();
      deal = data;
    }
    if (!deal) {
      const { data } = await supabaseAdmin.from('deals').select('*')
        .eq('seed', dealSeed).eq('game_mode', gameMode).eq('draw_mode', drawMode).single();
      deal = data;
    }

    // 3. DDS resolution
    let dds = 0;
    let ddsSource = 'fallback';

    if (deal && (deal.dds_empirical as number | null) != null && (deal.dds_empirical as number) > 0) {
      dds = deal.dds_empirical as number;
      ddsSource = 'deal-empirical';
    } else if (clientDealDDS > 0) {
      dds = clientDealDDS;
      ddsSource = 'client-parameter';
    } else if (deal && (deal.dds_blended as number) > 0) {
      dds = deal.dds_blended as number;
      ddsSource = 'deal-blended';
    } else {
      const minMoves = deal ? (deal.min_moves as number) : 0;
      if (minMoves > 0) {
        if (gameMode === 'freecell') {
          if (minMoves < 125) dds = Math.round((minMoves / 125) * 25);
          else if (minMoves < 175) dds = Math.round(26 + ((minMoves - 125) / 50) * 29);
          else if (minMoves < 250) dds = Math.round(56 + ((minMoves - 175) / 75) * 24);
          else dds = Math.round(Math.min(150, 81 + ((minMoves - 250) / 100) * 19));
        } else {
          if (minMoves < 100) dds = Math.round((minMoves / 100) * 25);
          else if (minMoves < 130) dds = Math.round(26 + ((minMoves - 100) / 30) * 29);
          else if (minMoves < 160) dds = Math.round(56 + ((minMoves - 130) / 30) * 24);
          else dds = Math.round(Math.min(150, 81 + ((minMoves - 160) / 60) * 19));
        }
        ddsSource = 'calculated-from-min-moves';
      }
      if (dds === 0) { dds = 50; ddsSource = 'neutral-fallback'; }
    }

    console.log('[complete-game] DDS resolution:', { dds, ddsSource });

    // 4. Fetch player mode rating
    const { data: modeRatingRow } = await supabaseAdmin
      .from('player_mode_ratings')
      .select('iq, games_played')
      .eq('user_id', userId).eq('game_mode', gameMode).single();

    const modeIQ = modeRatingRow?.iq ?? 1000;
    const modeGamesPlayed = modeRatingRow?.games_played ?? 0;

    // 5. Resolve expected performance (priors + empirical blend)
    const ddsBucket = getDdsBucket(dds);
    const iqBucket = getIqBucket(modeIQ);
    const isRealm = gameMode === 'realm';

    const { data: perfExpRow } = await supabaseAdmin
      .from('performance_expectations')
      .select('avg_time_seconds, avg_moves, sample_count')
      .eq('game_mode', gameMode).eq('dds_bucket', ddsBucket).eq('iq_bucket', iqBucket)
      .single();

    const hardcoded = getHardcodedPriors(gameMode, ddsBucket, iqBucket);
    const sampleCount = perfExpRow?.sample_count ?? 0;

    let expectedTime: number;
    let expectedMoves: number;

    if (sampleCount >= 30) {
      const empiricalWeight = Math.min(1.0, (sampleCount - 30) / 70);
      expectedTime = hardcoded.time * (1 - empiricalWeight) + (perfExpRow?.avg_time_seconds ?? hardcoded.time) * empiricalWeight;
      expectedMoves = hardcoded.moves * (1 - empiricalWeight) + (perfExpRow?.avg_moves ?? hardcoded.moves) * empiricalWeight;
    } else {
      expectedTime = hardcoded.time;
      expectedMoves = hardcoded.moves;
    }

    // 6. ELO base delta
    const dealRating = 800 + (dds / 100) * 1200;
    const K = modeGamesPlayed < 20 ? 32 : modeGamesPlayed < 50 ? 24 : 16;
    const expected = 1 / (1 + Math.pow(10, (dealRating - modeIQ) / 400));
    const outcome = isWin ? 1 : 0;
    const baseDelta = Math.round(K * (outcome - expected));

    // 7. Run scoring engine
    const scoreResult = computeScore({
      gameMode: gameMode as 'realm' | 'klondike' | 'freecell',
      dealDDS: dds,
      playerIQ: modeIQ,
      actualTime,
      actualMoves,
      hintsUsed,
      undosUsed,
      completed: isWin,
      avgTime: expectedTime,
      avgMoves: expectedMoves,
      baseDelta,
    });

    let finalDelta = scoreResult.total;

    // Daily challenge floor for card games
    if (isDaily && !isRealm) {
      let bracketMin = 0;
      if (modeIQ < 1100) bracketMin = 0;
      else if (modeIQ < 1300) bracketMin = 25;
      else if (modeIQ < 1500) bracketMin = 45;
      else if (modeIQ < 1700) bracketMin = 60;
      else if (modeIQ < 2000) bracketMin = 75;
      else if (modeIQ < 2500) bracketMin = 90;
      else bracketMin = 115;

      if (dds < bracketMin) {
        if (isWin) finalDelta = Math.max(0, finalDelta);
        else finalDelta = -1;
      }
    }

    const newModeIQ = Math.max(0, modeIQ + finalDelta);

    console.log('[complete-game] Scoring:', {
      gameMode, modeIQ, dealRating, dds, K, expected: expected.toFixed(3),
      baseDelta, expectedTime, expectedMoves, actualTime, actualMoves,
      scoreResult: { ...scoreResult, breakdown: scoreResult.breakdown.length + ' items' },
      finalDelta, newModeIQ,
    });

    // 8. Upsert player_mode_ratings
    const { error: modeUpsertErr } = await supabaseAdmin
      .from('player_mode_ratings')
      .upsert({
        user_id: userId,
        game_mode: gameMode,
        iq: newModeIQ,
        games_played: modeGamesPlayed + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,game_mode' });
    if (modeUpsertErr) console.error('[complete-game] mode rating upsert failed:', modeUpsertErr);

    // 9. Calculate composite puzzle IQ
    const { data: puzzleIQResult } = await supabaseAdmin.rpc('calculate_puzzle_iq', { p_user_id: userId });
    const newPuzzleIQ = puzzleIQResult ?? modeIQ;
    const previousPuzzleIQ = profile.rating as number;
    const puzzleIQDelta = newPuzzleIQ - previousPuzzleIQ;

    // 10. Update deal pool stats
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
      const ddsEmpirical = Math.min(150, (1 - winRate) * 25 + normMoves * 25 + normTime * 25 + newAbandons * 25);

      const ddsInitial = deal.dds_initial as number;
      let ddsBlended: number;
      if (newAttempts < 30) ddsBlended = ddsInitial;
      else if (newAttempts < 100) {
        const blend = (newAttempts - 30) / 70;
        ddsBlended = ddsInitial * (1 - blend) + ddsEmpirical * blend;
      } else ddsBlended = ddsEmpirical;

      await supabaseAdmin.from('deals').update({
        pool_attempts: newAttempts, pool_wins: newWins, pool_avg_moves: newAvgMoves,
        pool_avg_time: newAvgTime, pool_abandons: newAbandons,
        dds_empirical: ddsEmpirical, dds_blended: ddsBlended,
      }).eq('id', deal.id);
    }

    // 11. Update performance_expectations (wins only)
    if (isWin && perfExpRow) {
      const oldSC = perfExpRow.sample_count ?? 0;
      const newAvgT = (perfExpRow.avg_time_seconds * oldSC + actualTime) / (oldSC + 1);
      const upsertData: Record<string, unknown> = {
        game_mode: gameMode, dds_bucket: ddsBucket, iq_bucket: iqBucket,
        avg_time_seconds: newAvgT,
        sample_count: oldSC + 1, updated_at: new Date().toISOString(),
      };
      if (!isRealm) {
        const newAvgM = (perfExpRow.avg_moves * oldSC + actualMoves) / (oldSC + 1);
        upsertData.avg_moves = newAvgM;
      }
      await supabaseAdmin.from('performance_expectations').upsert(
        upsertData, { onConflict: 'game_mode,dds_bucket,iq_bucket' },
      );
    }

    // 12. Evaluate streak
    const streakResult = await updateStreak(supabaseAdmin, userId, result, isDaily, profile);

    // 13. Update profile
    const gamesPlayed = profile.games_played as number;
    const perModeKey = `games_played_${gameMode}` as string;
    const currentPerMode = (profile[perModeKey] as number) ?? 0;
    const profileUpdate: Record<string, unknown> = {
      rating: newPuzzleIQ,
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
    if (profileUpdateErr) console.error('[complete-game] profiles update failed:', profileUpdateErr);

    // 14. Insert game history
    const { error: historyErr } = await supabaseAdmin.from('game_history').insert({
      user_id: userId, deal_id: clientDealId || `deal-${dealSeed}`,
      won: isWin, moves: actualMoves, time_seconds: actualTime,
      hints_used: hintsUsed, undos_used: undosUsed,
      difficulty: ddsToLabel(dds), difficulty_score: dds,
      rating_before: previousPuzzleIQ, rating_after: newPuzzleIQ,
      rating_change: puzzleIQDelta, game_mode: gameMode,
      performance_modifier: 1.0,
      base_delta: baseDelta, final_delta: finalDelta,
      deal_uuid: deal?.id || null,
    } as Record<string, unknown>);
    if (historyErr) console.error('[complete-game] game_history insert failed:', historyErr);

    // 15. Return result
    return new Response(JSON.stringify({
      finalDelta,
      baseDelta: scoreResult.baseCompletion,
      newRating: newPuzzleIQ,
      previousRating: previousPuzzleIQ,
      newTier: getTierName(newPuzzleIQ),
      dealDDS: dds,
      dealAvgTime: expectedTime > 0 ? expectedTime : null,
      dealAvgMoves: expectedMoves > 0 ? expectedMoves : null,
      timeBonusPoints: scoreResult.timeDelta,
      movesBonusPoints: scoreResult.movesDelta,
      hintPenaltyPoints: scoreResult.hintPenalty,
      undoPenaltyPoints: scoreResult.undoPenalty,
      hintsUsed, undosUsed,
      breakdown: scoreResult.breakdown,
      // Mode-specific IQ data
      modeIQ: newModeIQ,
      previousModeIQ: modeIQ,
      modeIQDelta: finalDelta,
      gameMode,
      puzzleIQ: newPuzzleIQ,
      puzzleIQDelta,
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
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
