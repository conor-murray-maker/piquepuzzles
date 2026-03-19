import { motion } from 'framer-motion';
import { KlondikeState } from '@/game/types';
import { calculateRatingChange, getPerformancePercentile } from '@/game/rating';
import { PuzzleIQBadge, RatingChange, TierProgress } from './PuzzleIQBadge';
import { Button } from '@/components/ui/button';
import { Trophy, Target, Timer, Hash, Lightbulb, Undo2, TrendingUp, ArrowLeft } from 'lucide-react';

interface PostGameScreenProps {
  gameState: KlondikeState;
  currentRating: number;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

export function PostGameScreen({ gameState, currentRating, onPlayAgain, onGoHome }: PostGameScreenProps) {
  const timeSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);
  const ratingChange = calculateRatingChange(currentRating, {
    won: gameState.isWon,
    moves: gameState.moves,
    timeSeconds,
    hintsUsed: gameState.hintsUsed,
    undosUsed: gameState.undosUsed,
    difficultyScore: gameState.difficultyScore,
    difficulty: gameState.difficulty,
  });
  const newRating = Math.max(0, currentRating + ratingChange);
  const percentile = gameState.isWon
    ? getPerformancePercentile(gameState.moves, timeSeconds, gameState.difficulty)
    : 0;

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

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
        {/* Header */}
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

        {/* Rating */}
        <div className="text-center space-y-3 py-4 border-y border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Puzzle IQ</p>
          <PuzzleIQBadge rating={newRating} size="lg" />
          <RatingChange change={ratingChange} />
          <TierProgress rating={newRating} />
        </div>

        {/* Stats */}
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

        {/* Percentile */}
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

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onGoHome} className="flex-1">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Home
          </Button>
          <Button onClick={onPlayAgain} className="flex-1">
            Play Again
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
