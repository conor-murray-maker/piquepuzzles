-- Add confidence and simulation_count columns to deals table
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS confidence real NOT NULL DEFAULT 0;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS simulation_count integer NOT NULL DEFAULT 0;

-- Create index on deals for game_mode lookups
CREATE INDEX IF NOT EXISTS idx_deals_game_mode ON public.deals(game_mode);

-- Create index on deal_queue for fast queue pop
CREATE INDEX IF NOT EXISTS idx_deal_queue_user_mode_served ON public.deal_queue(user_id, game_mode, served_at);

-- Create index on user_played_deals for fast exclusion
CREATE INDEX IF NOT EXISTS idx_user_played_deals_user_mode ON public.user_played_deals(user_id, deal_id);

-- Add unique constraint on user_played_deals if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_played_deals_user_deal_unique'
  ) THEN
    ALTER TABLE public.user_played_deals ADD CONSTRAINT user_played_deals_user_deal_unique UNIQUE (user_id, deal_id);
  END IF;
END $$;