import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KlondikeState, DrawMode } from '@/game/types';
import { GameBoard, clearStorage } from '@/components/game/GameBoard';
import { PostGameScreen } from '@/components/game/PostGameScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useGamePersistence } from '@/hooks/useGamePersistence';

interface PlayProps {
  onActiveGameChange?: (active: boolean) => void;
}

export default function Play({ onActiveGameChange }: PlayProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { saveGameResult } = useGamePersistence();
  const [gamePhase, setGamePhase] = useState<'playing' | 'postgame'>('playing');
  const [lastGameState, setLastGameState] = useState<KlondikeState | null>(null);
  const [ratingResult, setRatingResult] = useState<{ newRating: number; ratingChange: number } | null>(null);
  const [gameKey, setGameKey] = useState(0);

  // Notify parent about game phase
  const setPhase = useCallback((phase: 'playing' | 'postgame') => {
    setGamePhase(phase);
    onActiveGameChange?.(phase === 'playing');
  }, [onActiveGameChange]);

  const handleGameEnd = useCallback(async (state: KlondikeState) => {
    setLastGameState(state);
    const result = await saveGameResult(state);
    setRatingResult(result);
    setPhase('postgame');
  }, [saveGameResult, setPhase]);

  const handleGiveUp = useCallback(async (state: KlondikeState) => {
    // Record as loss
    const lostState: KlondikeState = { ...state, isWon: false };
    setLastGameState(lostState);
    const result = await saveGameResult(lostState);
    setRatingResult(result);
    clearStorage();
    setPhase('postgame');
  }, [saveGameResult, setPhase]);

  const handlePlayAgain = useCallback(() => {
    setPhase('playing');
    setLastGameState(null);
    setRatingResult(null);
    setGameKey(k => k + 1);
  }, [setPhase]);

  if (gamePhase === 'postgame' && lastGameState) {
    return (
      <PostGameScreen
        gameState={lastGameState}
        currentRating={ratingResult?.newRating ?? profile?.rating ?? 1000}
        ratingChange={ratingResult?.ratingChange ?? 0}
        onPlayAgain={handlePlayAgain}
        onGoHome={() => navigate('/')}
      />
    );
  }

  return <GameBoard key={gameKey} onGameEnd={handleGameEnd} onGiveUp={handleGiveUp} drawMode={3} />;
}
