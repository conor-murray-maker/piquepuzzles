import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KlondikeState, FreeCellState, GameMode, DrawMode } from '@/game/types';
import { GameBoard, clearStorage } from '@/components/game/GameBoard';
import { FreeCellBoard, clearFreeCellStorage } from '@/components/game/FreeCellBoard';
import { RealmBoard, clearRealmStorage } from '@/components/game/RealmBoard';
import { PostGameScreen } from '@/components/game/PostGameScreen';
import { DailyChallengeResultScreen } from '@/components/game/DailyChallengeResultScreen';
import { CompletingScreen } from '@/components/game/CompletingScreen';
import { RealmTutorial } from '@/components/onboarding/RealmTutorial';
import { IQRevealOverlay } from '@/components/onboarding/IQRevealOverlay';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useGamePersistence, GameResult } from '@/hooks/useGamePersistence';
import { useDealQueue, QueuedDeal } from '@/hooks/useDealQueue';
import { ChallengeService } from '@/services/ChallengeService';
import { PiqueLoader } from '@/components/PiqueLoader';
import { ddsToLabel } from '@/lib/format';
import { setDailyCompleted, setDailyCompletedByDeal, isDailyCompletedByDeal } from '@/lib/dailyCompletionFlag';

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
  const isOnboarding = searchParams.get('onboarding') === 'true';
  const isTestMode = searchParams.get('testMode') === 'true';
  const initialSeed = seedParam ? parseInt(seedParam) : undefined;
  const drawMode = (drawModeParam ? parseInt(drawModeParam) : 3) as DrawMode;

  const { user, profile, refreshProfile } = useAuth();
  const { saveGameResult } = useGamePersistence();
  const { popNextDeal } = useDealQueue();
  const onboarding = useOnboarding();
  const [gamePhase, setGamePhase] = useState<'playing' | 'completing' | 'postgame'>('playing');
  const [completingResultType, setCompletingResultType] = useState<'win' | 'loss' | 'giveup'>('win');
  const [queuedDeal, setQueuedDeal] = useState<QueuedDeal | null>(null);
  const [loading, setLoading] = useState(initialSeed === undefined);
  const [showRealmTutorial, setShowRealmTutorial] = useState(isOnboarding && gameMode === 'realm');
  const [showIQReveal, setShowIQReveal] = useState(false);
  const [revealIQ, setRevealIQ] = useState(1000);
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
  const popInFlight = useRef(false);
  const gameEndInFlight = useRef(false);

  // Redirect if daily challenge already completed
  useEffect(() => {
    if (dailyDealId && user) {
      if (isDailyCompletedByDeal(dailyDealId, user.id)) {
        navigate('/daily', { replace: true });
      }
    }
  }, [dailyDealId, user, navigate]);

  // Pop deal from pool on mount (only for regular games, not challenges/daily)
  useEffect(() => {
    if (initialSeed !== undefined || hasPopped.current || popInFlight.current) {
      if (initialSeed !== undefined) setLoading(false);
      return;
    }
    hasPopped.current = true;
    popInFlight.current = true;
    popNextDeal(gameMode, drawMode).then(deal => {
      if (deal) setQueuedDeal(deal);
    }).catch(() => {}).finally(() => {
      popInFlight.current = false;
      setLoading(false);
    });
  }, [gameMode, drawMode, initialSeed, popNextDeal]);

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

  const setPhase = useCallback((phase: 'playing' | 'completing' | 'postgame') => {
    setGamePhase(phase);
    onActiveGameChange?.(phase === 'playing' || phase === 'completing');
  }, [onActiveGameChange]);

  const handleGameEnd = useCallback(async (state: KlondikeState | FreeCellState, elapsedSeconds: number) => {
    if (gameEndInFlight.current) return;
    gameEndInFlight.current = true;
    const seed = (state as any).seed as number | undefined;
    const dealUuid = (state as any).dealUuid as string | undefined;
    const resultType = state.isWon ? 'win' : 'loss';

    // Enter completing phase after brief delay for transition
    setCompletingResultType(resultType);
    await new Promise(r => setTimeout(r, 100));
    setPhase('completing');
    const completingStart = Date.now();

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

    let result: GameResult | null = null;

    if (isTestMode) {
      // Simulate a fake rating result without touching DB
      const fakeRating = state.isWon ? 1020 + Math.floor(Math.random() * 30) : 985 + Math.floor(Math.random() * 15);
      result = {
        newRating: fakeRating,
        previousRating: 1000,
        ratingChange: fakeRating - 1000,
      } as GameResult;
      setRatingResult(result);
    } else {
      const previousRating = profile?.rating ?? 1000;
      const isDaily = !!dailyDate;
      result = await saveGameResult(state, gameMode, elapsedSeconds, drawMode, dealUuid, isDaily);
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

      // Save daily challenge completion + set localStorage flag
      if (dailyDate && dailyDealId && user) {
        setDailyCompletedByDeal(dailyDealId, user.id);
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

      void refreshProfile();

      // Mark onboarding complete on first game
      if (isOnboarding) {
        void onboarding.markOnboardingComplete();
        void onboarding.markModeComplete(gameMode);
      }
    }

    // Show IQ reveal on first game completion
    const isFirstGame = isOnboarding || (profile?.games_played === 0);
    if (isFirstGame && result) {
      setRevealIQ(result.newRating);
      // Ensure minimum 800ms completing screen, then show IQ reveal
      const elapsed = Date.now() - completingStart;
      const remaining = Math.max(0, 800 - elapsed);
      setTimeout(() => {
        setPhase('completing'); // keep completing phase during IQ reveal
        setShowIQReveal(true);
      }, remaining);
      return;
    }

    // Ensure minimum 800ms display of completing screen
    const elapsed = Date.now() - completingStart;
    const remaining = Math.max(0, 800 - elapsed);
    setTimeout(() => setPhase('postgame'), remaining);
  }, [saveGameResult, setPhase, gameMode, challengeId, user, profile, dailyDate, dailyDealId, drawMode, refreshProfile, isOnboarding, isTestMode, onboarding]);

  const handleGiveUp = useCallback(async (state: KlondikeState | FreeCellState, elapsedSeconds: number) => {
    if (gameEndInFlight.current) return;
    gameEndInFlight.current = true;
    const lostState = { ...state, isWon: false };
    const seed = (state as any).seed as number | undefined;
    const dealUuid = (state as any).dealUuid as string | undefined;

    // Enter completing phase after brief delay for transition
    setCompletingResultType('giveup');
    await new Promise(r => setTimeout(r, 100));
    setPhase('completing');
    const completingStart = Date.now();

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

    if (isTestMode) {
      const fakeRating = 985 + Math.floor(Math.random() * 15);
      setRatingResult({
        newRating: fakeRating,
        previousRating: 1000,
        ratingChange: fakeRating - 1000,
      } as GameResult);
    } else {
      const isDaily = !!dailyDate;
      const result = await saveGameResult(lostState as any, gameMode, elapsedSeconds, drawMode, dealUuid, isDaily);
      setRatingResult(result);

      // Save daily challenge completion on give up + set localStorage flag
      if (dailyDate && dailyDealId && user) {
        setDailyCompletedByDeal(dailyDealId, user.id);
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

      void refreshProfile();
    }

    if (gameMode === 'realm') clearRealmStorage();
    else if (gameMode === 'freecell') clearFreeCellStorage();
    else clearStorage();

    // Ensure minimum 800ms display
    const elapsed = Date.now() - completingStart;
    const remaining = Math.max(0, 800 - elapsed);
    setTimeout(() => setPhase('postgame'), remaining);
  }, [saveGameResult, setPhase, gameMode, dailyDate, dailyDealId, user, drawMode, refreshProfile, isTestMode]);

  const handlePlayAgain = useCallback(async () => {
    gameEndInFlight.current = false;
    if (gameMode === 'realm') clearRealmStorage();
    else if (gameMode === 'freecell') clearFreeCellStorage();
    else clearStorage();

    setLastResult(null);
    setRatingResult(null);
    setChallengeData(null);
    setQueuedDeal(null);
    setLoading(true);

    if (challengeId || dailyDate) {
      navigate(`/play?mode=${gameMode}`, { replace: true });
      return;
    }

    // Pop next deal from pool
    const deal = await popNextDeal(gameMode, drawMode);
    if (deal) setQueuedDeal(deal);

    setLoading(false);
    setGameKey(k => k + 1);
    setPhase('playing');
  }, [setPhase, challengeId, dailyDate, gameMode, navigate, popNextDeal, drawMode]);

  const handleReconstructionFailed = useCallback(async () => {
    console.warn('[Play] Realm reconstruction failed — serving next deal');
    setQueuedDeal(null);
    setLoading(true);
    const deal = await popNextDeal(gameMode, drawMode);
    if (deal) setQueuedDeal(deal);
    setLoading(false);
    setGameKey(k => k + 1);
  }, [popNextDeal, gameMode, drawMode]);

  // Show loading while fetching deal from pool
  if (loading) {
    return <PiqueLoader variant="fullscreen" message="Finding your next puzzle..." />;
  }

  if (gamePhase === 'completing') {
    if (showIQReveal) {
      return (
        <IQRevealOverlay
          targetIQ={revealIQ}
          onComplete={() => {
            setShowIQReveal(false);
            setPhase('postgame');
          }}
        />
      );
    }
    return <CompletingScreen resultType={completingResultType} />;
  }

  if (gamePhase === 'postgame' && lastResult) {
    const isDaily = !!dailyDate;

    // Daily challenge gets its own result screen
    if (isDaily && dailyDate && dailyDealId) {
      const dailyDifficulty = lastResult.difficulty || 'Medium';
      return (
        <DailyChallengeResultScreen
          won={lastResult.won}
          moves={lastResult.moves}
          elapsedSeconds={lastResult.elapsedSeconds}
          hintsUsed={lastResult.hintsUsed}
          gameMode={gameMode}
          difficulty={dailyDifficulty}
          dailyDate={dailyDate}
          dailyDealId={dailyDealId}
          ratingResult={ratingResult}
          onPlayAgain={() => {
            gameEndInFlight.current = false;
            setGamePhase('playing');
            setLastResult(null);
            setRatingResult(null);
            setQueuedDeal(null);
            navigate(`/play?mode=${gameMode}&t=${Date.now()}`, { replace: true });
          }}
          onGoHome={() => navigate('/')}
        />
      );
    }

    const fakeState = {
      isWon: lastResult.won,
      moves: lastResult.moves,
      difficulty: lastResult.difficulty as any,
      hintsUsed: lastResult.hintsUsed,
      undosUsed: lastResult.undosUsed,
      difficultyScore: lastResult.difficultyScore,
      startTime: lastResult.startTime,
    } as KlondikeState;

    const handleTestModeHome = () => {
      if (isTestMode) {
        localStorage.removeItem('pique-guest-mode');
        clearRealmStorage();
      }
      navigate(isTestMode ? '/landing' : '/');
    };

    return (
      <PostGameScreen
        gameState={fakeState}
        currentRating={ratingResult?.newRating ?? profile?.rating ?? 1000}
        previousRating={ratingResult?.previousRating}
        ratingChange={ratingResult?.ratingChange ?? 0}
        onPlayAgain={isTestMode ? handleTestModeHome : handlePlayAgain}
        onGoHome={handleTestModeHome}
        elapsedSeconds={lastResult.elapsedSeconds}
        gameMode={gameMode}
        dealSeed={lastResult.seed}
        drawMode={drawMode}
        challengeData={challengeData}
        streakUpdate={ratingResult?.streakUpdate}
        breakdown={ratingResult?.breakdown}
        modeIQData={ratingResult?.modeIQData}
      />
    );
  }

  const effectiveSeed = initialSeed ?? queuedDeal?.seed;
  const effectiveDealUuid = queuedDeal?.dealUuid;

  if (gameMode === 'realm') {
    if (showRealmTutorial) {
      return (
        <RealmTutorial
          onComplete={() => setShowRealmTutorial(false)}
          onDismiss={() => setShowRealmTutorial(false)}
        />
      );
    }
    return (
      <RealmBoard
        key={gameKey}
        onGameEnd={handleGameEnd as any}
        onGiveUp={handleGiveUp as any}
        initialSeed={effectiveSeed}
        dealUuid={effectiveDealUuid}
        gridSize={isOnboarding ? 5 : queuedDeal?.minMoves}
        isOnboarding={isOnboarding}
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
