import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number;
  games_played: number;
  games_won: number;
  current_streak: number;
  best_streak: number;
  subscription_status: string;
  subscription_tier: string | null;
  premium_expires_at: string | null;
  last_win_date: string | null;
  streak_freezes_remaining: number;
  last_streak_date: string | null;
  streak_freeze_used_on: string | null;
  timezone_offset: number;
  daily_wins_today: number;
  daily_challenge_completed_today: boolean;
  pending_milestone: number | null;
  dark_mode: boolean;
}

interface SubscriptionInfo {
  subscribed: boolean;
  tier: string | null;
  subscription_end: string | null;
  cancelling?: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  subscription: SubscriptionInfo;
  isPremium: boolean;
  isDark: boolean;
  toggleDarkMode: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultSub: SubscriptionInfo = { subscribed: false, tier: null, subscription_end: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo>(defaultSub);
  const [isDark, setIsDark] = useState(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data as unknown as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const checkSubscription = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!error && data) {
        setSubscription({
          subscribed: data.subscribed ?? false,
          tier: data.tier ?? null,
          subscription_end: data.subscription_end ?? null,
          cancelling: data.cancelling ?? false,
        });
      }
    } catch {
      // Subscription check failed silently
    }
  }, [session]);

  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setSubscription(defaultSub);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => authSub.unsubscribe();
  }, [fetchProfile]);

  // Check subscription on login
  useEffect(() => {
    if (session?.user) {
      checkSubscription();
    }
  }, [session?.user?.id, checkSubscription]);

  const isPremium = subscription.subscribed ||
    (profile?.subscription_status === 'premium') ||
    (profile?.subscription_status === 'cancelled' && profile?.premium_expires_at
      ? new Date(profile.premium_expires_at) > new Date()
      : false);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setSubscription(defaultSub);
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      subscription,
      isPremium,
      signOut,
      refreshProfile,
      checkSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
