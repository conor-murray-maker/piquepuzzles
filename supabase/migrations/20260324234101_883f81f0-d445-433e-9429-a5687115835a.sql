-- Create releases table
CREATE TABLE public.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  title text NOT NULL,
  notes text[] NOT NULL DEFAULT '{}',
  released_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read releases
CREATE POLICY "Authenticated can read releases"
  ON public.releases FOR SELECT
  TO authenticated
  USING (true);

-- No client-side insert/update/delete — admin writes via service role in edge function

-- Seed initial releases
INSERT INTO public.releases (version, title, notes, released_at) VALUES
(
  'v0.1.0',
  'Foundation',
  ARRAY[
    'Klondike and FreeCell fully playable',
    'Puzzle IQ ELO rating system',
    'Stripe subscriptions',
    'AdMob ads integration',
    'Supabase auth with profile creation'
  ],
  '2026-01-15T00:00:00Z'
),
(
  'v0.2.0',
  'Scoring Engine',
  ARRAY[
    'Performance modifier for score calculation',
    'Breakdown math: base delta, time bonus, moves bonus',
    'Deal DDS resolution chain',
    'Win screen score breakdown component'
  ],
  '2026-02-10T00:00:00Z'
),
(
  'v0.3.0',
  'Infrastructure Fixes',
  ARRAY[
    'Replaced getClaims with getUser across all edge functions',
    'Fixed deal_uuid missing bug preventing game completion',
    'Cron jobs registered for daily challenge scheduling',
    'Streak freezes and streak notifications'
  ],
  '2026-03-18T00:00:00Z'
),
(
  'v0.3.1',
  'UI Polish',
  ARRAY[
    'Scroll and bottom padding fixes across post game screen and admin dashboard',
    'Breakdown lines always sum to total rating change',
    'Security hardening: auth on recalibrate-dds, server-side DDS validation, admin email removed from client bundle',
    'Daily completions RLS tightened with secure leaderboard RPC'
  ],
  '2026-03-24T00:00:00Z'
);