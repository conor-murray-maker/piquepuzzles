import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface OnboardingState {
  onboardingCompleted: boolean;
  realmCompleted: boolean;
  klondikeCompleted: boolean;
  freecellCompleted: boolean;
  firstLossSeen: boolean;
  firstHintSeen: boolean;
  firstTierUpgradeSeen: boolean;
  isNewUser: boolean;
  loading: boolean;
}

export function useOnboarding() {
  const { user, profile, refreshProfile, loading } = useAuth();

  const state: OnboardingState = useMemo(() => {
    if (!profile) {
      return {
        onboardingCompleted: true, // default to true so we don't show onboarding when loading
        realmCompleted: false,
        klondikeCompleted: false,
        freecellCompleted: false,
        firstLossSeen: false,
        firstHintSeen: false,
        firstTierUpgradeSeen: false,
        isNewUser: false,
        loading: loading,
      };
    }
    const p = profile as any;
    return {
      onboardingCompleted: p.onboarding_completed ?? false,
      realmCompleted: p.onboarding_realm_completed ?? false,
      klondikeCompleted: p.onboarding_klondike_completed ?? false,
      freecellCompleted: p.onboarding_freecell_completed ?? false,
      firstLossSeen: p.first_loss_seen ?? false,
      firstHintSeen: p.first_hint_seen ?? false,
      firstTierUpgradeSeen: p.first_tier_upgrade_seen ?? false,
      isNewUser: p.games_played === 0 && !(p.onboarding_completed ?? false),
      loading: false,
    };
  }, [profile, loading]);

  const updateField = useCallback(async (field: string, value: boolean) => {
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ [field]: value } as any)
      .eq('id', user.id);
    // Refresh profile to sync optimistic state
    void refreshProfile();
  }, [user, refreshProfile]);

  const markOnboardingComplete = useCallback(() => updateField('onboarding_completed', true), [updateField]);
  const markModeComplete = useCallback((mode: string) => {
    const field = `onboarding_${mode}_completed`;
    return updateField(field, true);
  }, [updateField]);
  const markFirstLossSeen = useCallback(() => updateField('first_loss_seen', true), [updateField]);
  const markFirstHintSeen = useCallback(() => updateField('first_hint_seen', true), [updateField]);
  const markFirstTierUpgradeSeen = useCallback(() => updateField('first_tier_upgrade_seen', true), [updateField]);

  return {
    ...state,
    markOnboardingComplete,
    markModeComplete,
    markFirstLossSeen,
    markFirstHintSeen,
    markFirstTierUpgradeSeen,
  };
}
