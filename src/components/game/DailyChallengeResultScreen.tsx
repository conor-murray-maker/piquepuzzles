import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Timer, Hash, Trophy, Users, Share2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTimeRaw } from '@/lib/format';
import { toast } from 'sonner';
import { DailyStreakBadge, LeaderboardStreakIcon, getStreakCopy } from './DailyStreakBadge';
import { DailyMilestoneCelebration } from './DailyMilestoneCelebration';
import { DailyChallengeService, DailyResult, PersonalBest } from '@/services/DailyChallengeService';
import { useAuth } from '@/contexts/AuthContext';
import { GameResult } from '@/hooks/useGamePersistence';

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

interface DailyChallengeResultScreenProps {
  won: boolean;
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
  gameMode: string;
  difficulty: string;
  dailyDate: string;
  dailyDealId: string;
  ratingResult: GameResult | null;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

export function DailyChallengeResultScreen({
  won, moves, elapsedSeconds, hintsUsed, gameMode, difficulty,
  dailyDate, dailyDealId, ratingResult, onPlayAgain, onGoHome,
}: DailyChallengeResultScreenProps) {
  const { user, profile } = useAuth();
  const currentStreak = ratingResult?.streakUpdate?.currentStreak ?? (profile as any)?.current_streak ?? 0;
  const lastCelebratedMilestone = (profile as any)?.last_celebrated_milestone ?? 0;

  const [myResult, setMyResult] = useState<DailyResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<DailyResult[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [isNewPB, setIsNewPB] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);
  const [streakPercentile, setStreakPercentile] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const challengeNumber = getChallengeNumber(dailyDate);
  const modeLabel = getModeLabel(gameMode);

  // Fetch leaderboard and result data
  useEffect(() => {
    async function fetchData() {
      try {
        const ch = await DailyChallengeService.getTodaysChallenge(dailyDate);
        if (!ch || !user) { setLoading(false); return; }

        const [count, lb, result] = await Promise.all([
          DailyChallengeService.getCompletionCount(ch.id),
          DailyChallengeService.getLeaderboard(ch.id, user.id),
          DailyChallengeService.getMyResult(ch.id, user.id),
        ]);

        setTotalPlayers(count);
        setLeaderboard(lb);
        setMyResult(result);

        // Check personal best
        if (won) {
          const pbResult = await DailyChallengeService.updatePersonalBest({
            userId: user.id,
            gameMode,
            difficulty,
            context: 'daily_challenge',
            timeSeconds: elapsedSeconds,
            moves,
          });
          setIsNewPB(pbResult.isNewPB);
          setPersonalBest(pbResult.previousBest);
        }

        if (currentStreak >= 30) {
          const pct = await DailyChallengeService.getStreakPercentile(30);
          setStreakPercentile(pct);
        }
      } catch (err) {
        console.warn('Failed to fetch daily result data:', err);
      }
      setLoading(false);
    }

    // Small delay to allow the edge function write to propagate
    const timer = setTimeout(fetchData, 500);
    return () => clearTimeout(timer);
  }, [dailyDate, user, won, gameMode, difficulty, elapsedSeconds, moves, currentStreak]);

  // Check milestone celebration
  useEffect(() => {
    if (!won) return;
    const milestoneReached = ratingResult?.streakUpdate?.milestoneReached;
    if (milestoneReached && milestoneReached > lastCelebratedMilestone) {
      setShowMilestone(true);
    }
  }, [won, ratingResult, lastCelebratedMilestone]);

  const streakCopy = getStreakCopy(currentStreak, streakPercentile);

  const handleShare = useCallback(async () => {
    const rank = myResult?.rank ?? '?';
    const time = formatTimeRaw(elapsedSeconds);
    let text: string;
    if (won) {
      text = `I ranked #${rank} on today's Pique ${modeLabel} Challenge in ${time} 🏆\npiquepuzzles.lovable.app`;
    } else {
      text = `I attempted today's Pique ${modeLabel} Challenge — can you beat ${totalPlayers} completions?\npiquepuzzles.lovable.app`;
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Pique Daily Challenge', text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Result copied to clipboard!');
    }
  }, [myResult, elapsedSeconds, won, modeLabel, totalPlayers]);

  if (showMilestone && ratingResult?.streakUpdate?.milestoneReached) {
    return (
      <DailyMilestoneCelebration
        milestone={ratingResult.streakUpdate.milestoneReached}
        streak={currentStreak}
        percentile={streakPercentile}
        onDismiss={() => setShowMilestone(false)}
      />
    );
  }

  const completions = leaderboard.filter(e => e.completed);
  const dnfs = leaderboard.filter(e => !e.completed);
  const streakIncremented = ratingResult?.streakUpdate && ratingResult.streakUpdate.currentStreak > 0;

  return (
    <div
      className="bg-background overflow-y-auto overscroll-contain"
      style={{
        height: '100dvh',
        paddingTop: 'var(--safe-area-top, 0px)',
        paddingBottom: 'calc(56px + var(--safe-area-bottom, 0px) + 24px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="px-4 sm:px-6 py-6 max-w-md mx-auto space-y-5">
        {/* 1. Header */}
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {won ? (
            <>
              <Calendar className="w-10 h-10 text-primary mx-auto" />
              <h1 className="text-2xl font-bold">Challenge Complete!</h1>
            </>
          ) : (
            <>
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto" />
              <h1 className="text-2xl font-bold">Challenge Attempted</h1>
            </>
          )}
          <p className="text-sm text-muted-foreground">
            {modeLabel} · {difficulty} · Challenge #{challengeNumber}
          </p>
        </motion.div>

        {/* 2. Your result */}
        <motion.div
          className="stat-card py-5 text-center space-y-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          {won ? (
            <>
              <div className="flex items-center justify-center gap-1">
                <Timer className="w-5 h-5 text-muted-foreground" />
                <span className="font-mono font-bold text-3xl">{formatTimeRaw(elapsedSeconds)}</span>
              </div>
              <p className="text-sm text-muted-foreground">{moves} moves</p>
            </>
          ) : (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-muted-foreground">Did Not Finish</p>
              <p className="text-sm text-muted-foreground">{moves} moves made</p>
            </div>
          )}
        </motion.div>

        {/* 3. Personal Best Banner */}
        {isNewPB && won && (
          <motion.div
            className="bg-gold/10 border border-gold/20 rounded-xl p-4 text-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <p className="text-sm font-semibold text-gold">🎉 New Personal Best!</p>
            {personalBest ? (
              <p className="text-xs text-muted-foreground mt-1">
                {formatTimeRaw(personalBest.best_time_seconds)} → {formatTimeRaw(elapsedSeconds)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">First completion! You set the benchmark.</p>
            )}
          </motion.div>
        )}

        {/* 4. Global Rank */}
        <motion.div
          className="stat-card py-5 text-center"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {won && myResult?.rank ? (
            <>
              <p className="text-4xl font-bold font-mono text-primary">#{myResult.rank}</p>
              <p className="text-sm text-muted-foreground mt-1">of {totalPlayers} completions today</p>
            </>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading rank...</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-muted-foreground">Did not finish</p>
              <p className="text-sm text-muted-foreground mt-1">
                <Users className="w-3.5 h-3.5 inline mr-1" />
                {totalPlayers} players completed today
              </p>
            </>
          )}
        </motion.div>

        {/* 5. Streak section */}
        <motion.div
          className="stat-card py-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="flex items-center justify-between">
            <DailyStreakBadge streak={currentStreak} size="md" showLabel />
            {currentStreak > 0 && (
              <span className="font-mono font-bold text-lg">{currentStreak}</span>
            )}
          </div>
          {streakIncremented && won && (
            <motion.p
              className="text-xs text-rating-up font-medium mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Streak extended! {currentStreak} days
            </motion.p>
          )}
          <p className="text-xs text-muted-foreground mt-2">{streakCopy}</p>
        </motion.div>

        {/* No IQ impact note */}
        <p className="text-xs text-muted-foreground text-center italic">
          Daily challenges don't affect your IQ rating
        </p>

        {/* 6. Leaderboard */}
        {completions.length > 0 && (
          <LeaderboardSection title="Completions" entries={completions} userId={user?.id} showTime />
        )}
        {dnfs.length > 0 && (
          <LeaderboardSection title="Did Not Finish" entries={dnfs} userId={user?.id} showTime={false} />
        )}

        {/* 7. Share */}
        <Button variant="outline" onClick={handleShare} className="w-full">
          <Share2 className="w-4 h-4 mr-2" />
          Share Result
        </Button>

        {/* 8. Secondary CTA */}
        <Button onClick={onPlayAgain} className="w-full">
          Play more {modeLabel}
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
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
      transition={{ delay: 0.3 }}
    >
      <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">{title}</h3>
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
