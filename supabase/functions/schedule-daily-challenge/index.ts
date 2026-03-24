import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Weekly progressive difficulty curve (UTC day of week)
const WEEKLY_DDS: Record<number, { min: number; max: number; label: string }> = {
  1: { min: 15, max: 30, label: 'Easy' },          // Monday
  2: { min: 25, max: 45, label: 'Easy-Medium' },    // Tuesday
  3: { min: 40, max: 58, label: 'Medium' },          // Wednesday
  4: { min: 50, max: 65, label: 'Medium-Hard' },     // Thursday
  5: { min: 58, max: 75, label: 'Hard' },             // Friday
  6: { min: 68, max: 85, label: 'Hard-Expert' },      // Saturday
  0: { min: 78, max: 100, label: 'Expert' },           // Sunday
};

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

    // Calculate tomorrow's date and today in UTC
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const todayStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString().split('T')[0];

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
      const dayOfWeek = dateObj.getUTCDay(); // 0=Sun, 6=Sat
      const ddsRange = WEEKLY_DDS[dayOfWeek] || WEEKLY_DDS[3]; // fallback to Thursday

      // Query calibration deals within DDS range with confidence >= 0.8
      const { data: calibrationCandidates } = await supabaseAdmin
        .from('deals')
        .select('id, dds_blended, game_mode, confidence')
        .eq('is_calibration', true)
        .gte('dds_blended', ddsRange.min)
        .lte('dds_blended', ddsRange.max)
        .gte('confidence', 0.8)
        .limit(100);

      // Filter out recently used deals
      let pool = (calibrationCandidates || []).filter((d: any) => !recentDealIds.has(d.id));

      // Fallback: organic verified deals if calibration pool empty
      if (pool.length === 0) {
        const { data: organicCandidates } = await supabaseAdmin
          .from('deals')
          .select('id, dds_blended, game_mode, confidence')
          .eq('is_calibration', false)
          .gte('dds_blended', ddsRange.min)
          .lte('dds_blended', ddsRange.max)
          .gte('confidence', 0.5)
          .limit(100);

        pool = (organicCandidates || []).filter((d: any) => !recentDealIds.has(d.id));
      }

      // Final fallback: any deal in DDS range regardless of calibration/confidence
      if (pool.length === 0) {
        const { data: anyDeals } = await supabaseAdmin
          .from('deals')
          .select('id, dds_blended, game_mode')
          .gte('dds_blended', ddsRange.min)
          .lte('dds_blended', ddsRange.max)
          .limit(50);

        pool = (anyDeals || []).filter((d: any) => !recentDealIds.has(d.id));
      }

      if (pool.length === 0) {
        // Absolute fallback: any calibration deal
        const { data: fallback } = await supabaseAdmin
          .from('deals')
          .select('id, game_mode')
          .eq('is_calibration', true)
          .limit(10);

        if (!fallback || fallback.length === 0) {
          results[dateStr] = 'no_deals_available';
          continue;
        }

        const pick = fallback[Math.floor(Math.random() * fallback.length)];
        await supabaseAdmin.from('daily_challenges').insert({
          date: dateStr,
          game_mode: pick.game_mode,
          deal_id: pick.id,
          day_of_week: dayOfWeek,
          target_dds_min: ddsRange.min,
          target_dds_max: ddsRange.max,
        });
        results[dateStr] = 'created_from_fallback';
        continue;
      }

      // Alternate game mode by day (even date = klondike, odd = freecell)
      const preferredMode = dateObj.getUTCDate() % 2 === 0 ? 'klondike' : 'freecell';
      const modeFiltered = pool.filter((c: any) => c.game_mode === preferredMode);
      const finalPool = modeFiltered.length > 0 ? modeFiltered : pool;

      // Pick randomly
      const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
      await supabaseAdmin.from('daily_challenges').insert({
        date: dateStr,
        game_mode: pick.game_mode,
        deal_id: pick.id,
        day_of_week: dayOfWeek,
        target_dds_min: ddsRange.min,
        target_dds_max: ddsRange.max,
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
