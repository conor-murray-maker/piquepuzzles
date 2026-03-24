-- Simpler dedup: prevent exact same game record (user, deal, moves, result) 
-- The edge function also checks within 30 seconds before inserting
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_history_dedup 
ON game_history (user_id, deal_uuid, moves, won) WHERE deal_uuid IS NOT NULL;