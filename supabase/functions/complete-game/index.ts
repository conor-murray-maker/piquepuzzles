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
  baseDelta: number;
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
  timeWeight: number;
  movesWeight: number;
  undoPenaltyPerUndo: number;
  baseCompletionFraction: number;
  lossPenalty: number;
  winFloor: number | null;
}

const MODE_CONFIGS: Record<string, ModeConfig> = {
  realm: {
    timeWeight: 20,
    movesWeight: 0,
    undoPenaltyPerUndo: 2,
    baseCompletionFraction: 0.4,
    lossPenalty: -20,
    winFloor: null,
  },
  freecell: {
    timeWeight: 20,
    movesWeight: 10,
    undoPenaltyPerUndo: 0,
    baseCompletionFraction: 0.5,
    lossPenalty: -20,
    winFloor: null,
  },
  klondike: {
    timeWeight: 10,
    movesWeight: 20,
    undoPenaltyPerUndo: 0,
    baseCompletionFraction: 0.6,
    lossPenalty: -20,
    winFloor: null,
  },
};

function worstPossibleWinScore(
  config: ModeConfig,
  baseCompletion: number
): number {
  // Worst time: actualTime → ∞, ratio → 0
  const worstTimeDelta = config.timeWeight
    ? config.timeWeight * (Math.pow(0.001, 1.3) - 1)
    : 0;

  // Worst moves: actualMoves → ∞, ratio → 0
  const worstMovesDelta = config.movesWeight
    ? config.movesWeight * (Math.pow(0.001, 1.3) - 1)
    : 0;

  // Worst hint penalty: 6+ hints = 30% of baseCompletion
  const worstHintPenalty = baseCompletion * 0.3;

  // Realm undo penalty: assume worst case 50 undos
  const worstUndoPenalty = config.undoPenaltyPerUndo
    ? config.undoPenaltyPerUndo * 50
    : 0;

  return Math.floor(
    baseCompletion
    + worstTimeDelta
    + worstMovesDelta
    - worstHintPenalty
    - worstUndoPenalty
  );
}

function computeScore(input: ScoreInput): ScoreResult {
  const config = MODE_CONFIGS[input.gameMode] ?? MODE_CONFIGS.klondike;

  if (!input.completed) {
    // Dynamic loss penalty: worse than the worst possible win
    const lossBaseCompletion = Math.round(input.baseDelta * config.baseCompletionFraction);
    const dynamicLoss = worstPossibleWinScore(config, lossBaseCompletion) - 1;
    return {
      baseCompletion: dynamicLoss,
      timeDelta: 0,
      movesDelta: 0,
      undoPenalty: 0,
      hintPenalty: 0,
      total: dynamicLoss,
      breakdown: [
        { label: `${ddsToLabel(input.dealDDS)} deal — not solved`, value: dynamicLoss },
      ],
    };
  }

  const baseCompletion = Math.round(input.baseDelta * config.baseCompletionFraction);

  const timeRatio = Math.max(input.avgTime, 1) / Math.max(input.actualTime, 1);
  const timeDelta = Math.round(config.timeWeight * (Math.pow(timeRatio, 1.3) - 1));

  let movesDelta = 0;
  if (config.movesWeight > 0 && input.avgMoves > 0) {
    const movesRatio = input.avgMoves / Math.max(input.actualMoves, 1);
    movesDelta = Math.round(config.movesWeight * (Math.pow(movesRatio, 1.3) - 1));
  }

  const undoPenalty = config.undoPenaltyPerUndo * input.undosUsed;

  const hintPenaltyFraction = Math.max(0.7, 1 - input.hintsUsed * 0.05);
  const hintPenalty = Math.round(baseCompletion * (1 - hintPenaltyFraction));

  let total = baseCompletion + timeDelta + movesDelta - undoPenalty - hintPenalty;

  if (config.winFloor !== null) {
    total = Math.max(config.winFloor, total);
  }

  // Dynamic loss floor: a win must always score better than a loss
  const dynamicLossPenalty = worstPossibleWinScore(config, baseCompletion) - 1;
  total = Math.max(dynamicLossPenalty + 1, total);

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

/** Realm difficulty from grid size (min_moves = grid size for Realm) */
function realmDifficultyFromGridSize(gridSize: number): string {
  switch (gridSize) {
    case 5: return 'Easy';
    case 6: return 'Medium';
    case 7: return 'Hard';
    case 8: return 'Expert';
    case 9: return 'Master';
    case 10: return 'Grandmaster';
    default: return 'Medium';
  }
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
  '0-25':   { '<1100': { time: 45, moves: 0 },  '1100-1300': { time: 30, moves: 0 }, '1300-1500': { time: 20, moves: 0 },  '1500-1700': { time: 14, moves: 0 },  '1700-2000': { time: 10, moves: 0 }, '2000-2500': { time: 5, moves: 0 },  '2500+': { time: 3, moves: 0 } },
  '26-50':  { '<1100': { time: 120, moves: 0 }, '1100-1300': { time: 75, moves: 0 }, '1300-1500': { time: 45, moves: 0 }, '1500-1700': { time: 30, moves: 0 }, '1700-2000': { time: 20, moves: 0 }, '2000-2500': { time: 9, moves: 0 },  '2500+': { time: 5, moves: 0 } },
  '51-75':  { '<1100': { time: 240, moves: 0 }, '1100-1300': { time: 150, moves: 0 }, '1300-1500': { time: 90, moves: 0 }, '1500-1700': { time: 60, moves: 0 }, '1700-2000': { time: 40, moves: 0 }, '2000-2500': { time: 18, moves: 0 }, '2500+': { time: 10, moves: 0 } },
  '76-100': { '<1100': { time: 420, moves: 0 }, '1100-1300': { time: 270, moves: 0 }, '1300-1500': { time: 160, moves: 0 }, '1500-1700': { time: 100, moves: 0 }, '1700-2000': { time: 65, moves: 0 }, '2000-2500': { time: 28, moves: 0 }, '2500+': { time: 15, moves: 0 } },
  '101-130': { '<1100': { time: 700, moves: 0 }, '1100-1300': { time: 480, moves: 0 }, '1300-1500': { time: 300, moves: 0 }, '1500-1700': { time: 180, moves: 0 }, '1700-2000': { time: 110, moves: 0 }, '2000-2500': { time: 40, moves: 0 }, '2500+': { time: 22, moves: 0 } },
  '131-150': { '<1100': { time: 900, moves: 0 }, '1100-1300': { time: 600, moves: 0 }, '1300-1500': { time: 400, moves: 0 }, '1500-1700': { time: 240, moves: 0 }, '1700-2000': { time: 150, moves: 0 }, '2000-2500': { time: 55, moves: 0 }, '2500+': { time: 30, moves: 0 } },
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

// ─── SQL escape helper ─────────────────────────────────────────

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  // Escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ─── Main handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Variables for audit logging (captured early so failure path can log)
  let userId = 'unknown';
  let clientDealId = 'unknown';
  let clientDealUuid: string | null = null;
  let gameMode = 'unknown';

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: authUser }, error: authError } = await supabaseUser.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    userId = authUser.id;

    const body = await req.json();
    const {
      dealSeed, drawMode = 3, result, actualMoves, actualTime,
      hintsUsed = 0, undosUsed = 0, isDaily: clientIsDaily = false,
      timezoneOffset = 0, dealDDS: clientDealDDS = 0,
    } = body;
    gameMode = body.gameMode;
    clientDealId = body.dealId || `deal-${dealSeed}`;
    clientDealUuid = body.dealUuid || null;

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
      .eq('user_id', userId).eq('deal_id', clientDealId)
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
    const isDailyChallenge = isDaily;

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

    // Daily challenges do NOT affect IQ
    const finalDelta = isDailyChallenge ? 0 : scoreResult.total;
    const iqDeltaApplied = !isDailyChallenge;

    const newModeIQ = isDailyChallenge ? modeIQ : Math.max(0, modeIQ + finalDelta);

    console.log('[complete-game] Scoring:', {
      gameMode, modeIQ, dealRating, dds, K, expected: expected.toFixed(3),
      baseDelta, expectedTime, expectedMoves, actualTime, actualMoves,
      scoreResult: { ...scoreResult, breakdown: scoreResult.breakdown.length + ' items' },
      finalDelta, newModeIQ,
    });

    // 12. Evaluate streak (before transaction — streak_history is separate)
    const streakResult = await updateStreak(supabaseAdmin, userId, result, isDaily, profile);

    // ─── ATOMIC TRANSACTION: All critical writes in one SQL block ───
    // This ensures game_history, player_mode_ratings, and profiles are
    // updated together. If any step fails, everything rolls back.

    const previousPuzzleIQ = profile.rating as number;
    const gamesPlayed = profile.games_played as number;
    const perModeKey = `games_played_${gameMode}` as string;
    const currentPerMode = (profile[perModeKey] as number) ?? 0;

    // Build the atomic SQL transaction
    const nowISO = new Date().toISOString();
    const dealUuidForInsert = deal?.id || null;
    // Realm: derive difficulty from grid size (min_moves = N for Realm); others: from DDS
    const dealMinMoves = deal ? (deal.min_moves as number) : 0;
    const difficulty = gameMode === 'realm' && dealMinMoves >= 5 && dealMinMoves <= 10
      ? realmDifficultyFromGridSize(dealMinMoves)
      : ddsToLabel(dds);

    // We need to compute composite IQ inside the transaction to avoid races.
    // We'll do it by first upserting mode rating, then computing the average.
    const txSQL = `
BEGIN;

${isDailyChallenge ? '-- Skip mode rating upsert for daily challenges (no IQ impact)' : `-- Step 1: Upsert player_mode_ratings (IQ + games_played counter)
INSERT INTO player_mode_ratings (user_id, game_mode, iq, games_played, updated_at)
VALUES (${sqlLiteral(userId)}, ${sqlLiteral(gameMode)}, ${newModeIQ}, ${modeGamesPlayed + 1}, ${sqlLiteral(nowISO)})
ON CONFLICT (user_id, game_mode)
DO UPDATE SET iq = ${newModeIQ}, games_played = ${modeGamesPlayed + 1}, updated_at = ${sqlLiteral(nowISO)};`}

-- Step 3: Insert game_history
INSERT INTO game_history (
  user_id, deal_id, won, moves, time_seconds, hints_used, undos_used,
  difficulty, difficulty_score, rating_before, rating_after, rating_change,
  game_mode, performance_modifier, base_delta, final_delta, deal_uuid,
  is_daily_challenge, iq_delta_applied
) VALUES (
  ${sqlLiteral(userId)}, ${sqlLiteral(clientDealId)}, ${isWin}, ${actualMoves}, ${actualTime},
  ${hintsUsed}, ${undosUsed}, ${sqlLiteral(difficulty)}, ${dds},
  ${previousPuzzleIQ},
  ${isDailyChallenge ? previousPuzzleIQ : `(SELECT COALESCE(floor(avg(COALESCE(pmr.iq, 1000)))::integer, ${previousPuzzleIQ})
   FROM game_modes gm LEFT JOIN player_mode_ratings pmr ON pmr.game_mode = gm.id AND pmr.user_id = ${sqlLiteral(userId)}
   WHERE gm.is_active = true)`},
  ${isDailyChallenge ? 0 : `(SELECT COALESCE(floor(avg(COALESCE(pmr.iq, 1000)))::integer, ${previousPuzzleIQ})
   FROM game_modes gm LEFT JOIN player_mode_ratings pmr ON pmr.game_mode = gm.id AND pmr.user_id = ${sqlLiteral(userId)}
   WHERE gm.is_active = true) - ${previousPuzzleIQ}`},
  ${sqlLiteral(gameMode)}, 1.0, ${baseDelta}, ${finalDelta},
  ${dealUuidForInsert ? sqlLiteral(dealUuidForInsert) : 'NULL'},
  ${isDailyChallenge}, ${iqDeltaApplied}
);

-- Step 4: Update profile (rating, counters, streak)
UPDATE profiles SET
  ${isDailyChallenge ? '' : `rating = (SELECT COALESCE(floor(avg(COALESCE(pmr.iq, 1000)))::integer, ${previousPuzzleIQ})
            FROM game_modes gm LEFT JOIN player_mode_ratings pmr ON pmr.game_mode = gm.id AND pmr.user_id = ${sqlLiteral(userId)}
            WHERE gm.is_active = true),`}
  games_played = ${gamesPlayed + 1},
  games_won = ${(profile.games_won as number) + (isWin ? 1 : 0)},
  ${perModeKey} = ${currentPerMode + 1},
  updated_at = ${sqlLiteral(nowISO)},
  daily_wins_today = ${streakResult.profileUpdate.daily_wins_today ?? profile.daily_wins_today},
  daily_challenge_completed_today = ${streakResult.profileUpdate.daily_challenge_completed_today ?? profile.daily_challenge_completed_today},
  current_streak = ${streakResult.currentStreak},
  best_streak = ${streakResult.bestStreak},
  streak_freezes_remaining = ${streakResult.profileUpdate.streak_freezes_remaining ?? profile.streak_freezes_remaining}
  ${streakResult.profileUpdate.last_streak_date ? `, last_streak_date = ${sqlLiteral(streakResult.profileUpdate.last_streak_date)}` : ''}
  ${streakResult.profileUpdate.streak_freeze_used_on ? `, streak_freeze_used_on = ${sqlLiteral(streakResult.profileUpdate.streak_freeze_used_on)}` : ''}
  ${streakResult.milestoneReached !== null ? `, pending_milestone = ${streakResult.milestoneReached}` : ''}
  ${isWin ? `, last_win_date = ${sqlLiteral(streakResult.profileUpdate.last_win_date)}` : ''}
  ${Number.isInteger(timezoneOffset) && timezoneOffset >= -720 && timezoneOffset <= 840 ? `, timezone_offset = ${timezoneOffset}` : ''}
WHERE id = ${sqlLiteral(userId)};

COMMIT;
`;

    // Execute the atomic transaction via raw SQL
    const { error: txError } = await supabaseAdmin.rpc('execute_sql', { sql: txSQL }).maybeSingle();

    // If RPC not available, fall back to individual writes but treat as atomic block
    let newPuzzleIQ = previousPuzzleIQ;
    let txFailed = false;
    let txErrorMsg = '';

    if (txError) {
      // RPC may not exist — fall back to sequential writes with explicit error checking
      console.warn('[complete-game] Transaction RPC unavailable, using sequential writes:', txError.message);

      // Step 1: Upsert mode rating (skip for daily challenges)
      if (!isDailyChallenge) {
        const { error: modeErr } = await supabaseAdmin
          .from('player_mode_ratings')
          .upsert({
            user_id: userId, game_mode: gameMode,
            iq: newModeIQ, games_played: modeGamesPlayed + 1,
            updated_at: nowISO,
          }, { onConflict: 'user_id,game_mode' });

        if (modeErr) {
          txFailed = true;
          txErrorMsg = `mode_rating_upsert: ${modeErr.message}`;
          console.error('[complete-game] CRITICAL: mode rating upsert failed:', modeErr);
        }
      }

      if (!txFailed) {
        // Step 2: Calculate composite IQ
        if (!isDailyChallenge) {
          const { data: puzzleIQResult } = await supabaseAdmin.rpc('calculate_puzzle_iq', { p_user_id: userId });
          newPuzzleIQ = puzzleIQResult ?? newModeIQ;
        } else {
          newPuzzleIQ = previousPuzzleIQ;
        }

        // Step 3: Insert game history
        const { error: historyErr } = await supabaseAdmin.from('game_history').insert({
          user_id: userId, deal_id: clientDealId,
          won: isWin, moves: actualMoves, time_seconds: actualTime,
          hints_used: hintsUsed, undos_used: undosUsed,
          difficulty, difficulty_score: dds,
          rating_before: previousPuzzleIQ, rating_after: newPuzzleIQ,
          rating_change: newPuzzleIQ - previousPuzzleIQ, game_mode: gameMode,
          performance_modifier: 1.0,
          base_delta: baseDelta, final_delta: finalDelta,
          deal_uuid: dealUuidForInsert,
          is_daily_challenge: isDailyChallenge,
          iq_delta_applied: iqDeltaApplied,
        } as Record<string, unknown>);

        if (historyErr) {
          txFailed = true;
          txErrorMsg = `game_history_insert: ${historyErr.message}`;
          console.error('[complete-game] CRITICAL: game_history insert failed:', historyErr);
        }
      }

      if (!txFailed) {
        // Step 4: Update profile
        const profileUpdate: Record<string, unknown> = {
          rating: newPuzzleIQ,
          games_played: gamesPlayed + 1,
          games_won: (profile.games_won as number) + (isWin ? 1 : 0),
          [perModeKey]: currentPerMode + 1,
          updated_at: nowISO,
          ...streakResult.profileUpdate,
        };
        if (Number.isInteger(timezoneOffset) && timezoneOffset >= -720 && timezoneOffset <= 840) {
          profileUpdate.timezone_offset = timezoneOffset;
        }

        const { error: profileUpdateErr } = await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', userId);
        if (profileUpdateErr) {
          txFailed = true;
          txErrorMsg = `profile_update: ${profileUpdateErr.message}`;
          console.error('[complete-game] CRITICAL: profile update failed:', profileUpdateErr);
        }
      }
    } else {
      // Transaction succeeded — compute the new puzzle IQ for the response
      const { data: puzzleIQResult } = await supabaseAdmin.rpc('calculate_puzzle_iq', { p_user_id: userId });
      newPuzzleIQ = puzzleIQResult ?? newModeIQ;
    }

    // If the critical writes failed, log audit and return error
    if (txFailed) {
      console.error('[complete-game] TRANSACTION FAILED:', { userId, clientDealId, gameMode, error: txErrorMsg });

      // Write audit log
      try {
        await supabaseAdmin.from('game_completion_log').insert({
          user_id: userId, deal_id: clientDealId, deal_uuid: dealUuidForInsert,
          game_mode: gameMode, succeeded: false, error_message: txErrorMsg,
          payload: { dds, finalDelta, modeIQ, newModeIQ, actualMoves, actualTime, result },
        });
      } catch (auditErr) {
        console.warn('[complete-game] audit log insert failed (non-fatal):', auditErr);
      }

      return new Response(JSON.stringify({
        error: 'completion_failed',
        message: 'Game completion could not be recorded. Please try again.',
        detail: txErrorMsg,
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const puzzleIQDelta = newPuzzleIQ - previousPuzzleIQ;

    // ─── Non-critical updates (fire-and-forget, don't block response) ───

    // Update deal pool stats
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

      try {
        const { error: dealUpdateErr } = await supabaseAdmin.from('deals').update({
          pool_attempts: newAttempts, pool_wins: newWins, pool_avg_moves: newAvgMoves,
          pool_avg_time: newAvgTime, pool_abandons: newAbandons,
          dds_empirical: ddsEmpirical, dds_blended: ddsBlended,
        }).eq('id', deal.id);
        if (dealUpdateErr) console.error('[complete-game] deal pool stats update failed:', dealUpdateErr);
      } catch (dealErr) {
        console.warn('[complete-game] deal pool stats update error (non-fatal):', dealErr);
      }
    }

    // Update performance_expectations (wins only)
    if (isWin && perfExpRow) {
      const oldSC = perfExpRow.sample_count ?? 0;
      const newAvgT = (perfExpRow.avg_time_seconds * oldSC + actualTime) / (oldSC + 1);
      const upsertData: Record<string, unknown> = {
        game_mode: gameMode, dds_bucket: ddsBucket, iq_bucket: iqBucket,
        avg_time_seconds: newAvgT,
        sample_count: oldSC + 1, updated_at: nowISO,
      };
      if (!isRealm) {
        const newAvgM = (perfExpRow.avg_moves * oldSC + actualMoves) / (oldSC + 1);
        upsertData.avg_moves = newAvgM;
      } else {
        upsertData.avg_moves = 0;
      }
      try {
        const { error: perfErr } = await supabaseAdmin.from('performance_expectations').upsert(
          upsertData, { onConflict: 'game_mode,dds_bucket,iq_bucket' } as any,
        );
        if (perfErr) console.error('[complete-game] perf expectations upsert failed:', perfErr);
      } catch (perfCatchErr) {
        console.warn('[complete-game] perf expectations upsert error (non-fatal):', perfCatchErr);
      }
    }

    // Write success audit log
    try {
      await supabaseAdmin.from('game_completion_log').insert({
        user_id: userId, deal_id: clientDealId, deal_uuid: dealUuidForInsert,
        game_mode: gameMode, succeeded: true, error_message: null,
        payload: { dds, finalDelta, modeIQ, newModeIQ, newPuzzleIQ, actualMoves, actualTime, result },
      });
    } catch (auditErr) {
      console.warn('[complete-game] audit log insert failed (non-fatal):', auditErr);
    }

    // Return result
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[complete-game] internal error:', err);

    // Write failure audit log
    try {
      await supabaseAdmin.from('game_completion_log').insert({
        user_id: userId, deal_id: clientDealId, deal_uuid: clientDealUuid,
        game_mode: gameMode, succeeded: false, error_message: `exception: ${errorMsg}`,
      });
    } catch (auditErr) {
      console.warn('[complete-game] audit log insert failed (non-fatal):', auditErr);
    }

    return new Response(JSON.stringify({ error: 'completion_failed', message: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
