-- Delete old placeholder releases
DELETE FROM releases;

-- Re-seed with accurate entries from actual development history
INSERT INTO releases (version, title, notes, released_at) VALUES
(
  'v0.1.0',
  'Foundation',
  ARRAY[
    'Klondike and FreeCell game engines fully playable',
    'Puzzle IQ ELO rating system with performance modifiers',
    'Deal pool system with DDS difficulty scoring across three tiers',
    'Supabase auth with auto-profile creation',
    'Stripe subscription integration with checkout and customer portal',
    'Daily challenges with weekly progressive difficulty curve',
    'Streak tracking with freeze system and milestone modals',
    'Admin dashboard with overview, users, deals, games, streaks, and system tabs'
  ],
  '2026-03-01T00:00:00Z'
),
(
  'v0.2.0',
  'Scoring & Post-Game',
  ARRAY[
    'Score breakdown card on win screen showing base delta, time bonus, moves bonus',
    'Performance modifier applied to ELO calculations',
    'Deal DDS resolution chain: solver initial → empirical blending → confidence gating',
    'Win probability bar component',
    'Tier progress bar with animated transitions',
    'Challenge a Friend flow with share link generation'
  ],
  '2026-03-10T00:00:00Z'
),
(
  'v0.3.0',
  'Backend Hardening',
  ARRAY[
    'Replaced auth.getClaims() with auth.getUser() across all edge functions',
    'Fixed deal_uuid missing bug — deals now read from pre-populated deal_queue instead of client-side upsert',
    'Added diagnostic logging across useGamePersistence, PostGameScreen, and complete-game edge function',
    'Registered pg_cron jobs for daily challenge scheduling, streak resets, and deal queue refills',
    'Admin System tab: health alerts, diagnostic snapshot export, cron job monitoring',
    'Created get_cron_jobs database function to fix NO_CRON_JOBS false alert'
  ],
  '2026-03-24T12:00:00Z'
),
(
  'v0.3.1',
  'UI Polish & Scroll Fixes',
  ARRAY[
    'Fixed scroll and bottom padding across all screens to account for 56px BottomNav overlay',
    'Standardized padding formula: calc(56px + safe-area-inset-bottom + 24px)',
    'PostGameScreen: bottom content including Challenge a Friend button now fully reachable',
    'Admin dashboard: last module no longer flush against nav bar when fully scrolled',
    'Play page: content scrollable on smaller viewports without clipping'
  ],
  '2026-03-24T16:00:00Z'
),
(
  'v0.3.2',
  'Security Hardening',
  ARRAY[
    'recalibrate-dds: added service-role key authentication — unauthenticated calls now return 401',
    'refill-deal-queue: DDS now computed server-side from minMoves, ignoring client-supplied ddsInitial',
    'Admin page: removed hardcoded admin email from client bundle, replaced with server-side ping check',
    'daily_challenge_completions: RLS tightened from USING(true) to owner-only',
    'Created get_daily_leaderboard and count_daily_attempts security-definer RPCs for safe cross-user reads',
    'Score breakdown card: time and moves lines now always show point values even when avg data unavailable'
  ],
  '2026-03-24T20:00:00Z'
),
(
  'v0.4.0',
  'Releases Changelog',
  ARRAY[
    'Added releases table for tracking version history',
    'New Releases tab in admin dashboard with reverse-chronological changelog',
    'Admin form to create new release entries with version, title, and multi-line notes',
    'Seeded changelog with accurate development history from project inception'
  ],
  '2026-03-24T23:30:00Z'
);