-- Delete referencing rows first
DELETE FROM game_history WHERE deal_uuid IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND dds_blended >= 131 AND crown_positions IS NULL
);
DELETE FROM user_played_deals WHERE deal_id IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND dds_blended >= 131 AND crown_positions IS NULL
);
DELETE FROM deal_working_set WHERE deal_id IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND dds_blended >= 131 AND crown_positions IS NULL
);
DELETE FROM deal_queue WHERE deal_id IN (
  SELECT id FROM deals WHERE game_mode = 'realm' AND dds_blended >= 131 AND crown_positions IS NULL
);
-- Now delete the deals themselves
DELETE FROM deals WHERE game_mode = 'realm' AND dds_blended >= 131 AND crown_positions IS NULL;