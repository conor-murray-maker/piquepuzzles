import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listRecentGames from "./tools/list-recent-games";
import getModeStats from "./tools/get-mode-stats";
import getDailyChallenge from "./tools/get-daily-challenge";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "pique",
  title: "Pique",
  version: "0.1.0",
  instructions:
    "Tools for Pique, a puzzle app with Klondike, FreeCell and Realm modes rated by a composite 'Pique IQ'. Use get_my_profile for the player's rating and streaks, list_recent_games for their recent games, get_mode_stats for per-mode performance summaries, and get_daily_challenge for today's challenge and the player's result. All tools act as the signed-in player.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listRecentGames, getModeStats, getDailyChallenge],
});
