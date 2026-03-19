import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getTier, RATING_TIERS } from '@/game/types';
import { PuzzleIQBadge, TierProgress } from '@/components/game/PuzzleIQBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Trophy, Target, Timer, Hash, Flame, BarChart3 } from 'lucide-react';

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
}

export default function Stats() {
  const { profile } = useAuth();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGames() {
      const { data } = await supabase
        .from('game_history')
        .select('*')
        .order('played_at', { ascending: true })
        .limit(500);
      if (data) setGames(data as GameRecord[]);
      setLoading(false);
    }
    fetchGames();
  }, []);

  const stats = useMemo(() => {
    if (games.length === 0) return null;
    const wins = games.filter(g => g.won);
    const winRate = games.length > 0 ? (wins.length / games.length) * 100 : 0;
    const avgMoves = wins.length > 0
      ? Math.round(wins.reduce((s, g) => s + g.moves, 0) / wins.length)
      : 0;
    const avgTime = wins.length > 0
      ? Math.round(wins.reduce((s, g) => s + g.time_seconds, 0) / wins.length)
      : 0;
    const bestTime = wins.length > 0
      ? Math.min(...wins.map(g => g.time_seconds))
      : 0;
    const fewestMoves = wins.length > 0
      ? Math.min(...wins.map(g => g.moves))
      : 0;

    return { winRate, avgMoves, avgTime, bestTime, fewestMoves, totalGames: games.length, totalWins: wins.length };
  }, [games]);

  const rating = profile?.rating ?? 1000;
  const tier = getTier(rating);

  const formatTime = (s: number) => {
    if (s === 0) return '--';
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // Build rating history chart data (simple SVG sparkline)
  const ratingHistory = useMemo(() => {
    if (games.length === 0) return [];
    // Start with 1000, then track rating_after
    const points = [{ x: 0, y: 1000 }];
    games.forEach((g, i) => {
      points.push({ x: i + 1, y: g.rating_after });
    });
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
    return ratingHistory.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${scaleX(p.x).toFixed(1)} ${scaleY(p.y).toFixed(1)}`
    ).join(' ');
  };

  const latestChange = games.length > 0 ? games[games.length - 1].rating_change : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Statistics
          </h1>
        </motion.div>

        {/* Puzzle IQ Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardContent className="pt-5 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Puzzle IQ</p>
                  <PuzzleIQBadge rating={rating} size="lg" />
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold font-mono flex items-center gap-1 ${
                    latestChange > 0 ? 'text-rating-up' : latestChange < 0 ? 'text-rating-down' : 'text-muted-foreground'
                  }`}>
                    {latestChange > 0 ? <TrendingUp className="w-4 h-4" /> : latestChange < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                    {latestChange > 0 ? '+' : ''}{latestChange}
                  </p>
                  <p className="text-xs text-muted-foreground">Last game</p>
                </div>
              </div>
              <TierProgress rating={rating} />

              {/* Rating history chart */}
              {ratingHistory.length > 1 && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Rating History</p>
                  <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-24" preserveAspectRatio="none">
                    {/* Grid lines */}
                    {RATING_TIERS.slice(0, 4).map(t => {
                      const y = chartH - ((t.min - chartMinY) / Math.max(chartMaxY - chartMinY, 1)) * chartH;
                      if (y < 0 || y > chartH) return null;
                      return (
                        <line key={t.name} x1="0" y1={y} x2={chartW} y2={y}
                          stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="4 4" />
                      );
                    })}
                    {/* Line */}
                    <path d={toSVGPath()} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    {/* Current point */}
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

        {/* Stats Grid */}
        <motion.div
          className="grid grid-cols-2 gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-gold" />
              <p className="text-xs text-muted-foreground font-medium">Win Rate</p>
            </div>
            <p className="text-2xl font-bold font-mono">{stats ? `${stats.winRate.toFixed(0)}%` : '--'}</p>
            <p className="text-xs text-muted-foreground">{stats ? `${stats.totalWins}/${stats.totalGames} games` : 'No games yet'}</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-4 h-4 text-destructive" />
              <p className="text-xs text-muted-foreground font-medium">Best Streak</p>
            </div>
            <p className="text-2xl font-bold font-mono">{profile?.best_streak ?? 0}</p>
            <p className="text-xs text-muted-foreground">Current: {profile?.current_streak ?? 0}</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Avg Moves</p>
            </div>
            <p className="text-2xl font-bold font-mono">{stats?.avgMoves ?? '--'}</p>
            <p className="text-xs text-muted-foreground">Best: {stats?.fewestMoves ?? '--'}</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Avg Time</p>
            </div>
            <p className="text-2xl font-bold font-mono">{formatTime(stats?.avgTime ?? 0)}</p>
            <p className="text-xs text-muted-foreground">Best: {formatTime(stats?.bestTime ?? 0)}</p>
          </div>
        </motion.div>

        {/* Recent Games */}
        {games.length > 0 && (
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
                          'bg-elite/15 text-elite'
                        }`}>{game.difficulty}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{game.moves} moves</span>
                        <span>{formatTime(game.time_seconds)}</span>
                        <span className={`font-mono font-semibold ${
                          game.rating_change > 0 ? 'text-rating-up' : 'text-rating-down'
                        }`}>
                          {game.rating_change > 0 ? '+' : ''}{game.rating_change}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {games.length === 0 && (
          <div className="text-center py-12">
            <Target className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Play some games to see your stats!</p>
          </div>
        )}
      </div>
    </div>
  );
}
