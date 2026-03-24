import { useState, useCallback, useEffect } from 'react';
import { haptic } from '@/lib/haptics';
import { StreakMilestoneModal } from './StreakMilestoneModal';
import { motion } from 'framer-motion';
import { KlondikeState } from '@/game/types';
import { PuzzleIQBadge, RatingChange } from './PuzzleIQBadge';
import { TierProgressBar } from './TierProgressBar';
import { Button } from '@/components/ui/button';
import { Trophy, Target, Timer, Hash, Lightbulb, Undo2, ArrowLeft, Share2 } from 'lucide-react';
import { ChallengeService } from '@/services/ChallengeService';
import { formatTimeRaw } from '@/lib/format';
import { getDifficultyLabel } from '@/lib/difficulty';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ScoreBreakdownData } from '@/hooks/useGamePersistence';

interface PostGameScreenProps {
  gameState: KlondikeState;
  currentRating: number;
  previousRating?: number;
  ratingChange: number;
  onPlayAgain: () => void;
  onGoHome: () => void;
  elapsedSeconds: number;
  gameMode?: string;
  dealSeed?: number;
  drawMode?: number;
  challengeData?: {
    challengeId: string;
    challengerName: string;
    challengerMoves: number;
    challengerTime: number;
    challengerRating: number;
  } | null;
  streakUpdate?: {
    currentStreak: number;
    bestStreak: number;
    freezeUsed: boolean;
    milestoneReached: number | null;
  } | null;
  breakdown?: ScoreBreakdownData | null;
}

export function PostGameScreen({
  gameState, currentRating, previousRating, ratingChange, onPlayAgain, onGoHome, elapsedSeconds,
  gameMode = 'klondike', dealSeed, drawMode = 3, challengeData, streakUpdate, breakdown,
}: PostGameScreenProps) {
  console.log('[PostGameScreen props]', { ratingChange, breakdown, previousRating, currentRating, isWon: gameState.isWon });
  const { user, profile } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [showMilestone, setShowMilestone] = useState(!!streakUpdate?.milestoneReached);

  useEffect(() => {
    if (gameState.isWon) haptic.success();
    else haptic.heavy();
  }, []);
  const timeSeconds = elapsedSeconds;

  const formatTime = formatTimeRaw;

  const handleChallenge = useCallback(async () => {
    haptic.medium();
    if (!user || !profile || dealSeed === undefined) return;
    setSharing(true);
    try {
      const challengeId = await ChallengeService.createChallenge({
        challengerId: user.id,
        dealSeed,
        gameMode,
        drawMode,
        difficulty: gameState.difficulty,
        moves: gameState.moves,
        timeSeconds,
        rating: currentRating,
        ratingChange,
        won: gameState.isWon,
        displayName: profile.display_name,
      });

      if (!challengeId) throw new Error('No challenge ID returned');

      const url = `${window.location.origin}/challenge/${challengeId}`;
      const text = `I ${gameState.isWon ? 'solved' : 'attempted'} this ${gameState.difficulty} deal in ${formatTime(timeSeconds)} with ${gameState.moves} moves on Pique. Can you beat it? ${url}`;

      if (navigator.share) {
        await navigator.share({ title: 'Pique Challenge', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Challenge link copied!');
      }
    } catch {
      toast.error('Failed to create challenge');
    }
    setSharing(false);
  }, [user, profile, dealSeed, gameMode, drawMode, gameState, timeSeconds, currentRating, ratingChange]);

  const isChallenge = !!challengeData;
  const playerWonChallenge = isChallenge && gameState.isWon && challengeData &&
    gameState.moves <= challengeData.challengerMoves;

  if (showMilestone && streakUpdate?.milestoneReached) {
    return (
      <StreakMilestoneModal
        milestone={streakUpdate.milestoneReached}
        onDismiss={() => setShowMilestone(false)}
      />
    );
  }

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
    <div className="flex items-center justify-center p-4" style={{ minHeight: '100%' }}>
      <motion.div
        className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="text-center space-y-2">
          {gameState.isWon ? (
            <>
              <Trophy className="w-10 h-10 text-gold mx-auto" />
              <h2 className="text-2xl font-bold">Victory!</h2>
            </>
          ) : (
            <>
              <Target className="w-10 h-10 text-muted-foreground mx-auto" />
              <h2 className="text-2xl font-bold">Game Over</h2>
            </>
          )}
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            gameState.difficulty === 'Easy' ? 'bg-rating-up/20 text-rating-up' :
            gameState.difficulty === 'Medium' ? 'bg-gold/20 text-gold' :
            gameState.difficulty === 'Hard' ? 'bg-destructive/20 text-destructive' :
            'bg-elite/20 text-elite'
          }`}>
            {gameState.difficulty} Deal
          </span>
        </div>

        <div className="text-center space-y-3 py-4 border-y border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Puzzle IQ</p>
          <PuzzleIQBadge rating={currentRating} size="lg" />
          <RatingChange change={ratingChange} />
          <TierProgressBar
            rating={currentRating}
            previousRating={previousRating}
            ratingChange={ratingChange}
          />
        </div>

        {/* Score Breakdown Card */}
        <ScoreBreakdownCard
          won={gameState.isWon}
          breakdown={breakdown}
          ratingChange={ratingChange}
          difficulty={gameState.difficulty}
          actualTime={timeSeconds}
          actualMoves={gameState.moves}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card flex items-center gap-2">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="font-mono font-semibold text-sm">{formatTime(timeSeconds)}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-2">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Moves</p>
              <p className="font-mono font-semibold text-sm">{gameState.moves}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Hints</p>
              <p className="font-mono font-semibold text-sm">{gameState.hintsUsed}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-2">
            <Undo2 className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Undos</p>
              <p className="font-mono font-semibold text-sm">{gameState.undosUsed}</p>
            </div>
          </div>
        </div>

        {isChallenge && challengeData && (
          <motion.div
            className="bg-secondary/50 rounded-xl p-4 space-y-3"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Share2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Challenge Result</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div></div>
              <div className="font-semibold text-muted-foreground">You</div>
              <div className="font-semibold text-muted-foreground">{challengeData.challengerName}</div>

              <div className="text-muted-foreground text-left">Time</div>
              <div className="font-mono font-semibold">{formatTime(timeSeconds)}</div>
              <div className="font-mono font-semibold">{formatTime(challengeData.challengerTime)}</div>

              <div className="text-muted-foreground text-left">Moves</div>
              <div className="font-mono font-semibold">{gameState.moves}</div>
              <div className="font-mono font-semibold">{challengeData.challengerMoves}</div>
            </div>
            {gameState.isWon && (
              <p className={`text-center text-sm font-semibold ${playerWonChallenge ? 'text-rating-up' : 'text-muted-foreground'}`}>
                {playerWonChallenge ? '🏆 You won the challenge!' : 'Challenger wins this round!'}
              </p>
            )}
          </motion.div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { haptic.light(); onGoHome(); }} className="flex-1">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Home
          </Button>
          <Button onClick={() => { haptic.medium(); onPlayAgain(); }} className="flex-1">
            Play Again
          </Button>
        </div>

        {dealSeed !== undefined && (
          <Button
            variant="outline"
            onClick={handleChallenge}
            disabled={sharing}
            className="w-full"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Challenge a Friend
          </Button>
        )}
      </motion.div>
    </div>
    </div>
  );
}

// --- Score Breakdown Card ---

function ScoreBreakdownCard({ won, breakdown, ratingChange, difficulty, actualTime, actualMoves }: {
  won: boolean;
  breakdown?: ScoreBreakdownData | null;
  ratingChange: number;
  difficulty: string;
  actualTime: number;
  actualMoves: number;
}) {
  console.log('[ScoreBreakdownCard received]', { won, breakdown, ratingChange });
  if (ratingChange === 0 && !breakdown) return null;

  const bd = breakdown;
  const diffLabel = difficulty || 'Medium';

  if (!won) {
    // Loss breakdown — single line
    return (
      <motion.div
        className="w-full rounded-xl border border-border bg-card p-4 space-y-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
          Puzzle IQ Lost
        </p>
        <BreakdownLine
          label={`${diffLabel} deal — not solved`}
          value={ratingChange}
        />
        <div className="border-t border-border my-2" />
        <div className="flex justify-between items-center">
          <span className="font-bold text-foreground">Total</span>
          <span className="font-bold text-lg text-destructive font-mono">
            {ratingChange}
          </span>
        </div>
      </motion.div>
    );
  }

  // Win breakdown
  const baseDelta = bd?.baseDelta ?? ratingChange;
  const timeBP = bd?.timeBonusPoints ?? 0;
  const moveBP = bd?.movesBonusPoints ?? 0;
  const hintPP = bd?.hintPenaltyPoints ?? 0;
  const hintsUsed = bd?.hintsUsed ?? 0;
  const avgTime = bd?.dealAvgTime ?? null;
  const avgMoves = bd?.dealAvgMoves ?? null;

  return (
    <motion.div
      className="w-full rounded-xl border border-border bg-card p-4 space-y-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
        Puzzle IQ Earned
      </p>

      {/* Deal difficulty */}
      <BreakdownLine
        label={`${diffLabel} deal won`}
        value={baseDelta}
      />

      {/* Time line */}
      {timeBP >= 0 ? (
        <BreakdownLine
          label="Faster than expected"
          subLabel={avgTime !== null ? `${formatTimeRaw(actualTime)} vs ${formatTimeRaw(Math.round(avgTime))} avg` : undefined}
          value={timeBP}
        />
      ) : (
        <BreakdownLine
          label="Slower than expected"
          subLabel={avgTime !== null ? `${formatTimeRaw(actualTime)} vs ${formatTimeRaw(Math.round(avgTime))} avg` : undefined}
          value={timeBP}
        />
      )}

      {/* Moves line */}
      {moveBP >= 0 ? (
        <BreakdownLine
          label="Fewer moves than expected"
          subLabel={avgMoves !== null ? `${actualMoves} vs ${Math.round(avgMoves)} avg` : undefined}
          value={moveBP}
        />
      ) : (
        <BreakdownLine
          label="More moves than expected"
          subLabel={avgMoves !== null ? `${actualMoves} vs ${Math.round(avgMoves)} avg` : undefined}
          value={moveBP}
        />
      )}

      {/* Hints line */}
      {hintsUsed > 0 ? (
        <BreakdownLine
          label={`Hints used × ${hintsUsed}`}
          value={-hintPP}
        />
      ) : (
        <BreakdownLine label="Hints" value={null} />
      )}

      <div className="border-t border-border my-2" />
      <div className="flex justify-between items-center">
        <span className="font-bold text-foreground">Total</span>
        <span className={`font-bold text-lg font-mono ${ratingChange >= 0 ? 'text-rating-up' : 'text-destructive'}`}>
          {ratingChange > 0 ? '+' : ''}{ratingChange}
        </span>
      </div>
    </motion.div>
  );
}

function BreakdownLine({ label, subLabel, value }: {
  label: string;
  subLabel?: string;
  value: number | null;
}) {
  let valueColor = 'text-muted-foreground';
  let valueText = '—';

  if (value !== null) {
    if (value > 0) {
      valueColor = 'text-rating-up';
      valueText = `+${value}`;
    } else if (value < 0) {
      valueColor = 'text-destructive';
      valueText = `${value}`;
    } else {
      valueText = '0';
    }
  }

  return (
    <div className="flex justify-between items-start text-sm">
      <div className="space-y-0">
        <span className="text-foreground/80">{label}</span>
        {subLabel && (
          <p className="text-xs text-muted-foreground">{subLabel}</p>
        )}
      </div>
      <span className={`font-mono font-medium ${valueColor} flex-shrink-0 ml-4`}>
        {valueText}
      </span>
    </div>
  );
}
