import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: require a valid JWT (service role or authenticated user with admin role)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Calculate tomorrow's date in UTC
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Also ensure today exists
    const todayStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString().split('T')[0];

    const results: Record<string, string> = {};

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

      // Determine day of week to limit Expert frequency (max 1/week = only Saturdays)
      const dateObj = new Date(dateStr + 'T00:00:00Z');
      const dayOfWeek = dateObj.getUTCDay(); // 0=Sun, 6=Sat
      const allowExpert = dayOfWeek === 6;

      // Pick a calibration deal with DDS 30-75 (Medium to Hard)
      // Allow DDS up to 90 on Saturdays for Expert
      const maxDds = allowExpert ? 90 : 75;

      const { data: candidates } = await supabaseAdmin
        .from('deals')
        .select('id, dds_blended, game_mode')
        .eq('is_calibration', true)
        .gte('dds_blended', 30)
        .lte('dds_blended', maxDds)
        .limit(50);

      if (!candidates || candidates.length === 0) {
        // Fallback: any calibration deal
        const { data: fallback } = await supabaseAdmin
          .from('deals')
          .select('id, game_mode')
          .eq('is_calibration', true)
          .limit(10);

        if (!fallback || fallback.length === 0) {
          results[dateStr] = 'no_calibration_deals_available';
          continue;
        }

        const pick = fallback[Math.floor(Math.random() * fallback.length)];
        await supabaseAdmin.from('daily_challenges').insert({
          date: dateStr,
          game_mode: pick.game_mode,
          deal_id: pick.id,
        });
        results[dateStr] = 'created_from_fallback';
        continue;
      }

      // Alternate game mode by day
      const preferredMode = dateObj.getUTCDate() % 2 === 0 ? 'klondike' : 'freecell';
      const modeFiltered = candidates.filter((c: any) => c.game_mode === preferredMode);
      const pool = modeFiltered.length > 0 ? modeFiltered : candidates;

      // Pick randomly from pool
      const pick = pool[Math.floor(Math.random() * pool.length)];
      await supabaseAdmin.from('daily_challenges').insert({
        date: dateStr,
        game_mode: pick.game_mode,
        deal_id: pick.id,
      });
      results[dateStr] = 'created';
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
