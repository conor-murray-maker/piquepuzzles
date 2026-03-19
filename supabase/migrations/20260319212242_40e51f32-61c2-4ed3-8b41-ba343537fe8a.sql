
-- Create deals table for tracking deal metadata and pool statistics
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed integer NOT NULL,
  game_mode text NOT NULL DEFAULT 'klondike',
  draw_mode integer NOT NULL DEFAULT 3,
  min_moves integer NOT NULL DEFAULT 0,
  dds_initial real NOT NULL DEFAULT 50,
  dds_empirical real,
  dds_blended real NOT NULL DEFAULT 50,
  pool_attempts integer NOT NULL DEFAULT 0,
  pool_wins integer NOT NULL DEFAULT 0,
  pool_avg_moves real NOT NULL DEFAULT 0,
  pool_avg_time real NOT NULL DEFAULT 0,
  pool_abandons real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seed, game_mode, draw_mode)
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read deals" ON public.deals FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can insert deals" ON public.deals FOR INSERT TO authenticated WITH CHECK (true);

-- Add scoring columns to game_history
ALTER TABLE public.game_history
  ADD COLUMN IF NOT EXISTS performance_modifier real DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS base_delta integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_delta integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deal_uuid uuid REFERENCES public.deals(id);
