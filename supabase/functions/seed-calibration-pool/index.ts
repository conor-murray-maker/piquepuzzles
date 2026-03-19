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

    const body = await req.json();
    const { deals } = body as {
      deals: Array<{
        seed: number;
        gameMode: string;
        drawMode: number;
        minMoves: number;
        ddsInitial: number;
        difficulty: string;
      }>;
    };

    if (!deals || !Array.isArray(deals) || deals.length === 0) {
      return new Response(JSON.stringify({ error: 'No deals provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = deals.map(d => ({
      seed: d.seed,
      game_mode: d.gameMode,
      draw_mode: d.drawMode,
      min_moves: d.minMoves,
      dds_initial: d.ddsInitial,
      dds_blended: d.ddsInitial,
      tier: 'calibration',
      is_calibration: true,
    }));

    // Upsert to be idempotent — skip duplicates by seed+game_mode+draw_mode
    const { data, error } = await supabaseAdmin
      .from('deals')
      .upsert(rows, { onConflict: 'seed,game_mode,draw_mode', ignoreDuplicates: true })
      .select('id');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ inserted: data?.length ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
