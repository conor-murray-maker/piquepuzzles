import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Updated DDS curves matching actual solver output distributions
function klondikeComplexity(minMoves: number): number {
  if (minMoves < 100) return Math.round((minMoves / 100) * 25);
  if (minMoves < 130) return Math.round(26 + ((minMoves - 100) / (130 - 100)) * 29);
  if (minMoves < 160) return Math.round(56 + ((minMoves - 130) / (160 - 130)) * 24);
  return Math.round(Math.min(100, 81 + ((minMoves - 160) / 60) * 19));
}

function freecellComplexity(minMoves: number): number {
  if (minMoves < 125) return Math.round((minMoves / 125) * 25);
  if (minMoves < 175) return Math.round(26 + ((minMoves - 125) / (175 - 125)) * 29);
  if (minMoves < 250) return Math.round(56 + ((minMoves - 175) / (250 - 175)) * 24);
  return Math.round(Math.min(100, 81 + ((minMoves - 250) / 100) * 19));
}

function ddsToLabel(dds: number): string {
  if (dds < 26) return 'Easy';
  if (dds < 56) return 'Medium';
  if (dds < 81) return 'Hard';
  return 'Expert';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: only allow service-role callers (cron jobs / admin)
    const authHeader = req.headers.get('Authorization') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );

    // Fetch all deals
    const { data: deals, error } = await supabaseAdmin
      .from('deals')
      .select('id, seed, game_mode, min_moves, dds_initial, dds_blended, pool_attempts');

    if (error) {
      console.error('[recalibrate-dds] fetch error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch deals' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const beforeDistribution = { Easy: 0, Medium: 0, Hard: 0, Expert: 0 };
    const afterDistribution = { Easy: 0, Medium: 0, Hard: 0, Expert: 0 };
    let updated = 0;
    let skipped = 0;

    for (const deal of (deals || [])) {
      const minMoves = deal.min_moves as number;
      if (minMoves <= 0) {
        skipped++;
        continue;
      }

      // Track before distribution
      const oldLabel = ddsToLabel(deal.dds_initial as number);
      beforeDistribution[oldLabel as keyof typeof beforeDistribution]++;

      const newDDS = deal.game_mode === 'freecell'
        ? freecellComplexity(minMoves)
        : klondikeComplexity(minMoves);

      const label = ddsToLabel(newDDS);
      afterDistribution[label as keyof typeof afterDistribution]++;

      // Only update dds_blended if under 30 pool attempts (still solver-only)
      const poolAttempts = deal.pool_attempts as number;
      const updateData: Record<string, unknown> = {
        dds_initial: newDDS,
      };
      if (poolAttempts < 30) {
        updateData.dds_blended = newDDS;
      }

      await supabaseAdmin.from('deals').update(updateData).eq('id', deal.id);
      updated++;
    }

    const result = {
      totalDeals: (deals || []).length,
      updated,
      skipped,
      beforeDistribution,
      afterDistribution,
    };

    console.log('[recalibrate-dds] complete:', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[recalibrate-dds] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
