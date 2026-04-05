-- Add region_map column
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS region_map jsonb DEFAULT NULL;

-- Collect IDs of deals to purge
CREATE TEMP TABLE realm_purge_ids AS
SELECT id FROM public.deals WHERE game_mode = 'realm' AND (crown_positions IS NOT NULL OR deduction_solvable IS NULL);

-- Nullify FK references in game_history
UPDATE public.game_history SET deal_uuid = NULL WHERE deal_uuid IN (SELECT id FROM realm_purge_ids);

-- Clean up daily_challenge_completions
DELETE FROM public.daily_challenge_completions WHERE deal_id IN (SELECT id FROM realm_purge_ids);

-- Clean up daily_challenges
DELETE FROM public.daily_challenges WHERE deal_id IN (SELECT id FROM realm_purge_ids);

-- Clean up deal_queue
DELETE FROM public.deal_queue WHERE deal_id IN (SELECT id FROM realm_purge_ids);

-- Clean up deal_working_set
DELETE FROM public.deal_working_set WHERE deal_id IN (SELECT id FROM realm_purge_ids);

-- Clean up user_played_deals
DELETE FROM public.user_played_deals WHERE deal_id IN (SELECT id FROM realm_purge_ids);

-- Now purge the deals
DELETE FROM public.deals WHERE id IN (SELECT id FROM realm_purge_ids);

-- Clean up temp table
DROP TABLE realm_purge_ids;