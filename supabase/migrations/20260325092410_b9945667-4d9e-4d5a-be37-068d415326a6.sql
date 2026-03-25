CREATE TABLE public.deal_working_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_mode text NOT NULL DEFAULT 'klondike',
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  entered_at timestamptz NOT NULL DEFAULT now(),
  attempts_at_entry integer NOT NULL DEFAULT 0,
  UNIQUE (game_mode, deal_id)
);

ALTER TABLE public.deal_working_set ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read working set"
  ON public.deal_working_set
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_deal_working_set_game_mode ON public.deal_working_set(game_mode);
CREATE INDEX idx_deal_working_set_deal_id ON public.deal_working_set(deal_id);