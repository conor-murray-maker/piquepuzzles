
-- Add tier and is_calibration to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'fresh';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS is_calibration boolean NOT NULL DEFAULT false;

-- user_calibration_progress
CREATE TABLE IF NOT EXISTS user_calibration_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_mode text NOT NULL DEFAULT 'klondike',
  calibration_deal_ids_played uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, game_mode)
);

CREATE POLICY "Users can read own calibration progress" ON user_calibration_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own calibration progress" ON user_calibration_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own calibration progress" ON user_calibration_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- deal_queue
CREATE TABLE IF NOT EXISTS deal_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_mode text NOT NULL DEFAULT 'klondike',
  deal_id uuid NOT NULL REFERENCES deals(id),
  tier text NOT NULL DEFAULT 'fresh',
  queued_at timestamptz NOT NULL DEFAULT now(),
  served_at timestamptz
);

CREATE POLICY "Users can read own queue" ON deal_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own queue" ON deal_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own queue" ON deal_queue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_played_deals
CREATE TABLE IF NOT EXISTS user_played_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deal_id uuid NOT NULL REFERENCES deals(id),
  played_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, deal_id)
);

CREATE POLICY "Users can read own played deals" ON user_played_deals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own played deals" ON user_played_deals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- daily_challenges
CREATE TABLE IF NOT EXISTS daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  game_mode text NOT NULL DEFAULT 'klondike',
  deal_id uuid NOT NULL REFERENCES deals(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE POLICY "Authenticated can read daily challenges" ON daily_challenges
  FOR SELECT TO authenticated USING (true);

-- daily_challenge_completions
CREATE TABLE IF NOT EXISTS daily_challenge_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  deal_id uuid NOT NULL REFERENCES deals(id),
  result text NOT NULL,
  actual_moves integer NOT NULL,
  actual_time integer NOT NULL,
  hints_used integer NOT NULL DEFAULT 0,
  final_delta integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE POLICY "Authenticated can read daily completions" ON daily_challenge_completions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own daily completions" ON daily_challenge_completions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
