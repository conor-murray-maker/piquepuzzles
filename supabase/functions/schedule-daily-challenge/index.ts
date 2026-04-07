import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Weekly difficulty escalation (resets Monday)
const DAILY_DIFFICULTY: Record<number, string> = {
  1: 'Easy',      // Monday
  2: 'Medium',    // Tuesday
  3: 'Hard',      // Wednesday
  4: 'Hard',      // Thursday
  5: 'Expert',    // Friday
  6: 'Expert',    // Saturday
  0: 'Expert',    // Sunday
};

// DDS ranges per difficulty
const DIFFICULTY_DDS: Record<string, { min: number; max: number }> = {
  Easy:   { min: 0, max: 25 },
  Medium: { min: 26, max: 50 },
  Hard:   { min: 51, max: 75 },
  Expert: { min: 76, max: 100 },
};

const ALL_MODES = ['klondike', 'freecell', 'realm'];

function getMonday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const todayStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString().split('T')[0];
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const results: Record<string, string> = {};

    // Get deal IDs used in last 60 days to exclude
    const sixtyDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 60));
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];
    const { data: recentDailies } = await supabaseAdmin
      .from('daily_challenges')
      .select('deal_id')
      .gte('date', sixtyDaysAgoStr);
    const recentDealIds = new Set((recentDailies || []).map((d: any) => d.deal_id));

    for (const dateStr of [todayStr, tomorrowStr]) {
      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from('daily_challenges')
        .select('id')
        .eq('date', dateStr)
        .single();

      if (existing) {
        results[dateStr] = 'already_exists';
        continue;
      }

      const dateObj = new Date(dateStr + 'T00:00:00Z');
      const dayOfWeek = dateObj.getUTCDay();
      const mondayStr = getMonday(dateObj);

      // === MODE ROTATION ===
      // Check if rotation exists for this week
      let { data: rotation } = await supabaseAdmin
        .from('weekly_challenge_rotation')
        .select('*')
        .eq('week_start', mondayStr)
        .single();

      // If Monday and no rotation, create one
      if (!rotation) {
        const shuffled = shuffleArray(ALL_MODES);
        const mondayMode = shuffled[0];
        const tuesdayMode = shuffled[1];
        const wednesdayMode = shuffled[2];

        const { data: newRotation, error: rotErr } = await supabaseAdmin
          .from('weekly_challenge_rotation')
          .insert({
            week_start: mondayStr,
            monday_mode: mondayMode,
            tuesday_mode: tuesdayMode,
            wednesday_mode: wednesdayMode,
          })
          .select()
          .single();

        if (rotErr) {
          // Might be race condition — re-fetch
          const { data: refetch } = await supabaseAdmin
            .from('weekly_challenge_rotation')
            .select('*')
            .eq('week_start', mondayStr)
            .single();
          rotation = refetch;
        } else {
          rotation = newRotation;
        }
      }

      if (!rotation) {
        results[dateStr] = 'rotation_creation_failed';
        continue;
      }

      // Map day of week to mode from rotation (Thu=Mon, Fri=Tue, Sat=Wed, Sun=Mon pattern)
      const dayToModeKey: Record<number, string> = {
        1: 'monday_mode',    // Monday
        2: 'tuesday_mode',   // Tuesday
        3: 'wednesday_mode', // Wednesday
        4: 'monday_mode',    // Thursday repeats Monday
        5: 'tuesday_mode',   // Friday repeats Tuesday
        6: 'wednesday_mode', // Saturday repeats Wednesday
        0: 'monday_mode',    // Sunday repeats Monday
      };

      const modeKey = dayToModeKey[dayOfWeek] || 'monday_mode';
      const todayMode = rotation[modeKey] as string;
      const difficulty = DAILY_DIFFICULTY[dayOfWeek] || 'Hard';
      const ddsRange = DIFFICULTY_DDS[difficulty] || DIFFICULTY_DDS.Hard;

      // === DEAL SELECTION ===
      // Try calibration deals first with high confidence
      let pool: any[] = [];
      const difficulties = [difficulty];
      // Fallback difficulties
      if (difficulty === 'Expert') difficulties.push('Hard', 'Medium');
      else if (difficulty === 'Hard') difficulties.push('Medium', 'Easy');
      else if (difficulty === 'Medium') difficulties.push('Easy');

      for (const diff of difficulties) {
        const range = DIFFICULTY_DDS[diff] || ddsRange;

        const { data: candidates } = await supabaseAdmin
          .from('deals')
          .select('id, dds_blended, game_mode, confidence')
          .eq('game_mode', todayMode)
          .gte('dds_blended', range.min)
          .lte('dds_blended', range.max)
          .gte('confidence', 0.5)
          .limit(100);

        pool = (candidates || []).filter((d: any) => !recentDealIds.has(d.id));
        if (pool.length > 0) break;
      }

      // Final fallback: any deal in that mode
      if (pool.length === 0) {
        const { data: anyDeals } = await supabaseAdmin
          .from('deals')
          .select('id, dds_blended, game_mode')
          .eq('game_mode', todayMode)
          .limit(50);
        pool = (anyDeals || []).filter((d: any) => !recentDealIds.has(d.id));
      }

      // Absolute fallback: any calibration deal in any mode
      if (pool.length === 0) {
        const { data: fallback } = await supabaseAdmin
          .from('deals')
          .select('id, game_mode')
          .eq('is_calibration', true)
          .limit(10);

        if (!fallback || fallback.length === 0) {
          results[dateStr] = 'no_deals_available';
          continue;
        }
        pool = fallback;
      }

      const pick = pool[Math.floor(Math.random() * pool.length)];
      await supabaseAdmin.from('daily_challenges').insert({
        date: dateStr,
        game_mode: pick.game_mode,
        deal_id: pick.id,
        day_of_week: dayOfWeek,
        target_dds_min: ddsRange.min,
        target_dds_max: ddsRange.max,
        difficulty: difficulty,
        week_rotation_id: rotation.id,
      });
      results[dateStr] = 'created';
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[schedule-daily-challenge] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
