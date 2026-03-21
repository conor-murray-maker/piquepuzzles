import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { ChallengeService, ChallengeData } from '@/services/ChallengeService';
import { formatTimeRaw } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Spade, Timer, Hash, User } from 'lucide-react';

export default function Challenge() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    ChallengeService.getChallenge(id).then(data => {
      setChallenge(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg font-semibold">Challenge not found</p>
          <Button className="mt-4" onClick={() => navigate('/')}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const handleAccept = () => {
    navigate(
      `/play?mode=${challenge.game_mode}&seed=${challenge.deal_seed}&challengeId=${challenge.id}&drawMode=${challenge.draw_mode}`
    );
  };

  return (
    <motion.div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-sm w-full space-y-6"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="text-center space-y-2">
          <Spade className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-xl font-bold">You've been challenged!</h1>
        </div>

        <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">
                {challenge.challenger_display_name || 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground">
                Puzzle IQ: {challenge.challenger_rating}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Time</p>
                <p className="font-mono font-semibold text-sm">
                  {formatTimeRaw(challenge.challenger_time_seconds)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Moves</p>
                <p className="font-mono font-semibold text-sm">
                  {challenge.challenger_moves}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                challenge.difficulty === 'Easy'
                  ? 'bg-rating-up/20 text-rating-up'
                  : challenge.difficulty === 'Medium'
                  ? 'bg-gold/20 text-gold'
                  : challenge.difficulty === 'Hard'
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-elite/20 text-elite'
              }`}
            >
              {challenge.difficulty} Deal
            </span>
            <span className="text-xs text-muted-foreground capitalize">
              {challenge.game_mode}
            </span>
          </div>
        </div>

        {user ? (
          <Button className="w-full" size="lg" onClick={handleAccept}>
            Accept Challenge
          </Button>
        ) : (
          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={() => navigate('/auth')}>
              Sign in to Accept
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Create a free account to play this challenge
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
