
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_realm_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_klondike_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_freecell_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_loss_seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_hint_seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_tier_upgrade_seen boolean NOT NULL DEFAULT false;
