
-- Insert Grandmaster Realm performance expectation priors (avg_moves = 0 since Realm is time-only)
INSERT INTO performance_expectations (game_mode, dds_bucket, iq_bucket, avg_time_seconds, avg_moves, sample_count)
VALUES
  ('realm', '131-150', '<1100',     980, 0, 0),
  ('realm', '131-150', '1100-1300', 672, 0, 0),
  ('realm', '131-150', '1300-1500', 420, 0, 0),
  ('realm', '131-150', '1500-1700', 252, 0, 0),
  ('realm', '131-150', '1700-2000', 154, 0, 0),
  ('realm', '131-150', '2000-2500',  56, 0, 0),
  ('realm', '131-150', '2500+',      31, 0, 0)
ON CONFLICT (game_mode, dds_bucket, iq_bucket) DO NOTHING;

-- Fix existing Realm performance_expectations rows: set avg_moves = 0 for consistency
UPDATE performance_expectations
SET avg_moves = 0
WHERE game_mode = 'realm' AND avg_moves != 0;
