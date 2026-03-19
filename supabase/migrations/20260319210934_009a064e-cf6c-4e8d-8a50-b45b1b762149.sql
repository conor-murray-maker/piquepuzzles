CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL,
  deal_seed integer NOT NULL,
  game_mode text NOT NULL DEFAULT 'klondike',
  draw_mode integer NOT NULL DEFAULT 3,
  difficulty text NOT NULL,
  challenger_moves integer NOT NULL,
  challenger_time_seconds integer NOT NULL,
  challenger_rating integer NOT NULL,
  challenger_rating_change integer NOT NULL,
  challenger_won boolean NOT NULL DEFAULT true,
  challenger_display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE POLICY "Anyone can read challenges" ON public.challenges FOR SELECT USING (true);
CREATE POLICY "Auth users can insert own challenges" ON public.challenges FOR INSERT TO authenticated WITH CHECK (auth.uid() = challenger_id);

CREATE TABLE public.challenge_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  display_name text,
  moves integer NOT NULL,
  time_seconds integer NOT NULL,
  rating integer NOT NULL,
  rating_change integer NOT NULL,
  won boolean NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);

CREATE POLICY "Anyone can read completions" ON public.challenge_completions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own completions" ON public.challenge_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);