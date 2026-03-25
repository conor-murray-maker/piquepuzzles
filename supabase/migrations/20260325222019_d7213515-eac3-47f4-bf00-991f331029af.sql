ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_subscription_fields;

UPDATE public.profiles
SET
  current_streak = 1,
  best_streak = 1,
  last_streak_date = '2026-03-24',
  daily_wins_today = 0,
  updated_at = now()
WHERE id = 'd196b555-e4c7-4d69-b446-18206466016c';

ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_subscription_fields;