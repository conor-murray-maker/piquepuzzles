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
    // Auth check: require service role key or valid admin JWT
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let authorized = false;

    // Check if caller is using the service role key directly (internal/cron calls)
    if (authHeader === `Bearer ${serviceRoleKey}`) {
      authorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      // Verify JWT and check admin email
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData } = await anonClient.auth.getClaims(token);
      if (claimsData?.claims?.email === 'conor-murray@hotmail.com') {
        authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const todayStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString().split('T')[0];

    // Check if today already has a challenge
    const { data: existing } = await supabaseAdmin
      .from('daily_challenges')
      .select('id, deal_id, game_mode, day_of_week, target_dds_min, target_dds_max')
      .eq('date', todayStr)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ status: 'already_exists', date: todayStr, challenge: existing }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Target Medium difficulty: DDS 35–58
    const targetMin = 35;
    const targetMax = 58;
    const dayOfWeek = now.getUTCDay();

    // Try calibration deals first
    const { data: calibrationDeals } = await supabaseAdmin
      .from('deals')
      .select('id, seed, game_mode, dds_blended, min_moves, confidence')
      .eq('is_calibration', true)
      .gte('dds_blended', targetMin)
      .lte('dds_blended', targetMax)
      .gte('confidence', 0.8)
      .limit(50);

    let pool = calibrationDeals || [];

    // Fallback: any verified deal in range
    if (pool.length === 0) {
      const { data: anyDeals } = await supabaseAdmin
        .from('deals')
        .select('id, seed, game_mode, dds_blended, min_moves, confidence')
        .gte('dds_blended', targetMin)
        .lte('dds_blended', targetMax)
        .gte('confidence', 0.5)
        .limit(50);
      pool = anyDeals || [];
    }

    // Fallback: any deal in range regardless of confidence
    if (pool.length === 0) {
      const { data: fallbackDeals } = await supabaseAdmin
        .from('deals')
        .select('id, seed, game_mode, dds_blended, min_moves, confidence')
        .gte('dds_blended', targetMin)
        .lte('dds_blended', targetMax)
        .limit(50);
      pool = fallbackDeals || [];
    }

    // Final fallback: any deal at all
    if (pool.length === 0) {
      const { data: anyDeal } = await supabaseAdmin
        .from('deals')
        .select('id, seed, game_mode, dds_blended, min_moves, confidence')
        .limit(10);
      pool = anyDeal || [];
    }

    if (pool.length === 0) {
      return new Response(JSON.stringify({ status: 'no_deals_available', date: todayStr }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pick random deal from pool
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const { error: insertError } = await supabaseAdmin.from('daily_challenges').insert({
      date: todayStr,
      game_mode: pick.game_mode,
      deal_id: pick.id,
      day_of_week: dayOfWeek,
      target_dds_min: targetMin,
      target_dds_max: targetMax,
    });

    if (insertError) {
      console.error('[seed-today-challenge] insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to insert daily challenge' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      status: 'created',
      date: todayStr,
      deal: {
        id: pick.id,
        seed: pick.seed,
        game_mode: pick.game_mode,
        dds_blended: pick.dds_blended,
        min_moves: pick.min_moves,
        confidence: pick.confidence,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[seed-today-challenge] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
