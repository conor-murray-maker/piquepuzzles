DELETE FROM game_history WHERE deal_uuid IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves >= 10 AND crown_positions IS NULL
);
DELETE FROM user_played_deals WHERE deal_id IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves >= 10 AND crown_positions IS NULL
);
DELETE FROM deal_working_set WHERE deal_id IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves >= 10 AND crown_positions IS NULL
);
DELETE FROM deal_queue WHERE deal_id IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND min_moves >= 10 AND crown_positions IS NULL
);
DELETE FROM deals WHERE game_mode = 'realm' AND min_moves >= 10 AND crown_positions IS NULL;