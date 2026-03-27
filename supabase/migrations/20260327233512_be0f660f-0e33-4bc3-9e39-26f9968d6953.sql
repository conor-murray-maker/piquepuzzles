-- Part 1: game_modes table
CREATE TABLE public.game_modes (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.game_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read game_modes" ON public.game_modes FOR SELECT TO authenticated USING (true);

INSERT INTO public.game_modes (id, display_name) VALUES
  ('klondike', 'Klondike'),
  ('freecell', 'FreeCell'),
  ('realm', 'Realm');

-- Part 1: player_mode_ratings table
CREATE TABLE public.player_mode_ratings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_mode text NOT NULL REFERENCES public.game_modes(id),
  iq integer NOT NULL DEFAULT 1000,
  games_played integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_mode)
);
ALTER TABLE public.player_mode_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all mode ratings" ON public.player_mode_ratings FOR SELECT TO authenticated USING (true);

-- Part 1: performance_expectations table
CREATE TABLE public.performance_expectations (
  game_mode text NOT NULL REFERENCES public.game_modes(id),
  dds_bucket text NOT NULL,
  iq_bucket text NOT NULL,
  avg_time_seconds float NOT NULL,
  avg_moves float NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_mode, dds_bucket, iq_bucket)
);
ALTER TABLE public.performance_expectations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read performance_expectations" ON public.performance_expectations FOR SELECT TO authenticated USING (true);

-- Seed one row per user per active game mode
INSERT INTO public.player_mode_ratings (user_id, game_mode, iq, games_played)
SELECT p.id, gm.id, 1000, 0
FROM public.profiles p
CROSS JOIN public.game_modes gm
WHERE gm.is_active = true
ON CONFLICT DO NOTHING;

-- Seed hardcoded fallback values for Klondike
INSERT INTO public.performance_expectations (game_mode, dds_bucket, iq_bucket, avg_time_seconds, avg_moves) VALUES
  ('klondike', '0-25', '800-1100', 120, 95),
  ('klondike', '0-25', '1100-1300', 100, 85),
  ('klondike', '0-25', '1300-1500', 80, 75),
  ('klondike', '0-25', '1500+', 70, 65),
  ('klondike', '26-50', '800-1100', 240, 120),
  ('klondike', '26-50', '1100-1300', 200, 105),
  ('klondike', '26-50', '1300-1500', 170, 95),
  ('klondike', '26-50', '1500+', 140, 85),
  ('klondike', '51-75', '800-1100', 360, 150),
  ('klondike', '51-75', '1100-1300', 300, 135),
  ('klondike', '51-75', '1300-1500', 250, 120),
  ('klondike', '51-75', '1500+', 210, 110),
  ('klondike', '76-100', '800-1100', 480, 180),
  ('klondike', '76-100', '1100-1300', 400, 160),
  ('klondike', '76-100', '1300-1500', 340, 145),
  ('klondike', '76-100', '1500+', 280, 130),
  ('klondike', '101+', '800-1100', 540, 200),
  ('klondike', '101+', '1100-1300', 450, 180),
  ('klondike', '101+', '1300-1500', 380, 160),
  ('klondike', '101+', '1500+', 320, 145),
  ('freecell', '0-25', '800-1100', 150, 75),
  ('freecell', '0-25', '1100-1300', 120, 65),
  ('freecell', '0-25', '1300-1500', 100, 55),
  ('freecell', '0-25', '1500+', 85, 50),
  ('freecell', '26-50', '800-1100', 210, 100),
  ('freecell', '26-50', '1100-1300', 180, 85),
  ('freecell', '26-50', '1300-1500', 150, 75),
  ('freecell', '26-50', '1500+', 120, 65),
  ('freecell', '51-75', '800-1100', 300, 130),
  ('freecell', '51-75', '1100-1300', 250, 115),
  ('freecell', '51-75', '1300-1500', 210, 100),
  ('freecell', '51-75', '1500+', 175, 90),
  ('freecell', '76-100', '800-1100', 390, 160),
  ('freecell', '76-100', '1100-1300', 330, 140),
  ('freecell', '76-100', '1300-1500', 280, 125),
  ('freecell', '76-100', '1500+', 230, 110),
  ('freecell', '101+', '800-1100', 450, 180),
  ('freecell', '101+', '1100-1300', 380, 160),
  ('freecell', '101+', '1300-1500', 320, 140),
  ('freecell', '101+', '1500+', 270, 125),
  ('realm', '0-25', '800-1100', 20, 8),
  ('realm', '0-25', '1100-1300', 15, 7),
  ('realm', '0-25', '1300-1500', 12, 6),
  ('realm', '0-25', '1500+', 10, 5),
  ('realm', '26-50', '800-1100', 45, 18),
  ('realm', '26-50', '1100-1300', 35, 15),
  ('realm', '26-50', '1300-1500', 28, 13),
  ('realm', '26-50', '1500+', 22, 11),
  ('realm', '51-75', '800-1100', 75, 28),
  ('realm', '51-75', '1100-1300', 60, 24),
  ('realm', '51-75', '1300-1500', 48, 20),
  ('realm', '51-75', '1500+', 38, 17),
  ('realm', '76-100', '800-1100', 120, 40),
  ('realm', '76-100', '1100-1300', 95, 34),
  ('realm', '76-100', '1300-1500', 78, 28),
  ('realm', '76-100', '1500+', 62, 24),
  ('realm', '101+', '800-1100', 180, 55),
  ('realm', '101+', '1100-1300', 145, 46),
  ('realm', '101+', '1300-1500', 115, 38),
  ('realm', '101+', '1500+', 90, 32);

-- Part 2: calculate_puzzle_iq function
CREATE OR REPLACE FUNCTION public.calculate_puzzle_iq(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT floor(avg(coalesce(pmr.iq, 1000)))::integer
  FROM game_modes gm
  LEFT JOIN player_mode_ratings pmr ON pmr.game_mode = gm.id AND pmr.user_id = p_user_id
  WHERE gm.is_active = true;
$$;