ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_win_date date,
  ADD COLUMN IF NOT EXISTS streak_freezes_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_tier text,
  ADD COLUMN IF NOT EXISTS premium_expires_at timestamp with time zone;