
-- Trigger to prevent non-service-role users from modifying subscription/payment fields on profiles
CREATE OR REPLACE FUNCTION public.protect_subscription_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the caller is the service role (e.g. edge functions with service key), allow all changes
  -- Service role has the 'service_role' role in Supabase
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For regular authenticated users, prevent modification of sensitive fields
  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
     OR OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier
     OR OLD.premium_expires_at IS DISTINCT FROM NEW.premium_expires_at
     OR OLD.streak_freezes_remaining IS DISTINCT FROM NEW.streak_freezes_remaining
     OR OLD.streak_freeze_used_on IS DISTINCT FROM NEW.streak_freeze_used_on
     OR OLD.rating IS DISTINCT FROM NEW.rating
     OR OLD.games_played IS DISTINCT FROM NEW.games_played
     OR OLD.games_won IS DISTINCT FROM NEW.games_won
     OR OLD.current_streak IS DISTINCT FROM NEW.current_streak
     OR OLD.best_streak IS DISTINCT FROM NEW.best_streak
     OR OLD.daily_wins_today IS DISTINCT FROM NEW.daily_wins_today
     OR OLD.daily_challenge_completed_today IS DISTINCT FROM NEW.daily_challenge_completed_today
     OR OLD.pending_milestone IS DISTINCT FROM NEW.pending_milestone
  THEN
    -- Silently revert protected fields to their original values
    NEW.subscription_status := OLD.subscription_status;
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.premium_expires_at := OLD.premium_expires_at;
    NEW.streak_freezes_remaining := OLD.streak_freezes_remaining;
    NEW.streak_freeze_used_on := OLD.streak_freeze_used_on;
    NEW.rating := OLD.rating;
    NEW.games_played := OLD.games_played;
    NEW.games_won := OLD.games_won;
    NEW.current_streak := OLD.current_streak;
    NEW.best_streak := OLD.best_streak;
    NEW.daily_wins_today := OLD.daily_wins_today;
    NEW.daily_challenge_completed_today := OLD.daily_challenge_completed_today;
    NEW.pending_milestone := OLD.pending_milestone;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS protect_profile_subscription_fields ON public.profiles;
CREATE TRIGGER protect_profile_subscription_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_subscription_fields();
