-- Restrict daily_challenge_completions SELECT to owner only
DROP POLICY IF EXISTS "Authenticated can read daily completions" ON public.daily_challenge_completions;
CREATE POLICY "Users can read own daily completions"
  ON public.daily_challenge_completions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create a leaderboard RPC that exposes only safe columns
CREATE OR REPLACE FUNCTION public.get_daily_leaderboard(p_date date)
RETURNS TABLE(user_id uuid, actual_moves integer, actual_time integer, result text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.user_id,
    dc.actual_moves,
    dc.actual_time,
    dc.result,
    COALESCE(p.display_name, 'Player') AS display_name
  FROM daily_challenge_completions dc
  LEFT JOIN profiles p ON p.id = dc.user_id
  WHERE dc.date = p_date
  ORDER BY
    dc.result DESC,
    dc.actual_moves ASC,
    dc.actual_time ASC
  LIMIT 10;
$$;

-- Count function for total attempts
CREATE OR REPLACE FUNCTION public.count_daily_attempts(p_date date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM daily_challenge_completions WHERE date = p_date;
$$;