import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Spade, Trophy, BarChart3, Flame, ChevronRight, Layers, Grid3X3, Crown } from 'lucide-react';
import { PiqueIQPanel } from '@/components/game/PiqueIQPanel';
import { usePlayerStats } from '@/hooks/usePlayerStats';
import { useAuth } from '@/contexts/AuthContext';
import { OnboardingCarousel } from '@/components/onboarding/OnboardingCarousel';
import { WelcomeBackBanner } from '@/components/onboarding/WelcomeBackBanner';
import { useState, useEffect } from 'react';

function SkeletonCard({ className = '' }: { className?: string }) {
  return <div className={`stat-card animate-pulse bg-muted/50 ${className}`} />;
}

export default function Index() {
  const navigate = useNavigate();
  const { profile, isDark, toggleDarkMode } = useAuth();
  const stats = usePlayerStats();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if first-time user
  useEffect(() => {
    if (profile && profile.games_played === 0) {
      const onboardingDone = localStorage.getItem('pique-onboarding-done');
      if (!onboardingDone) {
        setShowOnboarding(true);
      }
    }
  }, [profile]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('pique-onboarding-done', 'true');
    setShowOnboarding(false);
  };


  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const userName = profile?.display_name?.split(' ')[0] || 'Player';

  if (showOnboarding) {
    return (
      <OnboardingCarousel
        userName={userName}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <div
      className="bg-background flex flex-col overflow-y-auto overscroll-contain"
      style={{
        height: '100dvh',
        paddingBottom: 'calc(56px + var(--safe-area-bottom, 0px) + 24px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <WelcomeBackBanner
        currentStreak={stats.currentStreak}
        dailyCompleted={false}
      />

      <header
        className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border"
        style={{ paddingTop: 'calc(16px + var(--safe-area-top, 0px))' }}
      >
        <div className="flex items-center gap-2">
          <Spade className="w-6 h-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">Pique</span>
        </div>
        <button onClick={toggleDarkMode} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          {isDark ? '☀️' : '🌙'}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {stats.loading ? (
          // Skeleton loading state
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-3">
              <div className="h-8 w-48 bg-muted/50 rounded-lg mx-auto animate-pulse" />
              <div className="h-4 w-64 bg-muted/50 rounded mx-auto animate-pulse" />
            </div>
            <SkeletonCard className="h-32" />
            <div className="space-y-3">
              <SkeletonCard className="h-16" />
              <SkeletonCard className="h-16" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SkeletonCard className="h-20" />
              <SkeletonCard className="h-20" />
              <SkeletonCard className="h-20" />
            </div>
          </div>
        ) : (
          <motion.div className="w-full max-w-md space-y-8" variants={container} initial="hidden" animate="show">
            <motion.div variants={item} className="text-center space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Sharpen your mind.</h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Premium puzzle games with a competitive edge. Track your Pique IQ across every game, every deal.
              </p>
            </motion.div>

            <motion.div variants={item}>
              <PiqueIQPanel piqueIQ={stats.puzzleIQ} modeRatings={stats.modeRatings} />
            </motion.div>

            <motion.div variants={item} className="space-y-3">
              <h2 className="text-xs text-muted-foreground uppercase tracking-wider font-medium px-1">Games</h2>

              <button
                onClick={() => navigate('/play?mode=klondike')}
                className="w-full stat-card flex items-center gap-4 text-left group hover:border-primary/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Klondike</p>
                  <p className="text-xs text-muted-foreground">The card game that rewards patience</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button
                onClick={() => navigate('/play?mode=freecell')}
                className="w-full stat-card flex items-center gap-4 text-left group hover:border-primary/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Grid3X3 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">FreeCell</p>
                  <p className="text-xs text-muted-foreground">Strategic card puzzle</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button
                onClick={() => navigate('/play?mode=realm')}
                className="w-full stat-card flex items-center gap-4 text-left group hover:border-primary/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Crown className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Realm</p>
                  <p className="text-xs text-muted-foreground">Crown placement puzzle</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </motion.div>

            <motion.div variants={item} className="grid grid-cols-3 gap-3">
              <div className="stat-card text-center py-3">
                <Trophy className="w-4 h-4 text-gold mx-auto mb-1" />
                <p className="font-mono font-semibold text-sm">{stats.wins}</p>
                <p className="text-xs text-muted-foreground">Wins</p>
              </div>
              <div className="stat-card text-center py-3">
                <Flame className="w-4 h-4 text-destructive mx-auto mb-1" />
                <p className="font-mono font-semibold text-sm">{stats.currentStreak}</p>
                <p className="text-xs text-muted-foreground">Streak</p>
              </div>
              <div className="stat-card text-center py-3">
                <BarChart3 className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="font-mono font-semibold text-sm">{stats.winRate}%</p>
                <p className="text-xs text-muted-foreground">Win Rate</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </main>

      <footer className="py-4 text-center border-t border-border">
        <p className="text-xs text-muted-foreground">Pique: Puzzle games for sharp minds</p>
      </footer>
    </div>
  );
}
