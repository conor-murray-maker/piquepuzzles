import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KlondikeState, FreeCellState, GameMode } from '@/game/types';
import { GameBoard, clearStorage } from '@/components/game/GameBoard';
import { FreeCellBoard, clearFreeCellStorage } from '@/components/game/FreeCellBoard';
import { PostGameScreen } from '@/components/game/PostGameScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useGamePersistence } from '@/hooks/useGamePersistence';

interface PlayProps {
  onActiveGameChange?: (active: boolean) => void;
}

export default function Play({ onActiveGameChange }: PlayProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gameMode = (searchParams.get('mode') as GameMode) || 'klondike';
  const { profile } = useAuth();
  const { saveGameResult } = useGamePersistence();
  const [gamePhase, setGamePhase] = useState<'playing' | 'postgame'>('playing');
  const [lastResult, setLastResult] = useState<{ won: boolean; moves: number; difficulty: string; hintsUsed: number; undosUsed: number; difficultyScore: number; startTime: number } | null>(null);
  const [ratingResult, setRatingResult] = useState<{ newRating: number; ratingChange: number } | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const setPhase = useCallback((phase: 'playing' | 'postgame') => {
    setGamePhase(phase);
    onActiveGameChange?.(phase === 'playing');
  }, [onActiveGameChange]);

  const handleGameEnd = useCallback(async (state: KlondikeState | FreeCellState) => {
    setLastResult({
      won: state.isWon,
      moves: state.moves,
      difficulty: state.difficulty,
      hintsUsed: state.hintsUsed,
      undosUsed: state.undosUsed,
      difficultyScore: state.difficultyScore,
      startTime: state.startTime,
    });
    const result = await saveGameResult(state, gameMode);
    setRatingResult(result);
    setPhase('postgame');
  }, [saveGameResult, setPhase, gameMode]);

  const handleGiveUp = useCallback(async (state: KlondikeState | FreeCellState) => {
    const lostState = { ...state, isWon: false };
    setLastResult({
      won: false,
      moves: state.moves,
      difficulty: state.difficulty,
      hintsUsed: state.hintsUsed,
      undosUsed: state.undosUsed,
      difficultyScore: state.difficultyScore,
      startTime: state.startTime,
    });
    const result = await saveGameResult(lostState as any, gameMode);
    setRatingResult(result);
    if (gameMode === 'freecell') clearFreeCellStorage();
    else clearStorage();
    setPhase('postgame');
  }, [saveGameResult, setPhase, gameMode]);

  const handlePlayAgain = useCallback(() => {
    setPhase('playing');
    setLastResult(null);
    setRatingResult(null);
    setGameKey(k => k + 1);
  }, [setPhase]);

  if (gamePhase === 'postgame' && lastResult) {
    // Create a minimal state-like object for PostGameScreen
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
        ratingChange={ratingResult?.ratingChange ?? 0}
        onPlayAgain={handlePlayAgain}
        onGoHome={() => navigate('/')}
      />
    );
  }

  if (gameMode === 'freecell') {
    return <FreeCellBoard key={gameKey} onGameEnd={handleGameEnd} onGiveUp={handleGiveUp} />;
  }

  return <GameBoard key={gameKey} onGameEnd={handleGameEnd} onGiveUp={handleGiveUp} drawMode={3} />;
}
