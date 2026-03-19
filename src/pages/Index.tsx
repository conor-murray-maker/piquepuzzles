import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Spade, Trophy, BarChart3, Flame, ChevronRight, Layers, Grid3X3 } from 'lucide-react';
import { PuzzleIQBadge, TierProgress } from '@/components/game/PuzzleIQBadge';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function Index() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [isDark, setIsDark] = useState(false);

  const rating = profile?.rating ?? 1000;
  const gamesWon = profile?.games_won ?? 0;
  const gamesPlayed = profile?.games_played ?? 0;
  const currentStreak = profile?.current_streak ?? 0;
  const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(prefersDark);
    document.documentElement.classList.toggle('dark', prefersDark);
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-16">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Spade className="w-6 h-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">Pique</span>
        </div>
        <button onClick={toggleTheme} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          {isDark ? '☀️' : '🌙'}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <motion.div className="w-full max-w-md space-y-8" variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Sharpen your mind.</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Premium puzzle games with a competitive edge. Track your Puzzle IQ across every game, every deal.
            </p>
          </motion.div>

          <motion.div variants={item} className="stat-card text-center space-y-3 py-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Your Puzzle IQ</p>
            <PuzzleIQBadge rating={rating} size="lg" />
            <TierProgress rating={rating} />
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
                <p className="font-semibold text-sm">Klondike Solitaire</p>
                <p className="text-xs text-muted-foreground">Classic • 3-card draw</p>
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
                <p className="text-xs text-muted-foreground">Strategic • All cards visible</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-3 gap-3">
            <div className="stat-card text-center py-3">
              <Trophy className="w-4 h-4 text-gold mx-auto mb-1" />
              <p className="font-mono font-semibold text-sm">{gamesWon}</p>
              <p className="text-xs text-muted-foreground">Wins</p>
            </div>
            <div className="stat-card text-center py-3">
              <Flame className="w-4 h-4 text-destructive mx-auto mb-1" />
              <p className="font-mono font-semibold text-sm">{currentStreak}</p>
              <p className="text-xs text-muted-foreground">Streak</p>
            </div>
            <div className="stat-card text-center py-3">
              <BarChart3 className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="font-mono font-semibold text-sm">{winRate}%</p>
              <p className="text-xs text-muted-foreground">Win Rate</p>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <footer className="py-4 text-center border-t border-border">
        <p className="text-xs text-muted-foreground">Pique — Puzzle games for sharp minds</p>
      </footer>
    </div>
  );
}
