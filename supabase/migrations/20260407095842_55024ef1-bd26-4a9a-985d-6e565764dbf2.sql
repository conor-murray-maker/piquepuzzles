
-- 1. New table: weekly_challenge_rotation
CREATE TABLE public.weekly_challenge_rotation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  monday_mode TEXT NOT NULL,
  tuesday_mode TEXT NOT NULL,
  wednesday_mode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.weekly_challenge_rotation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read weekly rotation"
  ON public.weekly_challenge_rotation FOR SELECT
  TO authenticated USING (true);

-- 2. New table: daily_challenge_results
CREATE TABLE public.daily_challenge_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completion_time_seconds INTEGER,
  moves INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);
ALTER TABLE public.daily_challenge_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own daily results"
  ON public.daily_challenge_results FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated can read all daily results"
  ON public.daily_challenge_results FOR SELECT
  TO authenticated USING (true);

-- 3. New table: personal_bests
CREATE TABLE public.personal_bests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_mode TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'regular',
  best_time_seconds INTEGER NOT NULL,
  best_moves INTEGER NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_mode, difficulty, context)
);
ALTER TABLE public.personal_bests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own personal bests"
  ON public.personal_bests FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own personal bests"
  ON public.personal_bests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personal bests"
  ON public.personal_bests FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

-- 4. Modify daily_challenges: add difficulty and week_rotation_id
ALTER TABLE public.daily_challenges
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS week_rotation_id UUID REFERENCES public.weekly_challenge_rotation(id);

-- 5. Modify game_history: add is_daily_challenge and iq_delta_applied
ALTER TABLE public.game_history
  ADD COLUMN IF NOT EXISTS is_daily_challenge BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iq_delta_applied BOOLEAN NOT NULL DEFAULT true;

-- 6. Modify profiles: add last_celebrated_milestone
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_celebrated_milestone INTEGER NOT NULL DEFAULT 0;

-- 7. New RPC: get_daily_leaderboard_v2
-- Returns top 50 completions + DNFs, ranked by time (asc) then moves (asc) for completions,
-- and moves desc for DNFs. Also includes the requesting player's rank.
CREATE OR REPLACE FUNCTION public.get_daily_leaderboard_v2(p_challenge_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  completed BOOLEAN,
  completion_time_seconds INTEGER,
  moves INTEGER,
  hints_used INTEGER,
  rank INTEGER,
  current_streak INTEGER
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      dcr.user_id,
      COALESCE(p.display_name, 'Player') AS display_name,
      dcr.completed,
      dcr.completion_time_seconds,
      dcr.moves,
      dcr.hints_used,
      CASE
        WHEN dcr.completed THEN
          ROW_NUMBER() OVER (
            PARTITION BY dcr.completed
            ORDER BY dcr.completion_time_seconds ASC, dcr.moves ASC
          )::integer
        ELSE
          ROW_NUMBER() OVER (
            PARTITION BY dcr.completed
            ORDER BY dcr.moves DESC
          )::integer
      END AS rank,
      COALESCE(p.current_streak, 0) AS current_streak
    FROM daily_challenge_results dcr
    LEFT JOIN profiles p ON p.id = dcr.user_id
    WHERE dcr.challenge_id = p_challenge_id
  )
  -- Top 50 completions + top 50 DNFs + the player's own row
  SELECT * FROM (
    (SELECT * FROM ranked WHERE completed = true ORDER BY rank LIMIT 50)
    UNION ALL
    (SELECT * FROM ranked WHERE completed = false ORDER BY rank LIMIT 50)
    UNION ALL
    (SELECT * FROM ranked WHERE ranked.user_id = p_user_id AND NOT EXISTS (
      SELECT 1 FROM ranked r2 WHERE r2.user_id = p_user_id AND (
        (r2.completed = true AND r2.rank <= 50) OR (r2.completed = false AND r2.rank <= 50)
      )
    ))
  ) combined
  ORDER BY completed DESC, rank ASC;
$$;

-- 8. New RPC: count_daily_completions (replaces count_daily_attempts for new system)
CREATE OR REPLACE FUNCTION public.count_daily_completions(p_challenge_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM daily_challenge_results WHERE challenge_id = p_challenge_id;
$$;

-- 9. New RPC: get_streak_percentile (for "Only X% of players reach this" copy)
CREATE OR REPLACE FUNCTION public.get_streak_percentile(p_min_streak INTEGER)
RETURNS NUMERIC
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    (COUNT(*) FILTER (WHERE current_streak >= p_min_streak)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
    1
  )
  FROM profiles;
$$;
