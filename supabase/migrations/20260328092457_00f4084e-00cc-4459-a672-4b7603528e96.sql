-- Nullify game_history references to 4x4 Realm deals before deletion
UPDATE game_history SET deal_uuid = NULL 
WHERE deal_uuid IN (SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves = 4);

-- Clean up user_played_deals references
DELETE FROM user_played_deals 
WHERE deal_id IN (SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves = 4);

-- Clean up deal_working_set references
DELETE FROM deal_working_set 
WHERE deal_id IN (SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves = 4);

-- Clean up deal_queue references
DELETE FROM deal_queue 
WHERE deal_id IN (SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves = 4);

-- Clean up daily_challenge_completions references
DELETE FROM daily_challenge_completions 
WHERE deal_id IN (SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves = 4);

-- Clean up daily_challenges references
DELETE FROM daily_challenges 
WHERE deal_id IN (SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves = 4);

-- Now delete the 4x4 Realm deals
DELETE FROM deals WHERE game_mode = 'realm' AND min_moves = 4;