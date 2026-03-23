-- 1. Drop the overly permissive deals INSERT policy
DROP POLICY IF EXISTS "Authenticated can insert deals" ON public.deals;

-- 2. Create a secure RPC for challenge creation that fetches rating from profiles
CREATE OR REPLACE FUNCTION public.create_challenge(
  p_deal_seed integer,
  p_game_mode text,
  p_draw_mode integer,
  p_difficulty text,
  p_moves integer,
  p_time_seconds integer,
  p_rating_change integer,
  p_won boolean,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rating integer;
  v_challenge_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch the authoritative rating from profiles
  SELECT rating INTO v_rating FROM profiles WHERE id = v_user_id;
  IF v_rating IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Validate rating_change is within plausible range (-50 to 50)
  IF p_rating_change < -50 OR p_rating_change > 50 THEN
    RAISE EXCEPTION 'Invalid rating change';
  END IF;

  INSERT INTO challenges (
    challenger_id, deal_seed, game_mode, draw_mode, difficulty,
    challenger_moves, challenger_time_seconds, challenger_rating,
    challenger_rating_change, challenger_won, challenger_display_name
  ) VALUES (
    v_user_id, p_deal_seed, p_game_mode, p_draw_mode, p_difficulty,
    p_moves, p_time_seconds, v_rating,
    p_rating_change, p_won, p_display_name
  )
  RETURNING id INTO v_challenge_id;

  RETURN v_challenge_id;
END;
$$;