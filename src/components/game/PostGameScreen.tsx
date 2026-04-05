import { useState, useCallback, useEffect } from 'react';
import { haptic } from '@/lib/haptics';
import { StreakMilestoneModal } from './StreakMilestoneModal';
import { motion } from 'framer-motion';
import { KlondikeState, getTier, RATING_TIERS } from '@/game/types';
import { Button } from '@/components/ui/button';
import { Trophy, Target, Timer, Hash, Lightbulb, Undo2, ArrowLeft, Share2, Info } from 'lucide-react';
import { ChallengeService } from '@/services/ChallengeService';
import { formatTimeRaw } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ScoreBreakdownData, ModeIQData } from '@/hooks/useGamePersistence';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const TIER_COLORS: Record<string, string> = {
  bronze: 'hsl(25, 60%, 50%)',
  silver: 'hsl(225, 3%, 67%)',
  gold: 'hsl(42, 100%, 50%)',
  platinum: 'hsl(214, 58%, 57%)',
  elite: 'hsl(270, 58%, 47%)',
  master: 'hsl(4, 66%, 48%)',
  grandmaster: 'hsl(45, 100%, 50%)',
};

const GM_SHIMMER_GRADIENT = 'linear-gradient(135deg, #B8860B 0%, #FFD700 35%, #FFF8DC 55%, #FFD700 75%, #B8860B 100%)';

const gmShimmerStyle: React.CSSProperties = {
  background: GM_SHIMMER_GRADIENT,
  backgroundSize: '200% 100%',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  animation: 'gm-shimmer 3s linear infinite',
};

function MiniProgressBar({ rating, isGM }: { rating: number; isGM?: boolean }) {
  const tier = getTier(rating);
  const tierIndex = RATING_TIERS.findIndex(t => t.name === tier.name);
  const nextTier = RATING_TIERS[tierIndex + 1];
  const progress = nextTier
    ? ((rating - tier.min) / (nextTier.min - tier.min)) * 100
    : Math.min(100, ((rating - tier.min) / 250) * 100);

  return (
    <div
      className="h-1.5 rounded-full overflow-hidden w-full mt-2"
      style={{ backgroundColor: isGM ? '#1a1a1a' : undefined }}
    >
      <motion.div
        className={`h-full rounded-full ${!isGM ? '' : ''}`}
        style={isGM
          ? { background: GM_SHIMMER_GRADIENT, backgroundSize: '200% 100%', animation: 'gm-shimmer 3s linear infinite' }
          : { backgroundColor: TIER_COLORS[tier.color] || TIER_COLORS.bronze }
        }
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

function getModeLabel(gameMode: string): string {
  if (gameMode === 'freecell') return 'FreeCell';
  return gameMode.charAt(0).toUpperCase() + gameMode.slice(1);
}

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
  modeIQData?: ModeIQData | null;
}

export function PostGameScreen({
  gameState, currentRating, previousRating, ratingChange, onPlayAgain, onGoHome, elapsedSeconds,
  gameMode = 'klondike', dealSeed, drawMode = 3, challengeData, streakUpdate, breakdown, modeIQData,
}: PostGameScreenProps) {
  
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
        challengerId: user.id, dealSeed, gameMode, drawMode,
        difficulty: gameState.difficulty, moves: gameState.moves,
        timeSeconds, rating: currentRating, ratingChange,
        won: gameState.isWon, displayName: profile.display_name,
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

  // Render only mode-specific IQ here; do not fall back to composite Pique IQ.
  const displayModeIQ = modeIQData?.modeIQ ?? null;
  const displayModeIQDelta = modeIQData?.modeIQDelta ?? ratingChange;
  const modeTier = displayModeIQ !== null ? getTier(displayModeIQ) : null;
  const modeLabel = getModeLabel(gameMode);
  const isGM = modeTier?.color === 'grandmaster';

  // Dark prestige card styles for Grandmaster
  const gmCardStyle: React.CSSProperties | undefined = isGM ? {
    backgroundColor: '#0A0A0A',
    borderColor: '#2a2a2a',
    boxShadow: '0 0 40px rgba(255,215,0,0.08), 0 20px 60px rgba(0,0,0,0.6)',
  } : undefined;

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
        className={`rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6 ${isGM ? '' : 'bg-card border border-border'}`}
        style={isGM ? { ...gmCardStyle, border: '1px solid #2a2a2a' } : undefined}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 25 }}
      >
        {/* Header: result icon + difficulty */}
        <div className="text-center space-y-2">
          {gameState.isWon ? (
            <>
              <Trophy className={`w-10 h-10 mx-auto ${isGM ? '' : 'text-gold'}`} style={isGM ? { color: '#FFD700' } : undefined} />
              <h2 className={`text-2xl font-bold ${isGM ? 'text-white' : ''}`}>Victory!</h2>
            </>
          ) : (
            <>
              <Target className="w-10 h-10 text-muted-foreground mx-auto" />
              <h2 className={`text-2xl font-bold ${isGM ? 'text-white' : ''}`}>Game Over</h2>
            </>
          )}
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            gameState.difficulty === 'Easy' ? 'bg-rating-up/20 text-rating-up' :
            gameState.difficulty === 'Medium' ? 'bg-gold/20 text-gold' :
            gameState.difficulty === 'Hard' ? 'bg-destructive/20 text-destructive' :
            gameState.difficulty === 'Expert' ? 'bg-elite/20 text-elite' :
            gameState.difficulty === 'Master' ? 'bg-master/20 text-master' :
            'bg-grandmaster/20 text-grandmaster font-bold'
          }`}>
            {gameState.difficulty} Deal
          </span>
        </div>

        {/* Mode IQ display - primary focus */}
        <div
          className={`text-center space-y-2 py-4 ${isGM ? '' : 'border-y border-border'}`}
          style={isGM ? { borderTop: '1px solid #222', borderBottom: '1px solid #222', position: 'relative' } : undefined}
        >
          {/* GM ambient glow */}
          {isGM && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -60%)',
                width: 200,
                height: 200,
                background: 'radial-gradient(circle, rgba(255,215,0,0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
          )}
          <p className={`text-[11px] uppercase tracking-wider font-semibold ${isGM ? '' : 'text-muted-foreground'}`} style={isGM ? { color: '#666' } : undefined}>
            {modeLabel} IQ
          </p>
          <div className="flex items-baseline justify-center gap-2">
            <motion.span
              className={`text-5xl font-bold font-mono${displayModeIQ === null ? ' text-muted-foreground' : ''}`}
              style={isGM && displayModeIQ !== null ? gmShimmerStyle : (modeTier ? { color: TIER_COLORS[modeTier.color] } : undefined)}
              key={displayModeIQ ?? 'mode-iq-unavailable'}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {displayModeIQ ?? '—'}
            </motion.span>
            {displayModeIQ !== null && (
              <motion.span
                className={`font-mono font-semibold text-lg`}
                style={isGM
                  ? displayModeIQDelta > 0
                    ? { ...gmShimmerStyle, fontSize: '1.125rem' }
                    : displayModeIQDelta < 0
                      ? { color: '#ef4444', fontSize: '1.125rem' }
                      : { color: '#666', fontSize: '1.125rem' }
                  : undefined}
                initial={{ opacity: 0, y: displayModeIQDelta >= 0 ? 10 : -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {!isGM && <span className={displayModeIQDelta > 0 ? 'text-rating-up' : displayModeIQDelta < 0 ? 'text-rating-down' : ''} style={displayModeIQDelta === 0 ? { color: '#666' } : undefined}>
                  {displayModeIQDelta > 0 ? '+' : ''}{displayModeIQDelta}
                </span>}
                {isGM && <>{displayModeIQDelta > 0 ? '+' : ''}{displayModeIQDelta}</>}
              </motion.span>
            )}
          </div>
          {/* Tier badge */}
          {isGM ? (
            <span
              className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase"
              style={{
                background: GM_SHIMMER_GRADIENT,
                backgroundSize: '200% 100%',
                animation: 'gm-shimmer 3s linear infinite',
                color: '#0A0A0A',
                letterSpacing: '4px',
              }}
            >
              Grandmaster
            </span>
          ) : (
            <p
              className={`text-xs font-semibold uppercase tracking-wider${modeTier ? '' : ' text-muted-foreground'}`}
              style={modeTier ? { color: TIER_COLORS[modeTier.color] } : undefined}
            >
              {modeTier?.name ?? '—'}
            </p>
          )}
          {displayModeIQ !== null && <MiniProgressBar rating={displayModeIQ} isGM={isGM} />}
        </div>

        {/* Score Breakdown Card */}
        <ScoreBreakdownCard
          won={gameState.isWon}
          breakdown={breakdown}
          ratingChange={displayModeIQDelta}
          difficulty={gameState.difficulty}
          actualTime={timeSeconds}
          actualMoves={gameState.moves}
          gameMode={gameMode}
          piqueIQDelta={modeIQData?.puzzleIQDelta ?? null}
          isGM={isGM}
        />

        {/* Game stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Timer, label: 'Time', value: formatTime(timeSeconds) },
            { icon: Hash, label: 'Moves', value: gameState.moves },
            { icon: Lightbulb, label: 'Hints', value: gameState.hintsUsed },
            { icon: Undo2, label: 'Undos', value: gameState.undosUsed },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-xl p-4 ${isGM ? '' : 'stat-card'}`}
              style={isGM ? { backgroundColor: '#111', border: '1px solid #222' } : undefined}
            >
              <Icon className="w-4 h-4" style={isGM ? { color: '#666' } : undefined} />
              <div>
                <p className="text-xs" style={isGM ? { color: '#666' } : undefined}>{label}</p>
                <p className="font-mono font-semibold text-sm" style={isGM ? { color: '#888' } : undefined}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Challenge result */}
        {isChallenge && challengeData && (
          <motion.div
            className={`rounded-xl p-4 space-y-3 ${isGM ? '' : 'bg-secondary/50'}`}
            style={isGM ? { backgroundColor: '#111', border: '1px solid #222' } : undefined}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Share2 className="w-4 h-4 text-primary" />
              <span className={`text-sm font-semibold ${isGM ? 'text-white' : ''}`}>Challenge Result</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div></div>
              <div className="font-semibold" style={isGM ? { color: '#888' } : undefined}>You</div>
              <div className="font-semibold" style={isGM ? { color: '#888' } : undefined}>{challengeData.challengerName}</div>
              <div className="text-left" style={isGM ? { color: '#666' } : undefined}>Time</div>
              <div className="font-mono font-semibold" style={isGM ? { color: '#ccc' } : undefined}>{formatTime(timeSeconds)}</div>
              <div className="font-mono font-semibold" style={isGM ? { color: '#ccc' } : undefined}>{formatTime(challengeData.challengerTime)}</div>
              <div className="text-left" style={isGM ? { color: '#666' } : undefined}>Moves</div>
              <div className="font-mono font-semibold" style={isGM ? { color: '#ccc' } : undefined}>{gameState.moves}</div>
              <div className="font-mono font-semibold" style={isGM ? { color: '#ccc' } : undefined}>{challengeData.challengerMoves}</div>
            </div>
            {gameState.isWon && (
              <p className={`text-center text-sm font-semibold ${playerWonChallenge ? 'text-rating-up' : 'text-muted-foreground'}`}>
                {playerWonChallenge ? '🏆 You won the challenge!' : 'Challenger wins this round!'}
              </p>
            )}
          </motion.div>
        )}

        {/* Action buttons */}
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
          <Button variant="outline" onClick={handleChallenge} disabled={sharing} className="w-full">
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

function ScoreBreakdownCard({ won, breakdown, ratingChange, difficulty, actualTime, actualMoves, gameMode, piqueIQDelta, isGM }: {
  won: boolean;
  breakdown?: ScoreBreakdownData | null;
  ratingChange: number;
  difficulty: string;
  actualTime: number;
  actualMoves: number;
  gameMode: string;
  piqueIQDelta: number | null;
  isGM?: boolean;
}) {
  const bd = breakdown;
  const modeLabel = getModeLabel(gameMode);

  // Use server-provided breakdown items if available
  const serverItems = bd?.breakdownItems;

  if (!won) {
    const lossItems = serverItems ?? [
      { label: `${difficulty || 'Medium'} deal — not solved`, value: ratingChange },
    ];
    return (
      <motion.div
        className={`w-full rounded-xl p-4 space-y-3 ${isGM ? '' : 'border border-border bg-card'}`}
        style={isGM ? { backgroundColor: '#111', border: '1px solid #222' } : undefined}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={isGM ? { color: '#666' } : undefined}>
          {modeLabel} IQ Lost
        </p>
        {lossItems.map((item, i) => (
          <BreakdownLine key={i} label={item.label} value={item.value} isGM={isGM} />
        ))}
        <div style={isGM ? { borderTop: '1px solid #222', margin: '8px 0' } : undefined} className={isGM ? '' : 'border-t border-border my-2'} />
        <div className="flex justify-between items-center">
          <span className="font-bold" style={isGM ? { color: '#fff' } : undefined}>Total</span>
          <span className="font-bold text-lg text-destructive font-mono">{ratingChange}</span>
        </div>
        <PiqueIQImpactFooter delta={piqueIQDelta} isGM={isGM} />
      </motion.div>
    );
  }

  // Win breakdown — use server items if available, else construct from legacy fields
  const avgTime = bd?.dealAvgTime ?? null;
  const avgMoves = bd?.dealAvgMoves ?? null;

  const winItems: { label: string; subLabel?: string; value: number }[] = [];

  if (serverItems && serverItems.length > 0) {
    serverItems.forEach(item => {
      const sub = item.label.toLowerCase().includes('than expected')
        ? (item.label.toLowerCase().includes('time') || item.label.toLowerCase().includes('fast') || item.label.toLowerCase().includes('slow'))
          ? (avgTime !== null ? `${formatTimeRaw(actualTime)} vs ${formatTimeRaw(Math.round(avgTime))} avg` : undefined)
          : (item.label.toLowerCase().includes('move') || item.label.toLowerCase().includes('fewer') || item.label.toLowerCase().includes('more'))
            ? (avgMoves !== null ? `${actualMoves} vs ${Math.round(avgMoves)} avg` : undefined)
            : undefined
        : undefined;
      winItems.push({ label: item.label, subLabel: sub, value: item.value });
    });
  } else {
    const baseDelta = bd?.baseDelta ?? ratingChange;
    const timeBP = bd?.timeBonusPoints ?? 0;
    const moveBP = bd?.movesBonusPoints ?? 0;
    const hintPP = bd?.hintPenaltyPoints ?? 0;
    const undoPP = bd?.undoPenaltyPoints ?? 0;
    const hintsUsed = bd?.hintsUsed ?? 0;
    const undosUsed = bd?.undosUsed ?? 0;
    const isRealm = gameMode === 'realm';
    const diffLabel = difficulty || 'Medium';

    winItems.push({ label: `${diffLabel} deal won`, value: baseDelta });
    winItems.push({
      label: timeBP >= 0 ? 'Faster than expected' : 'Slower than expected',
      subLabel: avgTime !== null ? `${formatTimeRaw(actualTime)} vs ${formatTimeRaw(Math.round(avgTime))} avg` : undefined,
      value: timeBP,
    });
    if (!isRealm) {
      winItems.push({
        label: moveBP >= 0 ? 'Fewer moves than expected' : 'More moves than expected',
        subLabel: avgMoves !== null ? `${actualMoves} vs ${Math.round(avgMoves)} avg` : undefined,
        value: moveBP,
      });
    }
    if (isRealm) {
      winItems.push({
        label: undosUsed > 0 ? `Undos used × ${undosUsed}` : 'Undos',
        value: undosUsed > 0 ? -undoPP : 0,
      });
    }
    winItems.push({
      label: hintsUsed > 0 ? `Hints used × ${hintsUsed}` : 'Hints',
      value: hintsUsed > 0 ? -hintPP : 0,
    });
  }

  return (
    <motion.div
      className={`w-full rounded-xl p-4 space-y-2 ${isGM ? '' : 'border border-border bg-card'}`}
      style={isGM ? { backgroundColor: '#111', border: '1px solid #222' } : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={isGM ? { color: '#666' } : undefined}>
        {modeLabel} IQ Earned
      </p>

      {winItems.map((item, i) => (
        <BreakdownLine key={i} label={item.label} subLabel={item.subLabel} value={item.value} isGM={isGM} />
      ))}

      <div style={isGM ? { borderTop: '1px solid #222', margin: '8px 0' } : undefined} className={isGM ? '' : 'border-t border-border my-2'} />
      <div className="flex justify-between items-center">
        <span className="font-bold" style={isGM ? { color: '#fff' } : undefined}>Total</span>
        <span className={`font-bold text-lg font-mono ${ratingChange >= 0 ? 'text-rating-up' : 'text-destructive'}`}>
          {ratingChange > 0 ? '+' : ''}{ratingChange}
        </span>
      </div>
      <PiqueIQImpactFooter delta={piqueIQDelta} isGM={isGM} />
    </motion.div>
  );
}

function PiqueIQImpactFooter({ delta, isGM }: { delta: number | null; isGM?: boolean }) {
  if (delta === null) return null;
  return (
    <div className="flex items-center justify-between pt-1">
      <p className="text-xs" style={isGM ? { color: '#666' } : undefined}>
        Pique IQ impact {delta > 0 ? '+' : ''}{delta}
      </p>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <Info className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-xs">
            Pique IQ = average of all mode IQs. Unplayed modes count as 1000.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function BreakdownLine({ label, subLabel, value, isGM }: {
  label: string;
  subLabel?: string;
  value: number | null;
  isGM?: boolean;
}) {
  let valueColor = isGM ? '' : 'text-muted-foreground';
  let valueText = '—';
  let valueStyle: React.CSSProperties | undefined = isGM ? { color: '#888' } : undefined;

  if (value !== null) {
    if (value > 0) { valueColor = 'text-rating-up'; valueText = `+${value}`; valueStyle = undefined; }
    else if (value < 0) { valueColor = 'text-destructive'; valueText = `${value}`; valueStyle = undefined; }
    else { valueText = '0'; }
  }

  return (
    <div className="flex justify-between items-start text-sm">
      <div className="space-y-0">
        <span style={isGM ? { color: '#888' } : undefined} className={isGM ? '' : 'text-foreground/80'}>{label}</span>
        {subLabel && <p className="text-xs" style={isGM ? { color: '#555' } : undefined}>{subLabel}</p>}
      </div>
      <span className={`font-mono font-medium ${valueColor} flex-shrink-0 ml-4`} style={valueStyle}>{valueText}</span>
    </div>
  );
}
