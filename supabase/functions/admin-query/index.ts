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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await anonClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const email = claimsData.claims.email as string;
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
        const { data: allDeals } = await adminClient.from("deals").select("tier, game_mode, dds_blended, confidence, pool_attempts, is_calibration");
        const deals = allDeals || [];
        const byTier: Record<string, number> = {};
        const byMode: Record<string, number> = {};
        const byBand: Record<string, number> = { Easy: 0, Medium: 0, Hard: 0, Expert: 0 };
        let totalConf = 0;
        let solverOnly = 0, blending = 0, empirical = 0;

        for (const d of deals) {
          byTier[d.tier] = (byTier[d.tier] || 0) + 1;
          byMode[d.game_mode] = (byMode[d.game_mode] || 0) + 1;
          totalConf += d.confidence;
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
        const { count } = await adminClient.from("deals").select("id", { count: "exact", head: true });
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
          "deal_queue",
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
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const result = await resp.json();
        return json(result);
      }

      case "trigger_refill": {
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/refill-deal-queue`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const result = await resp.json();
        return json(result);
      }

      case "diagnostic_snapshot": {
        const today = new Date().toISOString().split("T")[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

        // Fetch all data in parallel
        const [
          profilesRes, allDealsRes, recentGamesRes, allGamesRes,
          streakHistRes, dailyChalRes, dailyCompRes, tableCountsRes,
          dealQueueRes,
        ] = await Promise.all([
          adminClient.from("profiles").select("*"),
          adminClient.from("deals").select("*"),
          adminClient.from("game_history").select("*").order("played_at", { ascending: false }).limit(200),
          adminClient.from("game_history").select("won, difficulty, performance_modifier, final_delta, base_delta, time_seconds, moves, game_mode, deal_uuid, played_at").limit(1000),
          adminClient.from("streak_history").select("*").gte("date", weekAgo),
          adminClient.from("daily_challenges").select("*, deals(*)").eq("date", today).maybeSingle(),
          adminClient.from("daily_challenge_completions").select("*, profiles(display_name)").eq("date", today).order("actual_time", { ascending: true }),
          Promise.all(
            ["deals","game_history","profiles","deal_queue","user_played_deals","streak_history","daily_challenges"].map(async t => {
              const { count } = await adminClient.from(t).select("id", { count: "exact", head: true });
              return [t, count || 0] as [string, number];
            })
          ),
          adminClient.from("deal_queue").select("user_id, game_mode, served_at"),
        ]);

        const profiles = profilesRes.data || [];
        const allDeals = allDealsRes.data || [];
        const recentGames = recentGamesRes.data || [];
        const allGames = allGamesRes.data || [];
        const completions = dailyCompRes.data || [];
        const dealQueue = dealQueueRes.data || [];

        // Users
        const users = profiles.map((p: any) => ({
          userId: p.id,
          displayName: p.display_name,
          puzzleIQ: p.rating,
          tier: p.subscription_tier || "free",
          gamesPlayed: p.games_played,
          wins: p.games_won,
          winRate: p.games_played > 0 ? +(p.games_won / p.games_played).toFixed(3) : 0,
          currentStreak: p.current_streak,
          bestStreak: p.best_streak,
          subscriptionStatus: p.subscription_status,
          joinedAt: p.created_at,
          lastActiveAt: p.updated_at,
        }));

        // Deal pool
        const byTier: Record<string, number> = { starter: 0, organic: 0, daily_challenge: 0 };
        const byMode: Record<string, number> = { klondike: 0, freecell: 0 };
        const byDiff: Record<string, number> = { easy: 0, medium: 0, hard: 0, expert: 0 };
        let totalConf = 0, totalInitial = 0, totalBlended = 0, totalDrift = 0;
        let solverOnly = 0, blending = 0, empiricalOnly = 0;
        for (const d of allDeals) {
          byTier[d.tier] = (byTier[d.tier] || 0) + 1;
          byMode[d.game_mode] = (byMode[d.game_mode] || 0) + 1;
          totalConf += d.confidence;
          totalInitial += d.dds_initial;
          totalBlended += d.dds_blended;
          totalDrift += Math.abs(d.dds_blended - d.dds_initial);
          if (d.pool_attempts < 30) solverOnly++;
          else if (d.pool_attempts < 100) blending++;
          else empiricalOnly++;
          const dds = d.dds_blended;
          if (dds < 35) byDiff.easy++;
          else if (dds < 58) byDiff.medium++;
          else if (dds < 78) byDiff.hard++;
          else byDiff.expert++;
        }
        const n = allDeals.length || 1;

        // Recent games mapped
        const dailyDealId = dailyChalRes.data?.deal_id;
        const mappedGames = recentGames.map((g: any) => ({
          gameId: g.id,
          userId: g.user_id,
          gameMode: g.game_mode,
          result: g.won ? "win" : "loss",
          actualMoves: g.moves,
          actualTimeSeconds: g.time_seconds,
          hintsUsed: g.hints_used,
          performanceModifier: g.performance_modifier,
          baseDelta: g.base_delta,
          finalDelta: g.final_delta,
          ratingBefore: g.rating_before,
          ratingAfter: g.rating_after,
          dealDDS: 0,
          isDailyChallenge: g.deal_uuid === dailyDealId,
          completedAt: g.played_at,
        }));

        // Scoring distribution
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
        const avgMoves: Record<string, number> = {};
        const avgTime: Record<string, number> = {};
        for (const [k, v] of Object.entries(byDiffGames)) {
          wrByDiff[k] = v.total > 0 ? +(v.wins / v.total).toFixed(3) : 0;
          avgMoves[k] = v.total > 0 ? +(v.moves / v.total).toFixed(1) : 0;
          avgTime[k] = v.total > 0 ? +(v.time / v.total).toFixed(1) : 0;
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

        // Deal queue health
        const queueMap: Record<string, Record<string, number>> = {};
        for (const q of dealQueue) {
          if (q.served_at) continue;
          const key = `${q.user_id}|${q.game_mode}`;
          if (!queueMap[key]) queueMap[key] = { count: 0 };
          queueMap[key].count++;
        }
        const dealQueueHealth = Object.entries(queueMap).map(([key, val]) => {
          const [userId, gameMode] = key.split("|");
          return { userId, gameMode, queueDepth: val.count, flagged: val.count <= 1 };
        });

        // Daily challenge today
        const dc = dailyChalRes.data;
        const dcCompletions = completions;
        const dcWins = dcCompletions.filter((c: any) => c.result === "won").length;
        const dailyChallengeToday = {
          exists: !!dc,
          dealId: dc?.deal_id || null,
          gameMode: dc?.game_mode || null,
          targetDDSMin: dc?.target_dds_min || 0,
          targetDDSMax: dc?.target_dds_max || 0,
          attemptsToday: dcCompletions.length,
          completionsToday: dcCompletions.length,
          winRateToday: dcCompletions.length > 0 ? +(dcWins / dcCompletions.length).toFixed(3) : 0,
          leaderboardTop5: dcCompletions.slice(0, 5).map((c: any) => ({
            displayName: c.profiles?.display_name || "Unknown",
            result: c.result,
            moves: c.actual_moves,
            time: c.actual_time,
            delta: c.final_delta,
          })),
        };

        const tableCounts: Record<string, number> = {};
        for (const [t, c] of tableCountsRes) tableCounts[t] = c;

        const snapshot = {
          generatedAt: new Date().toISOString(),
          userCount: profiles.length,
          users,
          dealPool: {
            total: allDeals.length,
            byTier, byMode, byDifficulty: byDiff,
            avgConfidence: +(totalConf / n).toFixed(3),
            ddsBlendStage: { solverOnly, blending, empiricalOnly },
            avgDDSInitial: +(totalInitial / n).toFixed(1),
            avgDDSBlended: +(totalBlended / n).toFixed(1),
            avgDDSDrift: +(totalDrift / n).toFixed(2),
          },
          recentGames: mappedGames,
          scoringDistribution: {
            performanceModifiers: {
              min: pms.length ? pms[0] : 0,
              max: pms.length ? pms[pms.length - 1] : 0,
              mean: +mean(pms).toFixed(3),
              median: +median(pms).toFixed(3),
              distribution: pmDist,
            },
            eloDeltas: {
              min: deltas.length ? deltas[0] : 0,
              max: deltas.length ? deltas[deltas.length - 1] : 0,
              mean: +mean(deltas).toFixed(1),
              median: +median(deltas),
              distribution: eloDist,
            },
            winRateByDifficulty: wrByDiff,
            avgMovesPerDifficulty: avgMoves,
            avgTimePerDifficulty: avgTime,
            nullOrZeroDeltaCount: nullOrZero,
            winFloorTriggeredCount: winFloor,
            lossCeilingTriggeredCount: lossCeiling,
          },
          streakData: {
            usersWithActiveStreak: activeStreaks.length,
            streakDistribution: streakDist,
            milestonesReached,
            freezesUsedThisWeek: freezesThisWeek,
            atRiskToday: atRisk,
          },
          systemHealth: {
            cronJobs: [],
            edgeFunctions: {
              "complete-game": { lastRun: null, status: "unknown" },
              "refill-deal-queue": { lastRun: null, status: "unknown" },
              "schedule-daily-challenge": { lastRun: null, status: "unknown" },
              "award-streak-freezes": { lastRun: null, status: "unknown" },
              "streak-risk-notifications": { lastRun: null, status: "unknown" },
            },
            dealQueueHealth,
            dailyChallengeToday,
            tableRowCounts: tableCounts,
          },
        };

        return json(snapshot);
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
