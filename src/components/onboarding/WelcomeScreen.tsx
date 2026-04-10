import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Spade, Target, Zap, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RATING_TIERS } from '@/game/types';

const GM_SHIMMER_GRADIENT = 'linear-gradient(135deg, #B8860B 0%, #FFD700 35%, #FFF8DC 55%, #FFD700 75%, #B8860B 100%)';

const TIER_COLORS: Record<string, string> = {
  bronze: 'hsl(25, 60%, 50%)',
  silver: 'hsl(225, 3%, 67%)',
  gold: 'hsl(42, 100%, 50%)',
  platinum: 'hsl(214, 58%, 57%)',
  elite: 'hsl(270, 58%, 47%)',
  master: 'hsl(4, 66%, 48%)',
  grandmaster: 'hsl(45, 100%, 50%)',
};

export function WelcomeScreen() {
  const navigate = useNavigate();
  const [tierIndex, setTierIndex] = useState(-1);

  // Animate tiers lighting up one by one
  useEffect(() => {
    const total = RATING_TIERS.length;
    let i = 0;
    const interval = setInterval(() => {
      setTierIndex(i);
      i++;
      if (i >= total) clearInterval(interval);
    }, 1500 / total);
    return () => clearInterval(interval);
  }, []);

  const handleStart = () => {
    navigate('/play?mode=realm&onboarding=true', { replace: true });
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="w-full max-w-sm space-y-8 py-8">
        {/* Logo */}
        <motion.div
          className="flex justify-center"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Spade className="w-8 h-8 text-primary" />
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          className="text-center space-y-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Pique.</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You're about to get a number that tells you exactly how sharp your mind is.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            It starts at 1000. Where it goes is up to you.
          </p>
        </motion.div>

        {/* Tier ladder */}
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center justify-center gap-1.5">
            {RATING_TIERS.map((tier, i) => {
              const isLit = i <= tierIndex;
              const isGM = tier.color === 'grandmaster';
              const color = TIER_COLORS[tier.color];
              return (
                <motion.div
                  key={tier.name}
                  className="flex flex-col items-center gap-1"
                  initial={{ opacity: 0.2 }}
                  animate={{ opacity: isLit ? 1 : 0.2 }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: isGM ? 14 : 10,
                      height: isGM ? 14 : 10,
                      backgroundColor: isLit ? color : 'hsl(var(--muted))',
                      boxShadow: isLit && isGM ? `0 0 12px ${color}` : isLit ? `0 0 8px ${color}40` : 'none',
                    }}
                  />
                  <span
                    className="text-[8px] font-medium"
                    style={
                      isLit && isGM
                        ? {
                            background: GM_SHIMMER_GRADIENT,
                            backgroundSize: '200% 100%',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            animation: 'gm-shimmer 3s linear infinite',
                          }
                        : { color: isLit ? color : 'hsl(var(--muted-foreground))' }
                    }
                  >
                    {tier.name}
                  </span>
                </motion.div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Seven tiers. Earn your rank.
          </p>
        </motion.div>

        {/* IQ explanation */}
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {[
            { icon: Target, emoji: '🎯', text: 'Every deal has a difficulty rating' },
            { icon: Zap, emoji: '⚡', text: 'Your speed and efficiency are measured' },
            { icon: TrendingUp, emoji: '📈', text: 'Your Pique IQ updates after every game' },
          ].map((item, i) => (
            <motion.div
              key={item.text}
              className="flex items-center gap-3 px-4"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.9 + i * 0.15 }}
            >
              <span className="text-base flex-shrink-0">{item.emoji}</span>
              <span className="text-sm text-foreground/80">{item.text}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3 }}
        >
          <Button
            onClick={handleStart}
            className="w-full h-14 text-base font-semibold"
          >
            Play your first game
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
