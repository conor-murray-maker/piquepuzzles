ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS games_played_klondike integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS games_played_freecell integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS games_played_realm integer NOT NULL DEFAULT 0;