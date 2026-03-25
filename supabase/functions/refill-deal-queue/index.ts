import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const WORKING_SET_SIZE = 25;
const GRADUATION_THRESHOLD = 30;

// Server-side DDS computation
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
      freshDeals: Array<{ seed: number; minMoves: number; ddsInitial: number; simulationCount?: number }>;
      calibrationCount: number;
    };

    // Validate inputs
    const validGameModes = ['klondike', 'freecell'];
    const validDrawModes = [1, 3];
    const safeGameMode = validGameModes.includes(gameMode) ? gameMode : 'klondike';
    const safeDrawMode = validDrawModes.includes(drawMode) ? drawMode : 3;
    const safeCalibrationCount = Math.max(0, Math.min(10, typeof calibrationCount === 'number' ? calibrationCount : 2));

    // 1. Ensure working set is populated for this game mode
    await ensureWorkingSet(supabaseAdmin, safeGameMode);

    // 2. Count unserved deals in queue
    const { count } = await supabaseAdmin
      .from('deal_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('game_mode', safeGameMode)
      .is('served_at', null);

    const currentCount = count ?? 0;
    if (currentCount >= 5) {
      return new Response(JSON.stringify({ queued: currentCount, added: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const queueEntries: Array<{ user_id: string; game_mode: string; deal_id: string; tier: string }> = [];

    // 3. Insert fresh deals into deals table and queue them
    const safeFreshDeals = Array.isArray(freshDeals) ? freshDeals.slice(0, 20) : [];
    for (const fd of safeFreshDeals) {
      const minMoves = typeof fd.minMoves === 'number' && fd.minMoves > 0 ? fd.minMoves : 0;
      const dds = minMoves > 0
        ? (safeGameMode === 'freecell' ? freecellComplexity(minMoves) : klondikeComplexity(minMoves))
        : 50;

      const simCount = typeof fd.simulationCount === 'number' ? fd.simulationCount : 50;
      const confidence = Math.max(0, Math.min(1, simCount / 50));

      const { data: dealData } = await supabaseAdmin
        .from('deals')
        .upsert({
          seed: fd.seed,
          game_mode: safeGameMode,
          draw_mode: safeDrawMode,
          min_moves: minMoves,
          dds_initial: dds,
          dds_blended: dds,
          tier: 'fresh',
          is_calibration: false,
          confidence,
          simulation_count: simCount,
        }, { onConflict: 'seed,game_mode,draw_mode' })
        .select('id')
        .single();

      if (dealData) {
        queueEntries.push({
          user_id: userId,
          game_mode: safeGameMode,
          deal_id: dealData.id,
          tier: 'fresh',
        });
      }
    }

    // 4. Pick deals from the working set for the user's queue
    const workingSetDeals = await getWorkingSetDeals(supabaseAdmin, userId, safeGameMode, 3);
    for (const d of workingSetDeals) {
      queueEntries.push({
        user_id: userId,
        game_mode: safeGameMode,
        deal_id: d.id,
        tier: d.tier,
      });
    }

    // 5. Pick calibration deals not yet played by user
    const { data: calProgress } = await supabaseAdmin
      .from('user_calibration_progress')
      .select('calibration_deal_ids_played')
      .eq('user_id', userId)
      .eq('game_mode', safeGameMode)
      .single();

    const playedIds = calProgress?.calibration_deal_ids_played ?? [];

    let calQuery = supabaseAdmin
      .from('deals')
      .select('id')
      .eq('game_mode', safeGameMode)
      .eq('is_calibration', true)
      .limit(safeCalibrationCount * 3);

    const { data: calDeals } = await calQuery;

    if (calDeals) {
      const unplayed = calDeals.filter((d: any) => !playedIds.includes(d.id));
      
      if (unplayed.length === 0 && calDeals.length > 0) {
        await supabaseAdmin
          .from('user_calibration_progress')
          .upsert({
            user_id: userId,
            game_mode: safeGameMode,
            calibration_deal_ids_played: [],
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,game_mode' });
        
        const picked = calDeals.slice(0, safeCalibrationCount);
        for (const d of picked) {
          queueEntries.push({
            user_id: userId,
            game_mode: safeGameMode,
            deal_id: d.id,
            tier: 'calibration',
          });
        }
      } else {
        const picked = unplayed.slice(0, safeCalibrationCount);
        for (const d of picked) {
          queueEntries.push({
            user_id: userId,
            game_mode: safeGameMode,
            deal_id: d.id,
            tier: 'calibration',
          });
        }
      }
    }

    // 6. Insert queue entries
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

/**
 * Ensure the working set has up to WORKING_SET_SIZE deals for a game mode.
 * Graduate deals that have hit the attempt threshold, then backfill.
 */
async function ensureWorkingSet(admin: any, gameMode: string) {
  // 1. Get current working set with deal data
  const { data: currentSet } = await admin
    .from('deal_working_set')
    .select('id, deal_id, deals(pool_attempts)')
    .eq('game_mode', gameMode);

  const workingSet = currentSet || [];

  // 2. Graduate deals that have hit 30 pool_attempts
  const graduated: string[] = [];
  for (const ws of workingSet) {
    const attempts = ws.deals?.pool_attempts ?? 0;
    if (attempts >= GRADUATION_THRESHOLD) {
      graduated.push(ws.id);
    }
  }

  if (graduated.length > 0) {
    await admin
      .from('deal_working_set')
      .delete()
      .in('id', graduated);
  }

  // 3. Calculate how many slots to fill
  const remainingCount = workingSet.length - graduated.length;
  const slotsToFill = WORKING_SET_SIZE - remainingCount;

  if (slotsToFill <= 0) return;

  // 4. Get IDs already in working set
  const existingDealIds = workingSet
    .filter((ws: any) => !graduated.includes(ws.id))
    .map((ws: any) => ws.deal_id);

  // 5. Find candidates from the pool, prioritized:
  //    - starter deals first (is_calibration = true or tier = 'starter')
  //    - then by closest to 30 attempts (desc pool_attempts)
  //    - then oldest created_at
  const { data: candidates } = await admin
    .from('deals')
    .select('id, pool_attempts, tier, is_calibration, created_at')
    .eq('game_mode', gameMode)
    .gt('min_moves', 0)
    .order('is_calibration', { ascending: false })
    .order('pool_attempts', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(slotsToFill + existingDealIds.length + 10);

  if (!candidates?.length) return;

  // Filter out deals already in working set
  const existingSet = new Set(existingDealIds);
  const newDeals = candidates
    .filter((c: any) => !existingSet.has(c.id))
    .slice(0, slotsToFill);

  if (newDeals.length === 0) return;

  // 6. Insert new working set entries
  const entries = newDeals.map((d: any) => ({
    game_mode: gameMode,
    deal_id: d.id,
    attempts_at_entry: d.pool_attempts,
  }));

  await admin.from('deal_working_set').upsert(entries, { onConflict: 'game_mode,deal_id', ignoreDuplicates: true });
}

/**
 * Get deals from the working set that the user hasn't already been queued.
 */
async function getWorkingSetDeals(admin: any, userId: string, gameMode: string, count: number) {
  // Get working set deal IDs
  const { data: wsDeals } = await admin
    .from('deal_working_set')
    .select('deal_id')
    .eq('game_mode', gameMode);

  if (!wsDeals?.length) return [];

  const wsDealIds = wsDeals.map((w: any) => w.deal_id);

  // Get deals already queued for this user (served or not)
  const { data: userQueued } = await admin
    .from('deal_queue')
    .select('deal_id')
    .eq('user_id', userId)
    .eq('game_mode', gameMode);

  const queuedSet = new Set((userQueued || []).map((q: any) => q.deal_id));

  // Get deals already played by this user
  const { data: userPlayed } = await admin
    .from('user_played_deals')
    .select('deal_id')
    .eq('user_id', userId);

  const playedSet = new Set((userPlayed || []).map((p: any) => p.deal_id));

  // Filter to unplayed, unqueued working set deals
  const availableIds = wsDealIds.filter((id: string) => !queuedSet.has(id) && !playedSet.has(id));

  if (availableIds.length === 0) return [];

  // Fetch deal details
  const { data: deals } = await admin
    .from('deals')
    .select('id, tier')
    .in('id', availableIds.slice(0, count));

  return deals || [];
}
