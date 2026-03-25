ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS unique_winning_paths integer NOT NULL DEFAULT 0;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS path_diversity_score real NOT NULL DEFAULT 0;