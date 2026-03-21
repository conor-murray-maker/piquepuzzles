import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { KlondikeState } from '@/game/types';
import { getPerformancePercentile } from '@/game/rating';
import { PuzzleIQBadge, RatingChange } from './PuzzleIQBadge';
import { TierProgressBar } from './TierProgressBar';
import { Button } from '@/components/ui/button';
import { Trophy, Target, Timer, Hash, Lightbulb, Undo2, TrendingUp, ArrowLeft, Swords } from 'lucide-react';
import { ChallengeService } from '@/services/ChallengeService';
import { formatTimeRaw } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
}

export function PostGameScreen({
  gameState, currentRating, previousRating, ratingChange, onPlayAgain, onGoHome, elapsedSeconds,
  gameMode = 'klondike', dealSeed, drawMode = 3, challengeData,
}: PostGameScreenProps) {
  const { user, profile } = useAuth();
  const [sharing, setSharing] = useState(false);
  const timeSeconds = elapsedSeconds;
  const percentile = gameState.isWon
    ? getPerformancePercentile(gameState.moves, timeSeconds, gameState.difficulty)
    : 0;

  const formatTime = formatTimeRaw;

  const handleChallenge = useCallback(async () => {
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

  return (
    <motion.div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
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

        {/* Challenge comparison */}
        {isChallenge && challengeData && (
          <motion.div
            className="bg-secondary/50 rounded-xl p-4 space-y-3"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Swords className="w-4 h-4 text-primary" />
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

        {gameState.isWon && percentile > 0 && (
          <motion.div
            className="bg-primary/10 rounded-xl p-3 text-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                Better than <span className="text-primary font-bold">{percentile}%</span> of players
              </span>
            </div>
          </motion.div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onGoHome} className="flex-1">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Home
          </Button>
          <Button onClick={onPlayAgain} className="flex-1">
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
            <Swords className="w-4 h-4 mr-2" />
            Challenge a Friend
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}
