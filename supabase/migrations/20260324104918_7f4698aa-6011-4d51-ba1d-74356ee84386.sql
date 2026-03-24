-- Reset all player ratings and stats
UPDATE profiles SET 
  rating = 1000,
  games_played = 0,
  games_won = 0,
  current_streak = 0,
  best_streak = 0,
  last_streak_date = null,
  daily_wins_today = 0,
  daily_challenge_completed_today = false,
  pending_milestone = null,
  last_win_date = null,
  streak_freeze_used_on = null;

-- Clear corrupted game history
DELETE FROM game_history;

-- Clear streak history  
DELETE FROM streak_history;

-- Clear user played deals to allow replaying deals
DELETE FROM user_played_deals;

-- Clear deal queue to force regeneration with correct DDS
DELETE FROM deal_queue;