import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PiqueIQPanel } from '@/components/game/PiqueIQPanel';
import { usePlayerStats, ModeRating } from '@/hooks/usePlayerStats';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trophy, Flame, BarChart3, LogOut, Share2, Check, Edit3, User, Layers, Grid3X3, Shield, Brain, Puzzle } from 'lucide-react';
import { toast } from 'sonner';
import { FeedbackBox } from '@/components/profile/FeedbackBox';

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const stats = usePlayerStats();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const handleSaveName = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setEditing(false);
    toast.success('Display name updated');
  }, [user, displayName, refreshProfile]);

  const handleShare = useCallback(async () => {
    const text = `🧠 My Pique IQ: ${stats.puzzleIQ} (${stats.tier.name})\n🏆 ${stats.wins} wins | ${stats.winRate}% win rate\n🔥 Best streak: ${stats.bestStreak}\n\nPlay at piquepuzzles.lovable.app`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Pique Stats', text });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Stats copied to clipboard!');
    }
  }, [stats]);

  return (
    <div
      className="bg-background overflow-y-auto overscroll-contain"
      style={{
        height: '100dvh',
        paddingBottom: 'calc(56px + var(--safe-area-bottom, 0px) + 24px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        className="max-w-lg mx-auto px-4 space-y-5"
        style={{ paddingTop: 'calc(24px + var(--safe-area-top, 0px))' }}
      >
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Profile
          </h1>
        </motion.div>

        {/* User info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">{(profile?.display_name || user?.email || '?')[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="Display name"
                        className="h-8 text-sm"
                        maxLength={30}
                        autoFocus
                      />
                      <Button size="sm" onClick={handleSaveName} disabled={saving} className="h-8 px-2">
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{profile?.display_name || 'Anonymous Player'}</p>
                      <button onClick={() => { setDisplayName(profile?.display_name || ''); setEditing(true); }} className="text-muted-foreground hover:text-foreground">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Shareable Stats Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div ref={shareCardRef}>
          <Card className="bg-gradient-to-br from-card to-secondary/30 overflow-hidden">
              <CardContent className="pt-5 pb-4 space-y-4">
                <PiqueIQPanel piqueIQ={stats.puzzleIQ} modeRatings={stats.modeRatings} />

                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <Trophy className="w-4 h-4 text-gold mx-auto mb-1" />
                    <p className="font-mono font-bold text-sm">{stats.wins}</p>
                    <p className="text-[10px] text-muted-foreground">Wins</p>
                  </div>
                  <div className="text-center">
                    <Flame className="w-4 h-4 text-destructive mx-auto mb-1" />
                    <p className="font-mono font-bold text-sm">{stats.bestStreak}</p>
                    <p className="text-[10px] text-muted-foreground">Best Streak</p>
                  </div>
                  <div className="text-center">
                    <BarChart3 className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="font-mono font-bold text-sm">{stats.winRate}%</p>
                    <p className="text-[10px] text-muted-foreground">Win Rate</p>
                  </div>
                </div>

                <div className="text-center pt-1">
                  <p className="text-[10px] text-muted-foreground">piquepuzzles.lovable.app</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button variant="outline" onClick={handleShare} className="w-full mt-3">
            <Share2 className="w-4 h-4 mr-2" />
            Share Stats
          </Button>
        </motion.div>

        {/* Streak info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="pt-4 pb-3 space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Streak</p>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-medium">Current Streak</span>
                </div>
                <span className="text-lg font-mono font-bold">{stats.currentStreak}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-gold" />
                  <span className="text-sm font-medium">Best Streak</span>
                </div>
                <span className="text-lg font-mono font-bold">{stats.bestStreak}</span>
              </div>
              {profile?.subscription_status === 'premium' && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Streak Freeze</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {(profile as any)?.streak_freezes_remaining > 0
                      ? '1 freeze available'
                      : `Used ${(profile as any)?.streak_freeze_used_on || 'N/A'}`}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Games summary */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <Card>
            <CardContent className="pt-4 pb-3 space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Games Played</p>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Klondike</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{stats.gameBreakdown.klondike} games</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">FreeCell</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{stats.gameBreakdown.freecell} games</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Puzzle className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Realm</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{stats.gameBreakdown.realm} games</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Feedback */}
        <FeedbackBox userIQ={stats.puzzleIQ} />

        {/* Sign out */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Button variant="ghost" onClick={signOut} className="w-full text-destructive hover:text-destructive hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
