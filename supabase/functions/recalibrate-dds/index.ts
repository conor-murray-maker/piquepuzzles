import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Updated DDS curves matching engine code
function klondikeComplexity(minMoves: number): number {
  if (minMoves < 52) return Math.round((minMoves / 52) * 25);
  if (minMoves < 80) return Math.round(26 + ((minMoves - 52) / (80 - 52)) * 29);
  if (minMoves < 110) return Math.round(56 + ((minMoves - 80) / (110 - 80)) * 24);
  return Math.round(Math.min(100, 81 + ((minMoves - 110) / 60) * 19));
}

function freecellComplexity(minMoves: number): number {
  if (minMoves < 40) return Math.round((minMoves / 40) * 25);
  if (minMoves < 65) return Math.round(26 + ((minMoves - 40) / (65 - 40)) * 29);
  if (minMoves < 90) return Math.round(56 + ((minMoves - 65) / (90 - 65)) * 24);
  return Math.round(Math.min(100, 81 + ((minMoves - 90) / 50) * 19));
}

function ddsToLabel(dds: number): string {
  if (dds <= 25) return 'Easy';
  if (dds <= 55) return 'Medium';
  if (dds <= 80) return 'Hard';
  return 'Expert';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

    const distribution = { Easy: 0, Medium: 0, Hard: 0, Expert: 0 };
    let updated = 0;
    let skipped = 0;

    for (const deal of (deals || [])) {
      const minMoves = deal.min_moves as number;
      if (minMoves <= 0) {
        skipped++;
        continue;
      }

      const newDDS = deal.game_mode === 'freecell'
        ? freecellComplexity(minMoves)
        : klondikeComplexity(minMoves);

      const label = ddsToLabel(newDDS);
      distribution[label as keyof typeof distribution]++;

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
      distribution,
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
