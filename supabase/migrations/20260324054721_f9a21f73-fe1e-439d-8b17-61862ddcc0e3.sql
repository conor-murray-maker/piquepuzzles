-- Add new profile columns for streak system
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_streak_date date,
  ADD COLUMN IF NOT EXISTS streak_freeze_used_on date,
  ADD COLUMN IF NOT EXISTS timezone_offset integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_wins_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_challenge_completed_today boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_milestone integer;

-- Add daily_challenges columns for progressive difficulty
ALTER TABLE public.daily_challenges
  ADD COLUMN IF NOT EXISTS day_of_week integer,
  ADD COLUMN IF NOT EXISTS target_dds_min real,
  ADD COLUMN IF NOT EXISTS target_dds_max real;

-- Create streak_history table
CREATE TABLE IF NOT EXISTS public.streak_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  streak_day_number integer NOT NULL,
  condition_met text NOT NULL,
  streak_length_at_time integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.streak_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own streak history"
  ON public.streak_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own streak history"
  ON public.streak_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);