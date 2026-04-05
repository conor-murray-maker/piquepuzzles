
CREATE TABLE public.game_completion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deal_id text,
  deal_uuid uuid,
  game_mode text NOT NULL DEFAULT 'klondike',
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false,
  error_message text,
  payload jsonb
);

ALTER TABLE public.game_completion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own completion logs"
  ON public.game_completion_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
