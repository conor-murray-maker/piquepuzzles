import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KlondikeState } from '@/game/types';
import { GameBoard } from '@/components/game/GameBoard';
import { PostGameScreen } from '@/components/game/PostGameScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useGamePersistence } from '@/hooks/useGamePersistence';

export default function Play() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { saveGameResult } = useGamePersistence();
  const [gamePhase, setGamePhase] = useState<'playing' | 'postgame'>('playing');
  const [lastGameState, setLastGameState] = useState<KlondikeState | null>(null);
  const [ratingResult, setRatingResult] = useState<{ newRating: number; ratingChange: number } | null>(null);

  const handleGameEnd = useCallback(async (state: KlondikeState) => {
    setLastGameState(state);
    const result = await saveGameResult(state);
    setRatingResult(result);
    setGamePhase('postgame');
  }, [saveGameResult]);

  const handlePlayAgain = useCallback(() => {
    setGamePhase('playing');
    setLastGameState(null);
    setRatingResult(null);
  }, []);

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

  return <GameBoard onGameEnd={handleGameEnd} />;
}
