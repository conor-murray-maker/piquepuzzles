
-- Add game_mode column to game_history (default 'klondike' for existing records)
ALTER TABLE public.game_history ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'klondike';

-- Create percentile function: returns what % of players have lower rating
CREATE OR REPLACE FUNCTION public.get_rating_percentile(user_rating integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE 
      WHEN (SELECT COUNT(*) FROM profiles) <= 1 THEN 50
      ELSE LEAST(99, GREATEST(1,
        (SELECT ROUND(
          (COUNT(*) FILTER (WHERE rating < user_rating)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100
        )::integer FROM profiles)
      ))
    END,
    50
  );
$$;
