import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, ChevronRight, Clock, Trophy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DailyChallengeService, DailyChallenge, DailyResult } from '@/services/DailyChallengeService';
import { DailyStreakBadge } from './DailyStreakBadge';
import { formatTimeRaw, ddsToLabel } from '@/lib/format';

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

export function DailyChallengeCard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const currentStreak = (profile as any)?.current_streak ?? 0;

  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [myResult, setMyResult] = useState<DailyResult | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState('');

  const todayStr = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${h}h ${m}m`);
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetch() {
      try {
        const ch = await DailyChallengeService.getTodaysChallenge(todayStr);
        if (!ch) return;
        setChallenge(ch);

        const count = await DailyChallengeService.getCompletionCount(ch.id);
        setTotalPlayers(count);

        if (user) {
          const result = await DailyChallengeService.getMyResult(ch.id, user.id);
          setMyResult(result);
        }
      } catch {}
      setReady(true);
    }
    fetch();
  }, [todayStr, user]);

  if (!ready || !challenge) return null;

  const difficulty = challenge.difficulty || (challenge.deals ? ddsToLabel(challenge.deals.dds_blended) : 'Medium');
  const challengeNumber = getChallengeNumber(challenge.date);
  const completed = !!myResult;

  if (completed && myResult) {
    // Completed state
    return (
      <motion.button
        className="w-full stat-card flex items-center gap-3 text-left opacity-80"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 0.8, y: 0 }}
        onClick={() => navigate('/daily')}
      >
        <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-muted-foreground">Daily Challenge</p>
          <p className="text-xs text-muted-foreground">
            {myResult.rank ? `#${myResult.rank} globally` : 'Completed'} · {myResult.completion_time_seconds ? formatTimeRaw(myResult.completion_time_seconds) : 'DNF'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {currentStreak > 0 && <DailyStreakBadge streak={currentStreak} size="sm" />}
          <span className="text-xs text-muted-foreground">Come back tomorrow</span>
        </div>
      </motion.button>
    );
  }

  // Not yet completed
  return (
    <motion.button
      className="w-full stat-card flex items-center gap-3 text-left group hover:border-primary/30 transition-colors"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate('/daily')}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Calendar className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm">Daily Challenge</p>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
            {getModeLabel(challenge.game_mode)}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            difficulty === 'Easy' ? 'bg-rating-up/15 text-rating-up' :
            difficulty === 'Medium' ? 'bg-gold/15 text-gold' :
            difficulty === 'Hard' ? 'bg-destructive/15 text-destructive' :
            'bg-elite/15 text-elite'
          }`}>
            {difficulty}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span>#{challengeNumber}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Resets in {countdown}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {currentStreak > 0 && <DailyStreakBadge streak={currentStreak} size="sm" />}
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </motion.button>
  );
}
