-- Backfill missing streak history for users who earned a streak day via 2+ wins on the same local calendar day,
-- then repair derived profile streak fields and current daily counters.
WITH qualified_days AS (
  SELECT
    gh.user_id,
    (((gh.played_at AT TIME ZONE 'UTC') - make_interval(mins => COALESCE(p.timezone_offset, 0)))::date) AS local_date
  FROM public.game_history gh
  JOIN public.profiles p ON p.id = gh.user_id
  WHERE gh.won = true
  GROUP BY gh.user_id, (((gh.played_at AT TIME ZONE 'UTC') - make_interval(mins => COALESCE(p.timezone_offset, 0)))::date)
  HAVING count(*) >= 2
),
qualified_grouped AS (
  SELECT
    q.user_id,
    q.local_date,
    q.local_date - (row_number() OVER (PARTITION BY q.user_id ORDER BY q.local_date))::integer AS streak_group
  FROM qualified_days q
),
streak_candidates AS (
  SELECT
    user_id,
    local_date,
    row_number() OVER (PARTITION BY user_id, streak_group ORDER BY local_date) AS streak_day_number
  FROM qualified_grouped
),
insert_missing AS (
  INSERT INTO public.streak_history (
    user_id,
    date,
    condition_met,
    streak_day_number,
    streak_length_at_time
  )
  SELECT
    sc.user_id,
    sc.local_date,
    'two_wins',
    sc.streak_day_number,
    sc.streak_day_number
  FROM streak_candidates sc
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.streak_history sh
    WHERE sh.user_id = sc.user_id
      AND sh.date = sc.local_date
  )
  RETURNING user_id, date
),
streak_rollup AS (
  SELECT
    sh.user_id,
    max(sh.streak_length_at_time) AS best_streak,
    max(sh.date) AS last_streak_date
  FROM public.streak_history sh
  GROUP BY sh.user_id
),
current_streaks AS (
  SELECT DISTINCT ON (sh.user_id)
    sh.user_id,
    sh.streak_length_at_time AS current_streak
  FROM public.streak_history sh
  ORDER BY sh.user_id, sh.date DESC
),
latest_wins AS (
  SELECT
    p.id AS user_id,
    max((((gh.played_at AT TIME ZONE 'UTC') - make_interval(mins => COALESCE(p.timezone_offset, 0)))::date)) FILTER (WHERE gh.won) AS last_win_date,
    count(*) FILTER (
      WHERE gh.won
        AND (((gh.played_at AT TIME ZONE 'UTC') - make_interval(mins => COALESCE(p.timezone_offset, 0)))::date) = (((now() AT TIME ZONE 'UTC') - make_interval(mins => COALESCE(p.timezone_offset, 0)))::date)
    ) AS daily_wins_today
  FROM public.profiles p
  LEFT JOIN public.game_history gh ON gh.user_id = p.id
  GROUP BY p.id, COALESCE(p.timezone_offset, 0)
),
daily_challenge_today AS (
  SELECT
    p.id AS user_id,
    EXISTS (
      SELECT 1
      FROM public.daily_challenge_completions dcc
      WHERE dcc.user_id = p.id
        AND dcc.result = 'win'
        AND dcc.date = (((now() AT TIME ZONE 'UTC') - make_interval(mins => COALESCE(p.timezone_offset, 0)))::date)
    ) AS daily_challenge_completed_today
  FROM public.profiles p
)
UPDATE public.profiles p
SET
  current_streak = COALESCE(cs.current_streak, 0),
  best_streak = COALESCE(sr.best_streak, 0),
  last_streak_date = sr.last_streak_date,
  last_win_date = lw.last_win_date,
  daily_wins_today = COALESCE(lw.daily_wins_today, 0),
  daily_challenge_completed_today = COALESCE(dct.daily_challenge_completed_today, false),
  updated_at = now()
FROM latest_wins lw
LEFT JOIN streak_rollup sr ON sr.user_id = lw.user_id
LEFT JOIN current_streaks cs ON cs.user_id = lw.user_id
LEFT JOIN daily_challenge_today dct ON dct.user_id = lw.user_id
WHERE p.id = lw.user_id;