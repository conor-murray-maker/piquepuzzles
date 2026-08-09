import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_recent_games",
  title: "List my recent games",
  description:
    "List the signed-in player's most recent Pique games with mode, difficulty, result, time, moves and Pique IQ change.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many games to return (1-50)."),
    game_mode: z
      .enum(["klondike", "freecell", "realm"])
      .optional()
      .describe("Optional filter for a single game mode."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, game_mode }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("game_history")
      .select(
        "played_at, game_mode, difficulty, won, time_seconds, moves, hints_used, rating_change, rating_after, is_daily_challenge",
      )
      .eq("user_id", ctx.getUserId())
      .order("played_at", { ascending: false })
      .limit(limit ?? 10);

    if (game_mode) query = query.eq("game_mode", game_mode);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { games: data ?? [] },
    };
  },
});
