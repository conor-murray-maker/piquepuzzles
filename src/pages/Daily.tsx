import { useState, useEffect, useMemo, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { haptic } from '@/lib/haptics';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { ddsToLabel, formatTimeRaw } from '@/lib/format';
import { Calendar, Timer, Hash, Trophy, Clock, Users, Flame, Share2, ChevronRight, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DailyStreakBadge, LeaderboardStreakIcon, getStreakCopy } from '@/components/game/DailyStreakBadge';
import { DailyMilestoneCelebration } from '@/components/game/DailyMilestoneCelebration';
import { DailyChallengeService, DailyChallenge, DailyResult, PersonalBest } from '@/services/DailyChallengeService';
import { isDailyCompletedByDeal } from '@/lib/dailyCompletionFlag';
import { generateGhostPlayers, mergeWithGhosts, shouldShowEarlyAccessNote } from '@/lib/ghostLeaderboard';

function getDayOfWeekUTC(): number {
  return new Date().getUTCDay();
}

function getModeLabel(mode: string): string {
  if (mode === 'freecell') return 'FreeCell';
  if (mode === 'realm') return 'Realm';
  return 'Klondike';
}

function getChallengeNumber(dateStr: string): number {
  const start = new Date('2025-01-01T00:00:00Z').getTime();
  const current = new Date(dateStr + 'T00:00:00Z').getTime();
  return Math.floor((current - start) / 86400000) + 1;
}

export default function Daily() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const currentStreak = (profile as any)?.current_streak ?? 0;
  const lastCelebratedMilestone = (profile as any)?.last_celebrated_milestone ?? 0;

  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [myResult, setMyResult] = useState<DailyResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<DailyResult[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState('');
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [isNewPB, setIsNewPB] = useState(false);
  const [yesterdayResult, setYesterdayResult] = useState<{ rank: number; totalPlayers: number; completionTimeSeconds: number } | null>(null);
  const [streakPercentile, setStreakPercentile] = useState<number | null>(null);
  const [showMilestone, setShowMilestone] = useState(false);

  const todayStr = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString().split('T')[0];
  }, []);

  // Countdown timer to midnight UTC
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch today's challenge data
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        const ch = await DailyChallengeService.getTodaysChallenge(todayStr);
        if (ch) {
          setChallenge(ch);

          const [count, lb] = await Promise.all([
            DailyChallengeService.getCompletionCount(ch.id),
            DailyChallengeService.getLeaderboard(ch.id, user?.id),
          ]);
          setTotalPlayers(count);
          setLeaderboard(lb);

          if (user) {
            const result = await DailyChallengeService.getMyResult(ch.id, user.id);
            setMyResult(result);

            if (result?.completed && ch.deals) {
              const difficulty = ch.difficulty || ddsToLabel(ch.deals.dds_blended);
              const pb = await DailyChallengeService.getPersonalBest(
                user.id, ch.game_mode, difficulty, 'daily_challenge'
              );
              setPersonalBest(pb);
            }

            const yesterday = await DailyChallengeService.getYesterdayResult(user.id);
            setYesterdayResult(yesterday);
          }
        }

        // Streak percentile for 30+ day copy
        if (currentStreak >= 30) {
          const pct = await DailyChallengeService.getStreakPercentile(30);
          setStreakPercentile(pct);
        }
      } catch (err) {
        console.warn('Failed to fetch daily challenge:', err);
      }
      setLoading(false);
    }
    fetchAll();
  }, [todayStr, user, currentStreak]);

  // Check milestone celebration
  useEffect(() => {
    if (!myResult?.completed) return;
    const milestones = [3, 7, 14, 30, 60, 100, 365];
    const reached = milestones.find(m => currentStreak >= m && m > lastCelebratedMilestone);
    if (reached) setShowMilestone(true);
  }, [myResult, currentStreak, lastCelebratedMilestone]);

  const handlePlay = useCallback(() => {
    if (!challenge?.deals) return;
    haptic.medium();
    navigate(
      `/play?mode=${challenge.game_mode}&seed=${challenge.deals.seed}&drawMode=${challenge.deals.draw_mode}&daily=${todayStr}&dailyDealId=${challenge.deal_id}`
    );
  }, [challenge, todayStr, navigate]);

  const handleShare = useCallback(async () => {
    if (!myResult || !challenge) return;
    const rank = myResult.rank ?? '?';
    const time = myResult.completion_time_seconds ? formatTimeRaw(myResult.completion_time_seconds) : 'DNF';
    const modeLabel = getModeLabel(challenge.game_mode);
    const text = `I ranked #${rank} on today's Pique ${modeLabel} Challenge in ${time} 🏆\npiquepuzzles.lovable.app`;

    if (navigator.share) {
      try { await navigator.share({ title: 'Pique Daily Challenge', text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Result copied to clipboard!');
    }
  }, [myResult, challenge]);

  const difficulty = challenge?.difficulty || (challenge?.deals ? ddsToLabel(challenge.deals.dds_blended) : 'Medium');
  const challengeNumber = challenge ? getChallengeNumber(challenge.date) : 0;

  const completions = leaderboard.filter(e => e.completed);
  const dnfs = leaderboard.filter(e => !e.completed);

  const myRank = myResult?.rank;
  const streakCopy = getStreakCopy(currentStreak, streakPercentile);

  if (loading) {
    return (
      <div className="bg-background" style={{ height: '100dvh', paddingBottom: 'calc(56px + var(--safe-area-bottom, 0px) + 24px)' }}>
        <div className="px-4 sm:px-6 py-4 border-b border-border" style={{ paddingTop: 'calc(16px + var(--safe-area-top, 0px))' }}>
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="px-4 sm:px-6 py-6 max-w-md mx-auto space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // Milestone celebration overlay
  if (showMilestone) {
    const milestones = [365, 100, 60, 30, 14, 7, 3];
    const reached = milestones.find(m => currentStreak >= m && m > lastCelebratedMilestone) || currentStreak;
    return (
      <DailyMilestoneCelebration
        milestone={reached}
        streak={currentStreak}
        percentile={streakPercentile}
        onDismiss={() => setShowMilestone(false)}
      />
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
      <header
        className="px-4 sm:px-6 py-4 border-b border-border"
        style={{ paddingTop: 'calc(16px + var(--safe-area-top, 0px))' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Daily Challenge</h1>
          </div>
          <DailyStreakBadge streak={currentStreak} size="sm" />
        </div>
      </header>

      <main className="px-4 sm:px-6 py-5 max-w-md mx-auto space-y-4">
        {!challenge ? (
          <motion.div className="stat-card text-center py-8 space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="font-semibold">No challenge today</p>
            <p className="text-sm text-muted-foreground">Check back soon!</p>
          </motion.div>
        ) : (
          <>
            {/* Challenge Info Card */}
            <motion.div
              className="stat-card py-4 space-y-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Challenge #{challengeNumber}</p>
                  <p className="font-semibold">{getModeLabel(challenge.game_mode)}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  difficulty === 'Easy' ? 'bg-rating-up/15 text-rating-up' :
                  difficulty === 'Medium' ? 'bg-gold/15 text-gold' :
                  difficulty === 'Hard' ? 'bg-destructive/15 text-destructive' :
                  'bg-elite/15 text-elite'
                }`}>
                  {difficulty}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{totalPlayers} completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{countdown}</span>
                </div>
              </div>
            </motion.div>

            {/* Streak + Context */}
            <motion.div
              className="stat-card py-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DailyStreakBadge streak={currentStreak} size="md" showLabel />
                </div>
                {currentStreak > 0 && (
                  <span className="font-mono font-bold text-lg">{currentStreak}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{streakCopy}</p>
            </motion.div>

            {/* Yesterday's result */}
            {yesterdayResult && (
              <motion.div
                className="text-xs text-muted-foreground text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.08 }}
              >
                Yesterday: #{yesterdayResult.rank} of {yesterdayResult.totalPlayers} — {formatTimeRaw(yesterdayResult.completionTimeSeconds)}
              </motion.div>
            )}

            {/* My result or CTA */}
            {myResult ? (
              <DailyResultCard
                result={myResult}
                totalPlayers={totalPlayers}
                personalBest={personalBest}
                isNewPB={isNewPB}
                difficulty={difficulty}
                gameMode={challenge.game_mode}
                onShare={handleShare}
                onPlayMore={() => navigate(`/play?mode=${challenge.game_mode}`)}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Button className="w-full" size="lg" onClick={handlePlay}>
                  Play Today's Challenge
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {currentStreak > 0 ? 'Complete to extend your streak' : 'Complete to start a streak'}
                </p>
              </motion.div>
            )}

            {/* Leaderboard */}
            {completions.length > 0 && (
              <LeaderboardSection
                title="Completions"
                entries={completions}
                userId={user?.id}
                showTime
              />
            )}

            {dnfs.length > 0 && (
              <LeaderboardSection
                title="Did Not Finish"
                entries={dnfs}
                userId={user?.id}
                showTime={false}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function DailyResultCard({
  result, totalPlayers, personalBest, isNewPB, difficulty, gameMode, onShare, onPlayMore,
}: {
  result: DailyResult;
  totalPlayers: number;
  personalBest: PersonalBest | null;
  isNewPB: boolean;
  difficulty: string;
  gameMode: string;
  onShare: () => void;
  onPlayMore: () => void;
}) {
  return (
    <motion.div className="space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      {/* Result header */}
      <div className="stat-card py-4 space-y-4">
        <div className="text-center space-y-1">
          {result.completed ? (
            <>
              <Trophy className="w-8 h-8 text-gold mx-auto" />
              <h2 className="text-xl font-bold">Completed!</h2>
            </>
          ) : (
            <>
              <Hash className="w-8 h-8 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-bold">Did Not Finish</h2>
            </>
          )}
        </div>

        {/* Time + Moves */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <Timer className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="font-mono font-bold text-lg">
              {result.completion_time_seconds ? formatTimeRaw(result.completion_time_seconds) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Time</p>
          </div>
          <div className="text-center">
            <Hash className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="font-mono font-bold text-lg">{result.moves}</p>
            <p className="text-xs text-muted-foreground">Moves</p>
          </div>
        </div>

        {/* Personal Best Banner */}
        {isNewPB && (
          <motion.div
            className="bg-gold/10 border border-gold/20 rounded-lg p-3 text-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-sm font-semibold text-gold">🎉 New Personal Best!</p>
            {personalBest && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatTimeRaw(personalBest.best_time_seconds)} → {result.completion_time_seconds ? formatTimeRaw(result.completion_time_seconds) : '—'}
              </p>
            )}
          </motion.div>
        )}

        {!isNewPB && personalBest && (
          <p className="text-xs text-muted-foreground text-center">
            Your best: {formatTimeRaw(personalBest.best_time_seconds)} ({new Date(personalBest.achieved_at).toLocaleDateString()})
          </p>
        )}

        {/* Global Rank */}
        {result.rank && result.completed && (
          <motion.div
            className="text-center py-2 bg-primary/5 rounded-lg"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <p className="text-3xl font-bold font-mono text-primary">
              #{result.rank}
            </p>
            <p className="text-xs text-muted-foreground">of {totalPlayers} completions today</p>
          </motion.div>
        )}

        {/* No IQ impact note */}
        <p className="text-xs text-muted-foreground text-center italic">
          Daily challenges don't affect your IQ rating
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onShare} className="flex-1">
          <Share2 className="w-4 h-4 mr-1" />
          Share
        </Button>
        <Button onClick={onPlayMore} className="flex-1">
          Play more {getModeLabel(gameMode)}
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </motion.div>
  );
}

function LeaderboardSection({
  title, entries, userId, showTime,
}: {
  title: string;
  entries: DailyResult[];
  userId?: string;
  showTime: boolean;
}) {
  return (
    <motion.div
      className="stat-card py-4 space-y-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1.5">
        {entries.map((entry, i) => (
          <div
            key={`${entry.user_id}-${i}`}
            className={`flex items-center gap-2 text-sm py-1 ${
              entry.user_id === userId ? 'font-semibold bg-primary/5 rounded px-2 -mx-2' : ''
            }`}
          >
            <span className="w-6 text-right text-muted-foreground font-mono text-xs">
              {entry.rank ?? i + 1}
            </span>
            <span className="flex-1 truncate flex items-center gap-1.5">
              {entry.display_name}
              <LeaderboardStreakIcon streak={entry.current_streak} />
            </span>
            {showTime && entry.completion_time_seconds && (
              <span className="font-mono text-xs">{formatTimeRaw(entry.completion_time_seconds)}</span>
            )}
            <span className="font-mono text-xs text-muted-foreground">{entry.moves}m</span>
            {entry.completed && (
              <Trophy className="w-3 h-3 text-gold flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
