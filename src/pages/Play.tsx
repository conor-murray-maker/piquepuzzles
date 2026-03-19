import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KlondikeState } from '@/game/types';
import { GameBoard } from '@/components/game/GameBoard';
import { PostGameScreen } from '@/components/game/PostGameScreen';

export default function Play() {
  const navigate = useNavigate();
  const [gamePhase, setGamePhase] = useState<'playing' | 'postgame'>('playing');
  const [lastGameState, setLastGameState] = useState<KlondikeState | null>(null);
  const [rating, setRating] = useState(() => {
    const saved = localStorage.getItem('pique-rating');
    return saved ? parseInt(saved, 10) : 1000;
  });

  const handleGameEnd = useCallback((state: KlondikeState) => {
    setLastGameState(state);
    setGamePhase('postgame');
  }, []);

  const handlePlayAgain = useCallback(() => {
    setGamePhase('playing');
    setLastGameState(null);
  }, []);

  if (gamePhase === 'postgame' && lastGameState) {
    return (
      <PostGameScreen
        gameState={lastGameState}
        currentRating={rating}
        onPlayAgain={handlePlayAgain}
        onGoHome={() => navigate('/')}
      />
    );
  }

  return <GameBoard onGameEnd={handleGameEnd} />;
}
