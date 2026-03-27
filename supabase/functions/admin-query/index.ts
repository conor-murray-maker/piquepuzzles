import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["conor-murray@hotmail.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Verify user with anon client
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: claimsErr } =
      await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (claimsErr || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const email = authUser.email as string;
    if (!ADMIN_EMAILS.includes(email)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Service role client bypasses RLS
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, params } = await req.json();

    switch (action) {
      case "ping": {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "overview_stats": {
        const today = new Date().toISOString().split("T")[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000)
          .toISOString()
          .split("T")[0];
        const monthAgo = new Date(Date.now() - 30 * 86400000)
          .toISOString()
          .split("T")[0];

        const [
          profilesRes,
          gamesAllRes,
          gamesTodayRes,
          premiumRes,
          dailyTodayRes,
          dealsRes,
          dauRes,
          wauRes,
          mauRes,
          avgRatingRes,
        ] = await Promise.all([
          adminClient.from("profiles").select("id", { count: "exact", head: true }),
          adminClient.from("game_history").select("id", { count: "exact", head: true }),
          adminClient.from("game_history").select("id", { count: "exact", head: true }).gte("played_at", today),
          adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "premium"),
          adminClient.from("daily_challenge_completions").select("id", { count: "exact", head: true }).eq("date", today),
          adminClient.from("deals").select("id", { count: "exact", head: true }).gte("confidence", 0.8),
          adminClient.from("game_history").select("user_id").gte("played_at", today),
          adminClient.from("game_history").select("user_id").gte("played_at", weekAgo),
          adminClient.from("game_history").select("user_id").gte("played_at", monthAgo),
          adminClient.from("profiles").select("rating"),
        ]);

        const dauUsers = new Set((dauRes.data || []).map((r: any) => r.user_id)).size;
        const wauUsers = new Set((wauRes.data || []).map((r: any) => r.user_id)).size;
        const mauUsers = new Set((mauRes.data || []).map((r: any) => r.user_id)).size;
        const ratings = (avgRatingRes.data || []).map((r: any) => r.rating);
        const avgRating = ratings.length ? Math.round(ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) : 0;

        return json({
          totalUsers: profilesRes.count || 0,
          dau: dauUsers,
          wau: wauUsers,
          mau: mauUsers,
          totalGames: gamesAllRes.count || 0,
          gamesToday: gamesTodayRes.count || 0,
          avgRating,
          premiumCount: premiumRes.count || 0,
          premiumPct: profilesRes.count ? Math.round(((premiumRes.count || 0) / profilesRes.count) * 100) : 0,
          dailyCompleted: dailyTodayRes.count || 0,
          dealPoolSize: dealsRes.count || 0,
        });
      }

      case "dau_chart": {
        const rows: any[] = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const dateStr = d.toISOString().split("T")[0];
          const nextDate = new Date(d.getTime() + 86400000).toISOString().split("T")[0];
          const { data } = await adminClient
            .from("game_history")
            .select("user_id")
            .gte("played_at", dateStr)
            .lt("played_at", nextDate);
          const unique = new Set((data || []).map((r: any) => r.user_id)).size;
          rows.push({ date: dateStr, dau: unique });
        }
        return json(rows);
      }

      case "games_chart": {
        const rows: any[] = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const dateStr = d.toISOString().split("T")[0];
          const nextDate = new Date(d.getTime() + 86400000).toISOString().split("T")[0];
          const { count } = await adminClient
            .from("game_history")
            .select("id", { count: "exact", head: true })
            .gte("played_at", dateStr)
            .lt("played_at", nextDate);
          rows.push({ date: dateStr, games: count || 0 });
        }
        return json(rows);
      }

      case "users_list": {
        const page = params?.page || 0;
        const pageSize = params?.pageSize || 20;
        const search = params?.search || "";
        const sortBy = params?.sortBy || "created_at";
        const sortDir = params?.sortDir === "asc";

        let query = adminClient
          .from("profiles")
          .select("*")
          .order(sortBy, { ascending: sortDir })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (search) {
          query = query.or(`display_name.ilike.%${search}%`);
        }

        const { data, error } = await query;
        const { count } = await adminClient
          .from("profiles")
          .select("id", { count: "exact", head: true });

        // Get emails from auth via admin API
        const userIds = (data || []).map((u: any) => u.id);
        const emailMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          if (authData?.users) {
            for (const u of authData.users) {
              emailMap[u.id] = u.email || "";
            }
          }
        }

        return json({
          users: (data || []).map((u: any) => ({
            ...u,
            email: emailMap[u.id] || "",
            win_rate: u.games_played > 0 ? Math.round((u.games_won / u.games_played) * 100) : 0,
          })),
          total: count || 0,
        });
      }

      case "user_detail": {
        const userId = params?.userId;
        if (!userId) return json({ error: "Missing userId" }, 400);

        const { data: games } = await adminClient
          .from("game_history")
          .select("*")
          .eq("user_id", userId)
          .order("played_at", { ascending: false })
          .limit(20);

        const { data: streaks } = await adminClient
          .from("streak_history")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(30);

        return json({ games: games || [], streaks: streaks || [] });
      }

      case "user_action": {
        const { userId: uid, actionType } = params || {};
        if (!uid) return json({ error: "Missing userId" }, 400);

        if (actionType === "reset_rating") {
          const { error } = await adminClient
            .from("profiles")
            .update({ rating: 1000 })
            .eq("id", uid);
          if (error) throw error;
          return json({ success: true });
        }

        if (actionType === "grant_premium") {
          const expires = new Date(Date.now() + 30 * 86400000).toISOString();
          const { error } = await adminClient
            .from("profiles")
            .update({
              subscription_status: "premium",
              subscription_tier: "admin_grant",
              premium_expires_at: expires,
            })
            .eq("id", uid);
          if (error) throw error;
          return json({ success: true });
        }

        return json({ error: "Unknown action" }, 400);
      }

      case "export_user_history": {
        const userId = params?.userId;
        if (!userId) return json({ error: "Missing userId" }, 400);
        const { data } = await adminClient
          .from("game_history")
          .select("*")
          .eq("user_id", userId)
          .order("played_at", { ascending: false });
        return json(data || []);
      }

      case "deals_health": {
        // Paginate to avoid 1000-row Supabase limit
        let allDeals: any[] = [];
        const fetchSize = 1000;
        let fetchPage = 0;
        while (true) {
          const { data: batch } = await adminClient
            .from("deals")
            .select("tier, game_mode, dds_blended, confidence, pool_attempts, is_calibration")
            .range(fetchPage * fetchSize, (fetchPage + 1) * fetchSize - 1);
          if (!batch || batch.length === 0) break;
          allDeals = allDeals.concat(batch);
          if (batch.length < fetchSize) break;
          fetchPage++;
        }
        const deals = allDeals;
        const byTier: Record<string, number> = {};
        const byMode: Record<string, number> = {};
        const byBand: Record<string, number> = { Easy: 0, Medium: 0, Hard: 0, Expert: 0 };
        let totalConf = 0;
        let solverOnly = 0, blending = 0, empirical = 0;
        const confHistogram = Array(10).fill(0);

        for (const d of deals) {
          byTier[d.tier] = (byTier[d.tier] || 0) + 1;
          byMode[d.game_mode] = (byMode[d.game_mode] || 0) + 1;
          totalConf += d.confidence;
          const bucket = Math.min(9, Math.floor(d.confidence * 10));
          confHistogram[bucket]++;
          if (d.pool_attempts < 30) solverOnly++;
          else if (d.pool_attempts < 100) blending++;
          else empirical++;
          const dds = d.dds_blended;
          if (dds < 35) byBand.Easy++;
          else if (dds < 58) byBand.Medium++;
          else if (dds < 78) byBand.Hard++;
          else byBand.Expert++;
        }

        return json({
          total: deals.length,
          byTier,
          byMode,
          byBand,
          avgConfidence: deals.length ? (totalConf / deals.length).toFixed(2) : 0,
          solverOnly,
          blending,
          empirical,
          confHistogram: confHistogram.map((count, i) => ({
            range: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`,
            count,
          })),
        });
      }

      case "dds_scatter": {
        const { data } = await adminClient
          .from("deals")
          .select("seed, game_mode, dds_initial, dds_blended, pool_attempts, pool_wins, pool_avg_moves, pool_avg_time")
          .gte("pool_attempts", 1)
          .limit(500);
        return json(data || []);
      }

      case "deals_list": {
        const page = params?.page || 0;
        const pageSize = params?.pageSize || 20;
        const sortBy = params?.sortBy || "created_at";
        const sortDir = params?.sortDir === "asc";

        let query = adminClient
          .from("deals")
          .select("*")
          .order(sortBy, { ascending: sortDir })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (params?.gameMode) query = query.eq("game_mode", params.gameMode);
        if (params?.tier) query = query.eq("tier", params.tier);
        if (params?.minAttempts) query = query.gte("pool_attempts", params.minAttempts);

        const { data } = await query;
        let countQuery = adminClient.from("deals").select("id", { count: "exact", head: true });
        if (params?.gameMode) countQuery = countQuery.eq("game_mode", params.gameMode);
        if (params?.tier) countQuery = countQuery.eq("tier", params.tier);
        if (params?.minAttempts) countQuery = countQuery.gte("pool_attempts", params.minAttempts);
        const { count } = await countQuery;
        return json({ deals: data || [], total: count || 0 });
      }

      case "games_feed": {
        const { data: games } = await adminClient
          .from("game_history")
          .select("*")
          .order("played_at", { ascending: false })
          .limit(50);

        // Get user names
        const userIds = [...new Set((games || []).map((g: any) => g.user_id))];
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        const nameMap: Record<string, string> = {};
        for (const p of profiles || []) nameMap[p.id] = p.display_name || "Unknown";

        return json(
          (games || []).map((g: any) => ({
            ...g,
            display_name: nameMap[g.user_id] || "Unknown",
          }))
        );
      }

      case "games_aggregates": {
        const { data: games } = await adminClient
          .from("game_history")
          .select("won, difficulty, game_mode, performance_modifier, final_delta, time_seconds, difficulty_score")
          .limit(1000);
        return json(games || []);
      }

      case "export_games": {
        const { data } = await adminClient
          .from("game_history")
          .select("*")
          .order("played_at", { ascending: false })
          .limit(1000);
        return json(data || []);
      }

      case "streaks_active": {
        const { data } = await adminClient
          .from("profiles")
          .select("id, display_name, current_streak, best_streak, last_streak_date, subscription_status, streak_freezes_remaining")
          .gte("current_streak", 2)
          .order("current_streak", { ascending: false });
        return json(data || []);
      }

      case "streaks_distribution": {
        const { data } = await adminClient.from("profiles").select("current_streak");
        const dist: Record<number, number> = {};
        for (const p of data || []) {
          const s = p.current_streak;
          dist[s] = (dist[s] || 0) + 1;
        }
        return json(Object.entries(dist).map(([k, v]) => ({ streak: Number(k), count: v })).sort((a, b) => a.streak - b.streak));
      }

      case "streaks_milestones": {
        const milestones = [3, 7, 14, 30, 50, 100];
        const result: Record<number, number> = {};
        for (const m of milestones) {
          const { count } = await adminClient
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("best_streak", m);
          result[m] = count || 0;
        }
        return json(result);
      }

      case "streaks_at_risk": {
        const today = new Date().toISOString().split("T")[0];
        const { data: atRisk } = await adminClient
          .from("profiles")
          .select("id, display_name, current_streak, last_streak_date, subscription_status")
          .gte("current_streak", 3)
          .neq("last_streak_date", today);
        return json(atRisk || []);
      }

      case "system_tables": {
        const tables = [
          "deals",
          "game_history",
          "profiles",
          "user_played_deals",
          "streak_history",
          "daily_challenges",
          "daily_challenge_completions",
          "challenges",
          "challenge_completions",
        ];
        const counts: Record<string, number> = {};
        for (const t of tables) {
          const { count } = await adminClient.from(t).select("id", { count: "exact", head: true });
          counts[t] = count || 0;
        }
        return json(counts);
      }

      case "system_daily": {
        const today = new Date().toISOString().split("T")[0];
        const { data: challenge } = await adminClient
          .from("daily_challenges")
          .select("*, deals(*)")
          .eq("date", today)
          .maybeSingle();

        const { data: completions } = await adminClient
          .from("daily_challenge_completions")
          .select("*, profiles(display_name)")
          .eq("date", today)
          .order("actual_time", { ascending: true })
          .limit(10);

        return json({ challenge, completions: completions || [] });
      }

      case "system_cron": {
        // Try to query cron.job — may fail if extension not available to this role
        try {
          const { data, error } = await adminClient.rpc("get_cron_jobs");
          if (error) {
            return json({ jobs: [], error: "Could not query cron jobs" });
          }
          return json({ jobs: data || [] });
        } catch {
          return json({ jobs: [], error: "pg_cron not accessible" });
        }
      }

      case "trigger_seed": {
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/seed-today-challenge`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const result = await resp.json();
        return json(result);
      }

      case "pool_health_check": {
        // Check how many unplayed deals exist per game mode per difficulty band
        const gameModes = ['klondike', 'freecell', 'realm'];
        const bands = [
          { label: 'Easy', min: 0, max: 35 },
          { label: 'Medium', min: 26, max: 65 },
          { label: 'Hard', min: 50, max: 80 },
          { label: 'Expert', min: 65, max: 100 },
        ];
        const lowPools: Array<{ mode: string; difficulty: string; remaining: number }> = [];

        for (const mode of gameModes) {
          for (const band of bands) {
            const { count } = await adminClient
              .from('deals')
              .select('id', { count: 'exact', head: true })
              .eq('game_mode', mode)
              .gte('dds_blended', band.min)
              .lte('dds_blended', band.max);
            const remaining = count || 0;
            if (remaining < 20) {
              lowPools.push({ mode, difficulty: band.label, remaining });
            }
          }
        }

        return json({ lowPools });
      }

      case "diagnostic_snapshot": {
        const today = new Date().toISOString().split("T")[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const dayAgo = new Date(Date.now() - 86400000).toISOString();

        // Fetch all data in parallel
        const [
          profilesRes, allDealsRes, recentGamesRes, allGamesRes,
          streakHistRes, dailyChalRes, dailyCompRes, tableCountsRes,
          cronRes, userPlayedDealsRes,
        ] = await Promise.all([
          adminClient.from("profiles").select("*"),
          adminClient.from("deals").select("*"),
          adminClient.from("game_history").select("*").order("played_at", { ascending: false }).limit(200),
          adminClient.from("game_history").select("id, user_id, won, difficulty, performance_modifier, final_delta, base_delta, time_seconds, moves, game_mode, deal_uuid, played_at, rating_before, rating_after, difficulty_score").limit(1000),
          adminClient.from("streak_history").select("*").gte("date", weekAgo),
          adminClient.from("daily_challenges").select("*, deals(*)").eq("date", today).maybeSingle(),
          adminClient.from("daily_challenge_completions").select("*, profiles(display_name)").eq("date", today).order("actual_time", { ascending: true }),
          Promise.all(
            ["deals","game_history","profiles","user_played_deals","streak_history","daily_challenges"].map(async t => {
              const { count } = await adminClient.from(t).select("id", { count: "exact", head: true });
              return [t, count || 0] as [string, number];
            })
          ),
          (async () => { try { const { data, error } = await adminClient.rpc("get_cron_jobs"); if (error) { console.warn("get_cron_jobs RPC error:", error.message); return null; } return data || []; } catch (e) { console.warn("get_cron_jobs exception:", e); return null; } })(),
          adminClient.from("user_played_deals").select("deal_id, user_id"),
        ]);

        const profiles = profilesRes.data || [];
        const allDeals = allDealsRes.data || [];
        const recentGames = recentGamesRes.data || [];
        const allGames = allGamesRes.data || [];
        const completions = dailyCompRes.data || [];
        const userPlayedDeals = userPlayedDealsRes.data || [];

        // Users
        const users = profiles.map((p: any) => ({
          userId: p.id, displayName: p.display_name, puzzleIQ: p.rating,
          tier: p.subscription_tier || "free", gamesPlayed: p.games_played,
          wins: p.games_won, winRate: p.games_played > 0 ? +(p.games_won / p.games_played).toFixed(3) : 0,
          currentStreak: p.current_streak, bestStreak: p.best_streak,
          subscriptionStatus: p.subscription_status, joinedAt: p.created_at, lastActiveAt: p.updated_at,
        }));

        // Deal pool
        const byTier: Record<string, number> = { starter: 0, organic: 0, daily_challenge: 0 };
        const byMode: Record<string, number> = { klondike: 0, freecell: 0 };
        const byDiff: Record<string, number> = { easy: 0, medium: 0, hard: 0, expert: 0 };
        let totalConf = 0, totalInitial = 0, totalBlended = 0, totalDrift = 0;
        let solverOnly = 0, blending = 0, empiricalOnly = 0;
        let dealsWithZeroMinMoves = 0, totalSimCount = 0;
        const confByMode: Record<string, { sum: number; count: number }> = { klondike: { sum: 0, count: 0 }, freecell: { sum: 0, count: 0 } };

        for (const d of allDeals) {
          byTier[d.tier] = (byTier[d.tier] || 0) + 1;
          byMode[d.game_mode] = (byMode[d.game_mode] || 0) + 1;
          totalConf += d.confidence;
          totalInitial += d.dds_initial;
          totalBlended += d.dds_blended;
          totalDrift += Math.abs(d.dds_blended - d.dds_initial);
          totalSimCount += d.simulation_count || 0;
          if (d.min_moves <= 0) dealsWithZeroMinMoves++;
          if (d.pool_attempts < 30) solverOnly++;
          else if (d.pool_attempts < 100) blending++;
          else empiricalOnly++;
          const mode = d.game_mode as string;
          if (confByMode[mode]) { confByMode[mode].sum += d.confidence; confByMode[mode].count++; }
          const dds = d.dds_blended;
          if (dds <= 25) byDiff.easy++;
          else if (dds <= 55) byDiff.medium++;
          else if (dds <= 80) byDiff.hard++;
          else byDiff.expert++;
        }
        const n = allDeals.length || 1;
        const totalDeals = allDeals.length;
        const easyPct = totalDeals ? byDiff.easy / totalDeals : 0;
        const avgConfOverall = totalConf / n;

        // Recent games mapped
        const dailyDealId = dailyChalRes.data?.deal_id;
        const mappedGames = recentGames.map((g: any) => ({
          gameId: g.id, userId: g.user_id, gameMode: g.game_mode,
          result: g.won ? "win" : "loss", actualMoves: g.moves,
          actualTimeSeconds: g.time_seconds, hintsUsed: g.hints_used,
          performanceModifier: g.performance_modifier, baseDelta: g.base_delta,
          finalDelta: g.final_delta, ratingBefore: g.rating_before,
          ratingAfter: g.rating_after, dealDDS: g.difficulty_score || 0,
          isDailyChallenge: g.deal_uuid === dailyDealId, completedAt: g.played_at,
        }));

        // === SCORING INTEGRITY ===
        let gamesWithZeroDDS = 0, gamesWithDefaultModifier = 0, gamesWithZeroDeltaOnWin = 0;
        let ratingMismatchCount = 0, duplicateGameCount = 0;
        const brokenGameIds: string[] = [];
        const totalWins = allGames.filter((g: any) => g.won).length;
        const totalGamesCount = allGames.length;

        // Dedup detection: group by user_id + deal_uuid + won
        const dedupMap = new Map<string, any[]>();

        for (const g of allGames) {
          const dds = g.difficulty_score || 0;
          if (dds === 0) { gamesWithZeroDDS++; brokenGameIds.push(g.id); }
          if (g.won && g.performance_modifier === 1.0 && g.difficulty_score > 0) {
            // Only flag if we'd expect a non-1.0 modifier (has deal data)
            gamesWithDefaultModifier++;
          }
          if (g.won && g.final_delta === 0) { gamesWithZeroDeltaOnWin++; brokenGameIds.push(g.id); }
          if (g.rating_after - g.rating_before !== g.final_delta && g.final_delta != null) {
            ratingMismatchCount++;
            brokenGameIds.push(g.id);
          }

          // Dedup check
          if (g.deal_uuid) {
            const key = `${g.user_id}|${g.deal_uuid}|${g.won}|${g.moves}`;
            if (!dedupMap.has(key)) dedupMap.set(key, []);
            dedupMap.get(key)!.push(g);
          }
        }

        for (const [, games] of dedupMap) {
          if (games.length > 1) duplicateGameCount += games.length - 1;
        }

        const gamesWithValidDDS = totalGamesCount - gamesWithZeroDDS;
        const gamesWithNonDefaultMod = totalWins - gamesWithDefaultModifier;
        const duplicateRate = totalGamesCount > 0 ? duplicateGameCount / totalGamesCount : 0;
        const ratingValidityScore = totalGamesCount > 0
          ? +((gamesWithValidDDS / totalGamesCount) * (totalWins > 0 ? gamesWithNonDefaultMod / totalWins : 1) * (1 - duplicateRate)).toFixed(3)
          : 1.0;

        // === DEAL GENERATION HEALTH ===
        const diffDistActual = {
          easy: totalDeals ? `${(byDiff.easy / totalDeals * 100).toFixed(1)}%` : "0%",
          medium: totalDeals ? `${(byDiff.medium / totalDeals * 100).toFixed(1)}%` : "0%",
          hard: totalDeals ? `${(byDiff.hard / totalDeals * 100).toFixed(1)}%` : "0%",
          expert: totalDeals ? `${(byDiff.expert / totalDeals * 100).toFixed(1)}%` : "0%",
        };
        const distHealthy = byDiff.easy >= totalDeals * 0.1 && byDiff.medium >= totalDeals * 0.15;

        // === PLAYER COHORTS ===
        const now = new Date();
        let day1Ret = 0, day7Ret = 0, day1Total = 0, day7Total = 0;
        const dropOff: Record<string, number> = { stoppedAt1: 0, stoppedAt2: 0, stoppedAt3: 0, stoppedAt4to10: 0, stoppedAt10plus: 0 };

        for (const p of profiles) {
          const joinedDaysAgo = (now.getTime() - new Date(p.created_at).getTime()) / 86400000;
          if (joinedDaysAgo >= 1) {
            day1Total++;
            if (p.games_played >= 2) day1Ret++;
          }
          if (joinedDaysAgo >= 7) {
            day7Total++;
            if (p.games_played >= 5) day7Ret++;
          }
          // Drop-off analysis
          if (p.games_played === 1) dropOff.stoppedAt1++;
          else if (p.games_played === 2) dropOff.stoppedAt2++;
          else if (p.games_played === 3) dropOff.stoppedAt3++;
          else if (p.games_played >= 4 && p.games_played <= 10) dropOff.stoppedAt4to10++;
          else if (p.games_played > 10) dropOff.stoppedAt10plus++;
        }

        // Player trends (last 7 days) — for active players only
        const activePlayers = profiles.filter((p: any) => p.games_played > 0).slice(0, 20);
        const playerTrends = [];
        for (const p of activePlayers) {
          const userGames = allGames.filter((g: any) => g.user_id === p.id);
          const last7: number[] = [0, 0, 0, 0, 0, 0, 0];
          for (const g of userGames) {
            const daysAgo = Math.floor((now.getTime() - new Date(g.played_at).getTime()) / 86400000);
            if (daysAgo >= 0 && daysAgo < 7) last7[6 - daysAgo]++;
          }
          const firstHalf = last7.slice(0, 3).reduce((a, b) => a + b, 0);
          const secondHalf = last7.slice(4).reduce((a, b) => a + b, 0);
          const total = last7.reduce((a, b) => a + b, 0);
          let trend: string;
          if (total === 0) trend = "inactive";
          else if (secondHalf > firstHalf * 1.5) trend = "increasing";
          else if (firstHalf > secondHalf * 1.5) trend = "decreasing";
          else trend = "stable";

          playerTrends.push({
            userId: p.id, displayName: p.display_name,
            gamesPerDayLast7Days: last7, trend,
          });
        }

        // Avg games per session / session length (approximate: games per day as proxy)
        const totalGamesAll = profiles.reduce((s: number, p: any) => s + p.games_played, 0);
        const avgGamesPerSession = profiles.length > 0 ? +(totalGamesAll / Math.max(profiles.length, 1)).toFixed(1) : 0;

        // === SCORING DISTRIBUTION ===
        const pms = allGames.map((g: any) => g.performance_modifier).filter((v: any) => v != null) as number[];
        const deltas = allGames.map((g: any) => g.final_delta).filter((v: any) => v != null) as number[];
        pms.sort((a, b) => a - b);
        deltas.sort((a, b) => a - b);
        const median = (arr: number[]) => arr.length === 0 ? 0 : arr.length % 2 === 0 ? (arr[arr.length/2-1] + arr[arr.length/2]) / 2 : arr[Math.floor(arr.length/2)];
        const mean = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

        const pmDist: Record<string, number> = { "0.5-0.7": 0, "0.7-0.9": 0, "0.9-1.1": 0, "1.1-1.3": 0, "1.3-1.5": 0 };
        for (const v of pms) {
          if (v < 0.7) pmDist["0.5-0.7"]++;
          else if (v < 0.9) pmDist["0.7-0.9"]++;
          else if (v < 1.1) pmDist["0.9-1.1"]++;
          else if (v < 1.3) pmDist["1.1-1.3"]++;
          else pmDist["1.3-1.5"]++;
        }

        const eloDist: Record<string, number> = { negative: 0, zero: 0, "1-5": 0, "6-15": 0, "16-30": 0, "30+": 0 };
        let nullOrZero = 0, winFloor = 0, lossCeiling = 0;
        for (const v of deltas) {
          if (v == null || v === 0) { nullOrZero++; eloDist.zero++; }
          else if (v < 0) { eloDist.negative++; if (v >= -3) lossCeiling++; }
          else if (v <= 5) { eloDist["1-5"]++; if (v <= 2) winFloor++; }
          else if (v <= 15) eloDist["6-15"]++;
          else if (v <= 30) eloDist["16-30"]++;
          else eloDist["30+"]++;
        }

        const byDiffGames: Record<string, { wins: number; total: number; moves: number; time: number }> = {};
        for (const g of allGames) {
          const d = (g.difficulty || "medium").toLowerCase();
          if (!byDiffGames[d]) byDiffGames[d] = { wins: 0, total: 0, moves: 0, time: 0 };
          byDiffGames[d].total++;
          if (g.won) byDiffGames[d].wins++;
          byDiffGames[d].moves += g.moves || 0;
          byDiffGames[d].time += g.time_seconds || 0;
        }
        const wrByDiff: Record<string, number> = {};
        const avgMovesByDiff: Record<string, number> = {};
        const avgTimeByDiff: Record<string, number> = {};
        for (const [k, v] of Object.entries(byDiffGames)) {
          wrByDiff[k] = v.total > 0 ? +(v.wins / v.total).toFixed(3) : 0;
          avgMovesByDiff[k] = v.total > 0 ? +(v.moves / v.total).toFixed(1) : 0;
          avgTimeByDiff[k] = v.total > 0 ? +(v.time / v.total).toFixed(1) : 0;
        }

        // Streaks
        const activeStreaks = profiles.filter((p: any) => p.current_streak >= 2);
        const streakDist: Record<string, number> = { "2-6": 0, "7-13": 0, "14-29": 0, "30+": 0 };
        for (const p of activeStreaks) {
          const s = p.current_streak;
          if (s <= 6) streakDist["2-6"]++;
          else if (s <= 13) streakDist["7-13"]++;
          else if (s <= 29) streakDist["14-29"]++;
          else streakDist["30+"]++;
        }
        const milestones = [3, 7, 14, 30, 50, 100];
        const milestonesReached: Record<number, number> = {};
        for (const m of milestones) {
          milestonesReached[m] = profiles.filter((p: any) => p.best_streak >= m).length;
        }
        const freezesThisWeek = (streakHistRes.data || []).filter((s: any) => s.condition_met === "freeze").length;
        const atRisk = profiles.filter((p: any) => p.current_streak >= 3 && p.last_streak_date !== today).length;

        // === PER-MODE BREAKDOWN ===
        const gameModes = ['klondike', 'freecell', 'realm'];
        const gamesByMode: Record<string, any> = {};
        for (const mode of gameModes) {
          const modeGames = allGames.filter((g: any) => g.game_mode === mode);
          const modeWins = modeGames.filter((g: any) => g.won);
          const totalTime = modeGames.reduce((s: number, g: any) => s + (g.time_seconds || 0), 0);
          const totalMoves = modeGames.reduce((s: number, g: any) => s + (g.moves || 0), 0);
          const totalDDS = modeGames.reduce((s: number, g: any) => s + (g.difficulty_score || 0), 0);
          const totalPM = modeGames.reduce((s: number, g: any) => s + (g.performance_modifier || 0), 0);
          gamesByMode[mode] = {
            gamesPlayed: modeGames.length,
            wins: modeWins.length,
            winRate: modeGames.length > 0 ? +(modeWins.length / modeGames.length).toFixed(3) : 0,
            avgDDS: modeGames.length > 0 ? +(totalDDS / modeGames.length).toFixed(1) : 0,
            avgPerformanceModifier: modeGames.length > 0 ? +(totalPM / modeGames.length).toFixed(3) : 0,
            avgActualTime: modeGames.length > 0 ? +(totalTime / modeGames.length).toFixed(1) : 0,
            avgActualMoves: modeGames.length > 0 ? +(totalMoves / modeGames.length).toFixed(1) : 0,
          };
        }

        // === REALM-SPECIFIC METRICS ===
        const realmGames = allGames.filter((g: any) => g.game_mode === 'realm');
        const realmDealUuids = realmGames.map((g: any) => g.deal_uuid).filter(Boolean);
        const realmDeals = allDeals.filter((d: any) => d.game_mode === 'realm');
        const realmDealMap: Record<string, any> = {};
        for (const d of realmDeals) realmDealMap[d.id] = d;

        // Derive grid size from seed pattern in deals (seed encodes grid size for realm)
        // DDS bands map to grid sizes: Easy=4-5, Medium=6, Hard=7-8, Expert=9-10
        const realmDiffDist: Record<string, number> = { easy: 0, medium: 0, hard: 0, expert: 0 };
        const realmTimeByDiff: Record<string, { sum: number; count: number }> = { easy: { sum: 0, count: 0 }, medium: { sum: 0, count: 0 }, hard: { sum: 0, count: 0 }, expert: { sum: 0, count: 0 } };
        const realmMovesByDiff: Record<string, { sum: number; count: number }> = { easy: { sum: 0, count: 0 }, medium: { sum: 0, count: 0 }, hard: { sum: 0, count: 0 }, expert: { sum: 0, count: 0 } };

        for (const g of realmGames) {
          const diff = (g.difficulty || 'medium').toLowerCase();
          realmDiffDist[diff] = (realmDiffDist[diff] || 0) + 1;
          if (realmTimeByDiff[diff]) { realmTimeByDiff[diff].sum += g.time_seconds || 0; realmTimeByDiff[diff].count++; }
          if (realmMovesByDiff[diff]) { realmMovesByDiff[diff].sum += g.moves || 0; realmMovesByDiff[diff].count++; }
        }

        const avgSolveTimeByDifficulty: Record<string, number> = {};
        const avgMovesByDifficultyRealm: Record<string, number> = {};
        for (const d of Object.keys(realmTimeByDiff)) {
          avgSolveTimeByDifficulty[d] = realmTimeByDiff[d].count > 0 ? +(realmTimeByDiff[d].sum / realmTimeByDiff[d].count).toFixed(1) : 0;
          avgMovesByDifficultyRealm[d] = realmMovesByDiff[d].count > 0 ? +(realmMovesByDiff[d].sum / realmMovesByDiff[d].count).toFixed(1) : 0;
        }

        const realmMetrics = {
          totalRealmGamesPlayed: realmGames.length,
          difficultyDistributionPlayed: realmDiffDist,
          avgSolveTimeByDifficulty,
          avgMovesByDifficulty: avgMovesByDifficultyRealm,
        };

        // === POOL CONSUMPTION — by confidence band ===
        const playedDealIds = new Set(userPlayedDeals.map((upd: any) => upd.deal_id));
        const playedByUser: Record<string, Set<string>> = {};
        for (const upd of userPlayedDeals) {
          if (!playedByUser[upd.deal_id]) playedByUser[upd.deal_id] = new Set();
          playedByUser[upd.deal_id].add(upd.user_id);
        }

        const diffBands = [
          { label: 'Easy', min: 0, max: 35 },
          { label: 'Medium', min: 26, max: 65 },
          { label: 'Hard', min: 50, max: 80 },
          { label: 'Expert', min: 65, max: 100 },
        ];
        const poolConsumption: Array<any> = [];
        for (const mode of gameModes) {
          for (const band of diffBands) {
            const modeDeals = allDeals.filter((d: any) => d.game_mode === mode && d.dds_blended >= band.min && d.dds_blended <= band.max);
            const unplayedByAny = modeDeals.filter((d: any) => d.pool_attempts === 0);
            const playedByAtLeast1 = modeDeals.filter((d: any) => playedByUser[d.id]?.size > 0);
            const avgAttempts = modeDeals.length > 0 ? +(modeDeals.reduce((s: number, d: any) => s + d.pool_attempts, 0) / modeDeals.length).toFixed(1) : 0;
            // Concentration set: deals with lowest pool_attempts, capped at 150
            const sorted = [...modeDeals].sort((a: any, b: any) => a.pool_attempts - b.pool_attempts);
            const concentrationSet = sorted.slice(0, 150);
            const confBand = (conf: number) => conf > 0.85 ? 'High' : conf >= 0.7 ? 'Medium' : 'Low';
            poolConsumption.push({
              mode,
              difficulty: band.label,
              confidenceBand: modeDeals.length > 0 ? confBand(modeDeals.reduce((s: number, d: any) => s + d.confidence, 0) / modeDeals.length) : 'Low',
              totalDeals: modeDeals.length,
              unplayedByAnyUser: unplayedByAny.length,
              playedByAtLeastOneUser: playedByAtLeast1.length,
              avgPoolAttempts: avgAttempts,
              dealsInConcentrationSet: concentrationSet.length,
              status: unplayedByAny.length > 20 ? 'green' : unplayedByAny.length >= 10 ? 'amber' : 'red',
            });
          }
        }

        // === POOL DEPTH ===
        const poolDepth: Array<any> = [];
        for (const mode of gameModes) {
          for (const band of diffBands) {
            const modeDeals = allDeals.filter((d: any) => d.game_mode === mode && d.dds_blended >= band.min && d.dds_blended <= band.max);
            const unplayedByAny = modeDeals.filter((d: any) => d.pool_attempts === 0);
            const avgAttempts = modeDeals.length > 0 ? +(modeDeals.reduce((s: number, d: any) => s + d.pool_attempts, 0) / modeDeals.length).toFixed(1) : 0;
            const sorted = [...modeDeals].sort((a: any, b: any) => a.pool_attempts - b.pool_attempts);
            poolDepth.push({
              gameMode: mode,
              difficulty: band.label,
              totalDeals: modeDeals.length,
              unplayedByAnyUser: unplayedByAny.length,
              avgPoolAttempts: avgAttempts,
              dealsInConcentrationSet: Math.min(sorted.length, 150),
              status: unplayedByAny.length > 20 ? 'green' : unplayedByAny.length >= 10 ? 'amber' : 'red',
            });
          }
        }

        // === SERVING ELIGIBILITY ===
        const servingEligibility: Array<any> = [];
        const playerStages = [
          { label: 'new (0 games)', gamesPlayed: 0 },
          { label: 'early (10 games)', gamesPlayed: 10 },
          { label: 'mid (50 games)', gamesPlayed: 50 },
          { label: 'established (200 games)', gamesPlayed: 200 },
        ];
        for (const mode of gameModes) {
          for (const stage of playerStages) {
            let eligibleCount = 0;
            const gp = stage.gamesPlayed;
            const modeDeals = allDeals.filter((d: any) => d.game_mode === mode);
            for (const d of modeDeals) {
              const dds = d.dds_blended;
              const conf = d.confidence;
              if (gp < 3) {
                if (dds <= 25 && conf >= 0.85) eligibleCount++;
              } else if (gp <= 20) {
                if (dds <= 55 && conf >= 0.75) eligibleCount++;
              } else {
                eligibleCount++;
              }
            }
            const cap = gp < 3 ? 15 : gp <= 20 ? 50 : gp <= 100 ? 150 : eligibleCount;
            servingEligibility.push({
              gameMode: mode,
              playerStage: stage.label,
              eligibleDeals: eligibleCount,
              concentrationSetSize: Math.min(eligibleCount, cap),
            });
          }
        }

        // === GHOST GAME DETECTION ===
        const ghostGames = allGames.filter((g: any) => !g.won && (g.moves || 0) < 3);
        const ghostGameIds = ghostGames.map((g: any) => g.id);

        // === STREAK DIAGNOSTIC — per user ===
        const streakHistoryAll = streakHistRes.data || [];
        const streakHistByUser: Record<string, number> = {};
        for (const s of streakHistoryAll) {
          streakHistByUser[s.user_id] = (streakHistByUser[s.user_id] || 0) + 1;
        }
        const perUserStreaks = profiles
          .filter((p: any) => p.current_streak > 0 || (streakHistByUser[p.id] || 0) > 0)
          .map((p: any) => ({
            userId: p.id,
            displayName: p.display_name,
            currentStreak: p.current_streak,
            streakHistoryRowCount: streakHistByUser[p.id] || 0,
            mismatch: p.current_streak > 0 && (streakHistByUser[p.id] || 0) === 0,
          }));

        // Daily challenge today
        const dc = dailyChalRes.data;
        const dcCompletions = completions;
        const dcWins = dcCompletions.filter((c: any) => c.result === "won").length;
        const dailyChallengeToday = {
          exists: !!dc, dealId: dc?.deal_id || null, gameMode: dc?.game_mode || null,
          targetDDSMin: dc?.target_dds_min || 0, targetDDSMax: dc?.target_dds_max || 0,
          attemptsToday: dcCompletions.length, completionsToday: dcCompletions.length,
          winRateToday: dcCompletions.length > 0 ? +(dcWins / dcCompletions.length).toFixed(3) : 0,
          leaderboardTop5: dcCompletions.slice(0, 5).map((c: any) => ({
            displayName: c.profiles?.display_name || "Unknown", result: c.result,
            moves: c.actual_moves, time: c.actual_time, delta: c.final_delta,
          })),
        };

        const tableCounts: Record<string, number> = {};
        for (const [t, c] of tableCountsRes) tableCounts[t] = c;

        // Games in last 24 hours with zero DDS
        const recentZeroDDS = allGames.filter((g: any) => (g.difficulty_score || 0) === 0 && new Date(g.played_at).getTime() > Date.now() - 86400000).length;

        // Inactive users (no game in 7+ days)
        const inactiveUsers = profiles.filter((p: any) => {
          if (p.games_played === 0) return false;
          const lastActive = new Date(p.updated_at).getTime();
          return (now.getTime() - lastActive) > 7 * 86400000;
        }).length;

        const starterPoolSize = allDeals.filter((d: any) => d.confidence >= 0.85).length;

        // === ALERTS ===
        const alerts: Array<{ severity: string; code: string; message: string; affectedCount: number; detectedAt: string }> = [];
        const ts = now.toISOString();

        if (recentZeroDDS > 0) alerts.push({ severity: "critical", code: "ZERO_DDS_GAMES", message: `${recentZeroDDS} games in last 24h have dealDDS = 0`, affectedCount: recentZeroDDS, detectedAt: ts });
        if (cronRes !== null && (cronRes as any[]).length === 0) alerts.push({ severity: "critical", code: "NO_CRON_JOBS", message: "No cron jobs registered in pg_cron", affectedCount: 0, detectedAt: ts });
        if (ratingValidityScore < 0.8) alerts.push({ severity: "critical", code: "LOW_VALIDITY_SCORE", message: `Rating validity score is ${ratingValidityScore} (threshold: 0.8)`, affectedCount: totalGamesCount, detectedAt: ts });
        if (!dc) alerts.push({ severity: "critical", code: "NO_DAILY_CHALLENGE", message: "No daily challenge seeded for today", affectedCount: 0, detectedAt: ts });

        if (easyPct < 0.15) alerts.push({ severity: "warning", code: "LOW_EASY_DEALS", message: `Easy deals are ${(easyPct * 100).toFixed(1)}% of pool (target: 15%+)`, affectedCount: byDiff.easy, detectedAt: ts });
        if (duplicateGameCount > 0) alerts.push({ severity: "warning", code: "DUPLICATE_GAMES", message: `${duplicateGameCount} duplicate game records detected`, affectedCount: duplicateGameCount, detectedAt: ts });
        if (avgConfOverall < 0.7) alerts.push({ severity: "warning", code: "LOW_AVG_CONFIDENCE", message: `Average deal confidence is ${avgConfOverall.toFixed(2)} (threshold: 0.7)`, affectedCount: totalDeals, detectedAt: ts });
        if (ghostGameIds.length > 0) alerts.push({ severity: "warning", code: "GHOST_GAMES", message: `${ghostGameIds.length} ghost games detected (< 3 moves, loss)`, affectedCount: ghostGameIds.length, detectedAt: ts });
        // Low pool alerts from poolConsumption
        for (const pc of poolConsumption) {
          if (pc.status === 'red' && pc.totalDeals > 0) {
            alerts.push({ severity: "critical", code: "LOW_POOL_CRITICAL", message: `${pc.mode} ${pc.difficulty} pool critical — ${pc.unplayedByAnyUser} unplayed deals remaining`, affectedCount: pc.unplayedByAnyUser, detectedAt: ts });
          } else if (pc.status === 'amber' && pc.totalDeals > 0) {
            alerts.push({ severity: "warning", code: "LOW_POOL", message: `${pc.mode} ${pc.difficulty} pool low — ${pc.unplayedByAnyUser} unplayed deals remaining`, affectedCount: pc.unplayedByAnyUser, detectedAt: ts });
          }
        }

        if (inactiveUsers > 0) alerts.push({ severity: "info", code: "INACTIVE_USERS", message: `${inactiveUsers} users inactive for 7+ days`, affectedCount: inactiveUsers, detectedAt: ts });
        if (starterPoolSize < 100) alerts.push({ severity: "info", code: "LOW_HIGH_CONFIDENCE", message: `Only ${starterPoolSize} deals with confidence ≥0.85 (target: 100+)`, affectedCount: starterPoolSize, detectedAt: ts });

        const snapshot = {
          generatedAt: now.toISOString(),
          alerts,
          userCount: profiles.length,
          users,
          gamesByMode,
          realmMetrics,
          poolConsumption,
          ghostGames: { count: ghostGameIds.length, gameIds: ghostGameIds.slice(0, 50) },
          scoringIntegrity: {
            ratingValidityScore, gamesWithZeroDDS, gamesWithDefaultModifier,
            gamesWithZeroDeltaOnWin, ratingMismatchCount, duplicateGameCount,
            brokenGameIds: brokenGameIds.slice(0, 50),
          },
          dealGenerationHealth: {
            dealsWithZeroMinSolutionLength: dealsWithZeroMinMoves,
            avgSimulationCount: +(totalSimCount / n).toFixed(1),
            avgConfidenceByMode: {
              klondike: confByMode.klondike.count > 0 ? +(confByMode.klondike.sum / confByMode.klondike.count).toFixed(3) : 0,
              freecell: confByMode.freecell.count > 0 ? +(confByMode.freecell.sum / confByMode.freecell.count).toFixed(3) : 0,
            },
            difficultyDistributionTarget: { easy: "25%", medium: "30%", hard: "30%", expert: "15%" },
            difficultyDistributionActual: diffDistActual,
            distributionHealthy: distHealthy,
          },
          playerCohorts: {
            day1Retention: day1Total > 0 ? +(day1Ret / day1Total).toFixed(3) : 0,
            day7Retention: day7Total > 0 ? +(day7Ret / day7Total).toFixed(3) : 0,
            avgGamesPerSession: avgGamesPerSession,
            avgSessionLengthSeconds: 0,
            dropOffByGameNumber: dropOff,
            playerTrends,
          },
          dealPool: {
            total: totalDeals, byTier, byMode, byDifficulty: byDiff,
            avgConfidence: +(totalConf / n).toFixed(3),
            ddsBlendStage: { solverOnly, blending, empiricalOnly },
            avgDDSInitial: +(totalInitial / n).toFixed(1),
            avgDDSBlended: +(totalBlended / n).toFixed(1),
            avgDDSDrift: +(totalDrift / n).toFixed(2),
          },
          recentGames: mappedGames,
          scoringDistribution: {
            performanceModifiers: {
              min: pms.length ? pms[0] : 0, max: pms.length ? pms[pms.length - 1] : 0,
              mean: +mean(pms).toFixed(3), median: +median(pms).toFixed(3), distribution: pmDist,
            },
            eloDeltas: {
              min: deltas.length ? deltas[0] : 0, max: deltas.length ? deltas[deltas.length - 1] : 0,
              mean: +mean(deltas).toFixed(1), median: +median(deltas), distribution: eloDist,
            },
            winRateByDifficulty: wrByDiff, avgMovesPerDifficulty: avgMovesByDiff,
            avgTimePerDifficulty: avgTimeByDiff, nullOrZeroDeltaCount: nullOrZero,
            winFloorTriggeredCount: winFloor, lossCeilingTriggeredCount: lossCeiling,
          },
          streakData: {
            usersWithActiveStreak: activeStreaks.length, streakDistribution: streakDist,
            milestonesReached, freezesUsedThisWeek: freezesThisWeek, atRiskToday: atRisk,
            perUserStreaks,
          },
          systemHealth: {
            cronJobs: cronRes !== null ? (cronRes as any[]).map((j: any) => ({
              name: j.jobname || j.name, schedule: j.schedule, lastRun: j.last_run || null,
              lastRunStatus: j.last_run_status || (j.active ? "active" : "unknown"),
            })) : [{ name: "unknown", schedule: "RPC unavailable", lastRunStatus: "could not query" }],
            edgeFunctions: {
              "complete-game": { lastRun: null, status: "unknown" },
              "schedule-daily-challenge": { lastRun: null, status: "unknown" },
              "award-streak-freezes": { lastRun: null, status: "unknown" },
              "streak-risk-notifications": { lastRun: null, status: "unknown" },
            },
            dailyChallengeToday, tableRowCounts: tableCounts,
          },
        };

        return json(snapshot);
      }

      case "flag_deals": {
        const { dealIds, reservedFor } = params || {};
        if (!dealIds || !Array.isArray(dealIds) || !reservedFor) {
          return json({ error: "Missing dealIds or reservedFor" }, 400);
        }
        const { error } = await adminClient
          .from("deals")
          .update({ reserved_for: reservedFor })
          .in("id", dealIds);
        if (error) throw error;
        return json({ success: true, updated: dealIds.length });
      }

      case "list_releases": {
        const { data, error } = await adminClient
          .from("releases")
          .select("*")
          .order("released_at", { ascending: false });
        if (error) throw error;
        return json(data);
      }

      case "create_release": {
        const { version, title, notes } = params as { version: string; title: string; notes: string[] };
        if (!version || !title || !notes?.length) {
          return json({ error: "version, title, and notes are required" }, 400);
        }
        const { data, error } = await adminClient
          .from("releases")
          .insert({ version, title, notes })
          .select()
          .single();
        if (error) throw error;
        return json(data);
      }

      case "update_deal_confidence": {
        const { deal_id, confidence, simulation_count, simulation_wins, min_moves, dds_initial, dds_blended, unique_winning_paths, path_diversity_score } = params || {};
        if (!deal_id) return json({ error: "deal_id required" }, 400);
        const updateFields: any = {};
        if (confidence !== undefined) updateFields.confidence = confidence;
        if (simulation_count !== undefined) updateFields.simulation_count = simulation_count;
        if (simulation_wins !== undefined) updateFields.simulation_wins = simulation_wins;
        if (min_moves !== undefined) updateFields.min_moves = min_moves;
        if (dds_initial !== undefined) updateFields.dds_initial = dds_initial;
        if (dds_blended !== undefined) updateFields.dds_blended = dds_blended;
        if (unique_winning_paths !== undefined) updateFields.unique_winning_paths = unique_winning_paths;
        if (path_diversity_score !== undefined) updateFields.path_diversity_score = path_diversity_score;
        const { error } = await adminClient.from("deals").update(updateFields).eq("id", deal_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "seed_starter_pool": {
        // Accept pre-verified deals from the client-side solver
        const { deals } = params || {};
        if (!deals || !Array.isArray(deals) || deals.length === 0) {
          return json({ error: "No verified deals provided. Run the solver client-side first." }, 400);
        }

        // Validate each deal has required fields
        const rows = deals.map((d: any) => ({
          seed: d.seed,
          game_mode: d.game_mode,
          draw_mode: d.draw_mode || 3,
          min_moves: d.min_moves,
          dds_initial: d.dds_initial,
          dds_blended: d.dds_blended,
          simulation_count: d.simulation_count,
          simulation_wins: d.simulation_wins || 0,
          confidence: d.confidence,
          tier: d.tier || "fresh",
          is_calibration: d.is_calibration ?? true,
          reserved_for: d.reserved_for || null,
          unique_winning_paths: d.unique_winning_paths || 0,
          path_diversity_score: d.path_diversity_score || 0,
        }));

        const { data, error } = await adminClient
          .from("deals")
          .upsert(rows, { onConflict: "seed,game_mode,draw_mode", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        return json({ inserted: data?.length ?? 0, total: rows.length });
      }

      case "deals_all": {
        // Return all deal rows with fields needed for client-side filtering/histograms
        let allDeals: any[] = [];
        const batchSize = 1000;
        let pg = 0;
        while (true) {
          const { data: batch } = await adminClient
            .from("deals")
            .select("id, seed, game_mode, tier, dds_initial, dds_blended, confidence, path_diversity_score, pool_attempts, pool_wins, pool_avg_moves, pool_avg_time, simulation_count, simulation_wins, is_calibration")
            .range(pg * batchSize, (pg + 1) * batchSize - 1);
          if (!batch || batch.length === 0) break;
          allDeals = allDeals.concat(batch);
          if (batch.length < batchSize) break;
          pg++;
        }
        return json(allDeals);
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("Admin query error:", err);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
