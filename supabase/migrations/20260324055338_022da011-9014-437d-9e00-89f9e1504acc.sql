-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Weekly streak freeze award: every Monday at 00:01 UTC
-- Awards 1 freeze to premium users who have 0 remaining
SELECT cron.schedule(
  'award-streak-freezes',
  '1 0 * * 1',
  $$
  UPDATE public.profiles
  SET streak_freezes_remaining = 1
  WHERE subscription_status = 'premium'
    AND streak_freezes_remaining = 0;
  $$
);