import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_mode_stats",
  title: "Get my stats by game mode",
  description:
    "Summarise the signed-in player's Pique performance per game mode: games played, wins, win rate, average time and moves, and net Pique IQ change.",
  inputSchema: {
    since_days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Only include games played in the last N days."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ since_days }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("game_history")
      .select("game_mode, won, time_seconds, moves, rating_change")
      .eq("user_id", ctx.getUserId())
      .limit(2000);

    if (since_days) {
      const since = new Date(Date.now() - since_days * 86400000).toISOString();
      query = query.gte("played_at", since);
    }

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const byMode: Record<
      string,
      { games: number; wins: number; totalTime: number; totalMoves: number; netIQ: number }
    > = {};

    for (const row of rows) {
      const key = row.game_mode ?? "unknown";
      const acc = (byMode[key] ??= { games: 0, wins: 0, totalTime: 0, totalMoves: 0, netIQ: 0 });
      acc.games += 1;
      if (row.won) acc.wins += 1;
      acc.totalTime += row.time_seconds ?? 0;
      acc.totalMoves += row.moves ?? 0;
      acc.netIQ += row.rating_change ?? 0;
    }

    const stats = Object.entries(byMode).map(([mode, a]) => ({
      game_mode: mode,
      games: a.games,
      wins: a.wins,
      win_rate: a.games ? Math.round((a.wins / a.games) * 1000) / 10 : 0,
      avg_time_seconds: a.games ? Math.round(a.totalTime / a.games) : 0,
      avg_moves: a.games ? Math.round(a.totalMoves / a.games) : 0,
      net_iq_change: a.netIQ,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      structuredContent: { stats },
    };
  },
});
