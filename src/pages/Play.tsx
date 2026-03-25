import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KlondikeState, FreeCellState, GameMode, DrawMode } from '@/game/types';
import { GameBoard, clearStorage } from '@/components/game/GameBoard';
import { FreeCellBoard, clearFreeCellStorage } from '@/components/game/FreeCellBoard';
import { RealmBoard, clearRealmStorage } from '@/components/game/RealmBoard';
import { PostGameScreen } from '@/components/game/PostGameScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useGamePersistence, GameResult } from '@/hooks/useGamePersistence';
import { useDealQueue, QueuedDeal } from '@/hooks/useDealQueue';
import { ChallengeService } from '@/services/ChallengeService';

interface PlayProps {
  onActiveGameChange?: (active: boolean) => void;
}

export default function Play({ onActiveGameChange }: PlayProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gameMode = (searchParams.get('mode') as GameMode) || 'klondike';
  const seedParam = searchParams.get('seed');
  const challengeId = searchParams.get('challengeId');
  const drawModeParam = searchParams.get('drawMode');
  const dailyDate = searchParams.get('daily');
  const dailyDealId = searchParams.get('dailyDealId');
  const initialSeed = seedParam ? parseInt(seedParam) : undefined;
  const drawMode = (drawModeParam ? parseInt(drawModeParam) : 3) as DrawMode;

  const { user, profile } = useAuth();
  const { saveGameResult } = useGamePersistence();
  const { popNextDeal, refillQueue } = useDealQueue();
  const [gamePhase, setGamePhase] = useState<'playing' | 'postgame'>('playing');
  const [queuedDeal, setQueuedDeal] = useState<QueuedDeal | null>(null);
  const [lastResult, setLastResult] = useState<{
    won: boolean; moves: number; difficulty: string; hintsUsed: number;
    undosUsed: number; difficultyScore: number; startTime: number; elapsedSeconds: number;
    seed?: number;
  } | null>(null);
  const [ratingResult, setRatingResult] = useState<GameResult | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [challengeData, setChallengeData] = useState<{
    challengeId: string;
    challengerName: string;
    challengerMoves: number;
    challengerTime: number;
    challengerRating: number;
  } | null>(null);
  const hasPopped = useRef(false);

  // Pop deal from queue on mount (only for regular games, not challenges/daily)
  useEffect(() => {
    if (initialSeed !== undefined || hasPopped.current) return;
    hasPopped.current = true;
    popNextDeal(gameMode, drawMode).then(deal => {
      if (deal) {
        setQueuedDeal(deal);
      }
    }).catch(() => { /* queue pop failed — will fall back to direct generation */ });
  }, [gameMode, drawMode, initialSeed, popNextDeal]);

  // Refill queue in background on mount
  useEffect(() => {
    if (initialSeed !== undefined) return;
    refillQueue(gameMode, drawMode);
  }, [gameMode, drawMode, initialSeed, refillQueue]);

  // Fetch challenge data
  useEffect(() => {
    if (!challengeId) return;
    ChallengeService.getChallenge(challengeId).then(data => {
      if (data) {
        setChallengeData({
          challengeId,
          challengerName: data.challenger_display_name || 'Anonymous',
          challengerMoves: data.challenger_moves,
          challengerTime: data.challenger_time_seconds,
          challengerRating: data.challenger_rating,
        });
      }
    });
  }, [challengeId]);

  const setPhase = useCallback((phase: 'playing' | 'postgame') => {
    setGamePhase(phase);
    onActiveGameChange?.(phase === 'playing');
  }, [onActiveGameChange]);

  const handleGameEnd = useCallback(async (state: KlondikeState | FreeCellState, elapsedSeconds: number) => {
    const seed = (state as any).seed as number | undefined;
    const dealUuid = (state as any).dealUuid as string | undefined;
    setLastResult({
      won: state.isWon,
      moves: state.moves,
      difficulty: state.difficulty,
      hintsUsed: state.hintsUsed,
      undosUsed: state.undosUsed,
      difficultyScore: state.difficultyScore,
      startTime: state.startTime,
      elapsedSeconds,
      seed,
    });
    const previousRating = profile?.rating ?? 1000;
    const isDaily = !!dailyDate;
    const result = await saveGameResult(state, gameMode, elapsedSeconds, drawMode, dealUuid, isDaily);
    setRatingResult(result);

    // Save challenge completion
    if (challengeId && user) {
      await ChallengeService.saveCompletion({
        challengeId,
        userId: user.id,
        displayName: profile?.display_name || null,
        moves: state.moves,
        timeSeconds: elapsedSeconds,
        rating: result?.newRating ?? previousRating,
        ratingChange: result?.ratingChange ?? 0,
        won: state.isWon,
      });
    }

    // Save daily challenge completion
    if (dailyDate && dailyDealId && user) {
      await ChallengeService.saveDailyCompletion({
        userId: user.id,
        date: dailyDate,
        dealId: dailyDealId,
        result: state.isWon ? 'win' : 'loss',
        actualMoves: state.moves,
        actualTime: elapsedSeconds,
        hintsUsed: state.hintsUsed,
        finalDelta: result?.ratingChange ?? 0,
      });
    }

    // Refill queue in background after game
    if (!initialSeed) {
      refillQueue(gameMode, drawMode);
    }

    setPhase('postgame');
  }, [saveGameResult, setPhase, gameMode, challengeId, user, profile, dailyDate, dailyDealId, drawMode, initialSeed, refillQueue]);

  const handleGiveUp = useCallback(async (state: KlondikeState | FreeCellState, elapsedSeconds: number) => {
    const lostState = { ...state, isWon: false };
    const seed = (state as any).seed as number | undefined;
    const dealUuid = (state as any).dealUuid as string | undefined;
    setLastResult({
      won: false,
      moves: state.moves,
      difficulty: state.difficulty,
      hintsUsed: state.hintsUsed,
      undosUsed: state.undosUsed,
      difficultyScore: state.difficultyScore,
      startTime: state.startTime,
      elapsedSeconds,
      seed,
    });
    const previousRating = profile?.rating ?? 1000;
    const isDaily = !!dailyDate;
    const result = await saveGameResult(lostState as any, gameMode, elapsedSeconds, drawMode, dealUuid, isDaily);
    setRatingResult(result);

    // Save daily challenge completion on give up
    if (dailyDate && dailyDealId && user) {
      await ChallengeService.saveDailyCompletion({
        userId: user.id,
        date: dailyDate,
        dealId: dailyDealId,
        result: 'loss',
        actualMoves: state.moves,
        actualTime: elapsedSeconds,
        hintsUsed: state.hintsUsed,
        finalDelta: result?.ratingChange ?? 0,
      });
    }

    if (gameMode === 'realm') clearRealmStorage();
    else if (gameMode === 'freecell') clearFreeCellStorage();
    else clearStorage();

    // Refill queue in background
    if (!initialSeed) {
      refillQueue(gameMode, drawMode);
    }

    setPhase('postgame');
  }, [saveGameResult, setPhase, gameMode, profile, dailyDate, dailyDealId, user, drawMode, initialSeed, refillQueue]);

  const handlePlayAgain = useCallback(async () => {
    // Clear all game storage before requesting new deal
    if (gameMode === 'realm') clearRealmStorage();
    else if (gameMode === 'freecell') clearFreeCellStorage();
    else clearStorage();

    setLastResult(null);
    setRatingResult(null);
    setChallengeData(null);
    setQueuedDeal(null);

    if (challengeId || dailyDate) {
      navigate(`/play?mode=${gameMode}`, { replace: true });
      return;
    }

    // Pop next deal from queue for the new game
    const deal = await popNextDeal(gameMode, drawMode);
    if (deal) {
      setQueuedDeal(deal);
    }

    setGameKey(k => k + 1);
    setPhase('playing');
  }, [setPhase, challengeId, dailyDate, gameMode, navigate, popNextDeal, drawMode]);

  if (gamePhase === 'postgame' && lastResult) {
    const fakeState = {
      isWon: lastResult.won,
      moves: lastResult.moves,
      difficulty: lastResult.difficulty as any,
      hintsUsed: lastResult.hintsUsed,
      undosUsed: lastResult.undosUsed,
      difficultyScore: lastResult.difficultyScore,
      startTime: lastResult.startTime,
    } as KlondikeState;

    return (
      <PostGameScreen
        gameState={fakeState}
        currentRating={ratingResult?.newRating ?? profile?.rating ?? 1000}
        previousRating={ratingResult?.previousRating}
        ratingChange={ratingResult?.ratingChange ?? 0}
        onPlayAgain={handlePlayAgain}
        onGoHome={() => navigate('/')}
        elapsedSeconds={lastResult.elapsedSeconds}
        gameMode={gameMode}
        dealSeed={lastResult.seed}
        drawMode={drawMode}
        challengeData={challengeData}
        streakUpdate={ratingResult?.streakUpdate}
        breakdown={ratingResult?.breakdown}
      />
    );
  }

  // Determine seed and dealUuid to pass to game board
  const effectiveSeed = initialSeed ?? queuedDeal?.seed;
  const effectiveDealUuid = queuedDeal?.dealUuid;

  if (gameMode === 'realm') {
    return (
      <RealmBoard
        key={gameKey}
        onGameEnd={handleGameEnd as any}
        onGiveUp={handleGiveUp as any}
        initialSeed={effectiveSeed}
        dealUuid={effectiveDealUuid}
      />
    );
  }

  if (gameMode === 'freecell') {
    return (
      <FreeCellBoard
        key={gameKey}
        onGameEnd={handleGameEnd}
        onGiveUp={handleGiveUp}
        initialSeed={effectiveSeed}
        dealUuid={effectiveDealUuid}
      />
    );
  }

  return (
    <GameBoard
      key={gameKey}
      onGameEnd={handleGameEnd}
      onGiveUp={handleGiveUp}
      drawMode={drawMode}
      initialSeed={effectiveSeed}
      dealUuid={effectiveDealUuid}
    />
  );
}
