import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { RATING_TIERS } from '@/game/types';
import { PuzzleIQBadge } from '@/components/game/PuzzleIQBadge';
import { TierProgressBar } from '@/components/game/TierProgressBar';
import { PiqueIQPanel } from '@/components/game/PiqueIQPanel';
import { usePlayerStats, ModeRating } from '@/hooks/usePlayerStats';
import { formatTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Trophy, Target, Timer, Hash, Flame, BarChart3, Users, Brain } from 'lucide-react';
import { StreakCalendar } from '@/components/game/StreakCalendar';

interface GameRecord {
  id: string;
  won: boolean;
  moves: number;
  time_seconds: number;
  difficulty: string;
  rating_after: number;
  rating_change: number;
  played_at: string;
  hints_used: number;
  undos_used: number;
  game_mode: string;
}

function StatsContent({ games, stats }: {
  games: GameRecord[];
  stats: ReturnType<typeof usePlayerStats>;
}) {
  const localStats = useMemo(() => {
    if (games.length === 0) return null;
    const wins = games.filter(g => g.won);
    const winRate = games.length > 0 ? (wins.length / games.length) * 100 : 0;
    const avgMoves = wins.length > 0 ? Math.round(wins.reduce((s, g) => s + g.moves, 0) / wins.length) : 0;
    const avgTime = wins.length > 0 ? Math.round(wins.reduce((s, g) => s + g.time_seconds, 0) / wins.length) : 0;
    const bestTime = wins.length > 0 ? Math.min(...wins.map(g => g.time_seconds)) : 0;
    const fewestMoves = wins.length > 0 ? Math.min(...wins.map(g => g.moves)) : 0;
    return { winRate, avgMoves, avgTime, bestTime, fewestMoves, totalGames: games.length, totalWins: wins.length };
  }, [games]);

  const latestChange = games.length > 0 ? games[games.length - 1].rating_change : 0;

  const ratingHistory = useMemo(() => {
    if (games.length === 0) return [];
    const points = [{ x: 0, y: 1000 }];
    games.forEach((g, i) => points.push({ x: i + 1, y: g.rating_after }));
    return points;
  }, [games]);

  const chartMinY = ratingHistory.length > 0 ? Math.min(...ratingHistory.map(p => p.y)) - 30 : 970;
  const chartMaxY = ratingHistory.length > 0 ? Math.max(...ratingHistory.map(p => p.y)) + 30 : 1030;
  const chartW = 320;
  const chartH = 120;

  const toSVGPath = () => {
    if (ratingHistory.length < 2) return '';
    const maxX = ratingHistory.length - 1;
    const scaleX = (x: number) => (x / Math.max(maxX, 1)) * chartW;
    const scaleY = (y: number) => chartH - ((y - chartMinY) / Math.max(chartMaxY - chartMinY, 1)) * chartH;
    return ratingHistory.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x).toFixed(1)} ${scaleY(p.y).toFixed(1)}`).join(' ');
  };

  if (games.length === 0) {
    return (
      <div className="text-center py-12">
        <Target className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Play some games to see your stats!</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Pique IQ</p>
                <PuzzleIQBadge rating={stats.puzzleIQ} size="lg" />
              </div>
              <div className="text-right space-y-1">
                <p className={`text-lg font-bold font-mono flex items-center gap-1 ${
                  latestChange > 0 ? 'text-rating-up' : latestChange < 0 ? 'text-rating-down' : 'text-muted-foreground'
                }`}>
                  {latestChange > 0 ? <TrendingUp className="w-4 h-4" /> : latestChange < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                  {latestChange > 0 ? '+' : ''}{latestChange}
                </p>
                <p className="text-xs text-muted-foreground">Last game</p>
              </div>
            </div>

            {stats.percentile > 0 && (
              <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  Top <span className="text-primary font-bold">{Math.max(1, 100 - stats.percentile)}%</span> of all players
                </span>
              </div>
            )}

            <TierProgressBar rating={stats.puzzleIQ} />

            {ratingHistory.length > 1 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Rating History</p>
                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-24" preserveAspectRatio="none">
                  {RATING_TIERS.slice(0, 4).map(t => {
                    const y = chartH - ((t.min - chartMinY) / Math.max(chartMaxY - chartMinY, 1)) * chartH;
                    if (y < 0 || y > chartH) return null;
                    return <line key={t.name} x1="0" y1={y} x2={chartW} y2={y} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="4 4" />;
                  })}
                  <path d={toSVGPath()} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {ratingHistory.length > 1 && (() => {
                    const last = ratingHistory[ratingHistory.length - 1];
                    const maxX = ratingHistory.length - 1;
                    const cx = (last.x / Math.max(maxX, 1)) * chartW;
                    const cy = chartH - ((last.y - chartMinY) / Math.max(chartMaxY - chartMinY, 1)) * chartH;
                    return <circle cx={cx} cy={cy} r="3" fill="hsl(var(--primary))" />;
                  })()}
                </svg>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div className="grid grid-cols-2 gap-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-gold" />
            <p className="text-xs text-muted-foreground font-medium">Win Rate</p>
          </div>
          <p className="text-2xl font-bold font-mono">{localStats ? `${localStats.winRate.toFixed(0)}%` : '--'}</p>
          <p className="text-xs text-muted-foreground">{localStats ? `${localStats.totalWins}/${localStats.totalGames} games` : 'No games yet'}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-4 h-4 text-destructive" />
            <p className="text-xs text-muted-foreground font-medium">Best Streak</p>
          </div>
          <p className="text-2xl font-bold font-mono">{stats.bestStreak}</p>
          <p className="text-xs text-muted-foreground">Current: {stats.currentStreak}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground font-medium">Avg Moves</p>
          </div>
          <p className="text-2xl font-bold font-mono">{localStats?.avgMoves ?? '--'}</p>
          <p className="text-xs text-muted-foreground">Best: {localStats?.fewestMoves ?? '--'}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground font-medium">Avg Time</p>
          </div>
          <p className="text-2xl font-bold font-mono">{formatTime(localStats?.avgTime ?? 0)}</p>
          <p className="text-xs text-muted-foreground">Best: {formatTime(localStats?.bestTime ?? 0)}</p>
        </div>
      </motion.div>

      {/* Streak Calendar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card>
          <CardContent className="pt-4 pb-4">
            <StreakCalendar />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Recent Games</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {games.slice(-10).reverse().map(game => (
                <div key={game.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${game.won ? 'bg-rating-up' : 'bg-rating-down'}`} />
                    <span className="text-sm font-medium">{game.won ? 'Won' : 'Lost'}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      game.difficulty === 'Easy' ? 'bg-rating-up/15 text-rating-up' :
                      game.difficulty === 'Medium' ? 'bg-gold/15 text-gold' :
                      game.difficulty === 'Hard' ? 'bg-destructive/15 text-destructive' :
                      game.difficulty === 'Expert' ? 'bg-elite/15 text-elite' :
                      game.difficulty === 'Master' ? 'bg-master/15 text-master' :
                      'bg-grandmaster/15 text-grandmaster font-bold'
                    }`}>{game.difficulty}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{game.moves} moves</span>
                    <span>{formatTime(game.time_seconds)}</span>
                    <span className={`font-mono font-semibold ${game.rating_change > 0 ? 'text-rating-up' : 'text-rating-down'}`}>
                      {game.rating_change > 0 ? '+' : ''}{game.rating_change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function Stats() {
  const stats = usePlayerStats();

  const klondikeGames = useMemo(() => stats.games.filter((g: any) => !g.game_mode || g.game_mode === 'klondike'), [stats.games]);
  const freecellGames = useMemo(() => stats.games.filter((g: any) => g.game_mode === 'freecell'), [stats.games]);
  const realmGames = useMemo(() => stats.games.filter((g: any) => g.game_mode === 'realm'), [stats.games]);

  if (stats.loading) {
    return (
      <div className="bg-background flex items-center justify-center" style={{ minHeight: '100dvh', paddingBottom: 'calc(56px + var(--safe-area-bottom, 0px))' }}>
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
            <BarChart3 className="w-5 h-5 text-primary" />
            Statistics
          </h1>
        </motion.div>

        {/* Pique IQ Panel */}
        {stats.modeRatings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
            <PiqueIQPanel piqueIQ={stats.puzzleIQ} modeRatings={stats.modeRatings} />
          </motion.div>
        )}

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            <TabsTrigger value="klondike" className="flex-1">Klondike</TabsTrigger>
            <TabsTrigger value="freecell" className="flex-1">FreeCell</TabsTrigger>
            <TabsTrigger value="realm" className="flex-1">Realm</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <StatsContent games={stats.games as GameRecord[]} stats={stats} />
          </TabsContent>
          <TabsContent value="klondike">
            <StatsContent games={klondikeGames as GameRecord[]} stats={stats} />
          </TabsContent>
          <TabsContent value="freecell">
            <StatsContent games={freecellGames as GameRecord[]} stats={stats} />
          </TabsContent>
          <TabsContent value="realm">
            <StatsContent games={realmGames as GameRecord[]} stats={stats} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
