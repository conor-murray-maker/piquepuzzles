import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_daily_challenge",
  title: "Get the daily challenge",
  description:
    "Get Pique's daily challenge for a given date (today by default): game mode and difficulty, plus the signed-in player's result if they have played it.",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Date in YYYY-MM-DD format. Defaults to today (UTC)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const day = date ?? new Date().toISOString().slice(0, 10);

    const { data: challenge, error } = await supabase
      .from("daily_challenges")
      .select("id, date, game_mode, difficulty")
      .eq("date", day)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!challenge) {
      return { content: [{ type: "text", text: `No daily challenge found for ${day}.` }] };
    }

    const { data: result } = await supabase
      .from("daily_challenge_results")
      .select("*")
      .eq("challenge_id", challenge.id)
      .eq("user_id", ctx.getUserId())
      .maybeSingle();

    const payload = { challenge, my_result: result ?? null };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
