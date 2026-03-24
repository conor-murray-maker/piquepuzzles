import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Verify JWT
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: authError } = await supabaseUser.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = authUser.id;

    const body = await req.json();
    const {
      gameMode = 'klondike',
      drawMode = 3,
      freshDeals = [],
      calibrationCount = 2,
    } = body as {
      gameMode: string;
      drawMode: number;
      freshDeals: Array<{ seed: number; minMoves: number; ddsInitial: number }>;
      calibrationCount: number;
    };

    // 1. Count unserved deals in queue
    const { count } = await supabaseAdmin
      .from('deal_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('game_mode', gameMode)
      .is('served_at', null);

    const currentCount = count ?? 0;
    if (currentCount >= 5) {
      return new Response(JSON.stringify({ queued: currentCount, added: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const queueEntries: Array<{ user_id: string; game_mode: string; deal_id: string; tier: string }> = [];

    // 2. Insert fresh deals into deals table and queue them
    for (const fd of freshDeals) {
      const { data: dealData } = await supabaseAdmin
        .from('deals')
        .upsert({
          seed: fd.seed,
          game_mode: gameMode,
          draw_mode: drawMode,
          min_moves: fd.minMoves,
          dds_initial: fd.ddsInitial,
          dds_blended: fd.ddsInitial,
          tier: 'fresh',
          is_calibration: false,
        }, { onConflict: 'seed,game_mode,draw_mode' })
        .select('id')
        .single();

      if (dealData) {
        queueEntries.push({
          user_id: userId,
          game_mode: gameMode,
          deal_id: dealData.id,
          tier: 'fresh',
        });
      }
    }

    // 3. Pick calibration deals not yet played by user
    const { data: calProgress } = await supabaseAdmin
      .from('user_calibration_progress')
      .select('calibration_deal_ids_played')
      .eq('user_id', userId)
      .eq('game_mode', gameMode)
      .single();

    const playedIds = calProgress?.calibration_deal_ids_played ?? [];

    // Get calibration deals not yet played
    let calQuery = supabaseAdmin
      .from('deals')
      .select('id')
      .eq('game_mode', gameMode)
      .eq('is_calibration', true)
      .limit(calibrationCount * 3); // fetch extra to filter

    const { data: calDeals } = await calQuery;

    if (calDeals) {
      const unplayed = calDeals.filter((d: any) => !playedIds.includes(d.id));
      
      // If all played, reset progress
      if (unplayed.length === 0 && calDeals.length > 0) {
        await supabaseAdmin
          .from('user_calibration_progress')
          .upsert({
            user_id: userId,
            game_mode: gameMode,
            calibration_deal_ids_played: [],
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,game_mode' });
        
        // Use all deals since we reset
        const picked = calDeals.slice(0, calibrationCount);
        for (const d of picked) {
          queueEntries.push({
            user_id: userId,
            game_mode: gameMode,
            deal_id: d.id,
            tier: 'calibration',
          });
        }
      } else {
        const picked = unplayed.slice(0, calibrationCount);
        for (const d of picked) {
          queueEntries.push({
            user_id: userId,
            game_mode: gameMode,
            deal_id: d.id,
            tier: 'calibration',
          });
        }
      }
    }

    // 4. Insert queue entries
    if (queueEntries.length > 0) {
      await supabaseAdmin.from('deal_queue').insert(queueEntries);
    }

    return new Response(JSON.stringify({
      queued: currentCount + queueEntries.length,
      added: queueEntries.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
