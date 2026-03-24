import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Share2, X, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCallback, useState, useEffect } from 'react';
import { haptic } from '@/lib/haptics';

interface StreakMilestoneModalProps {
  milestone: number;
  onDismiss: () => void;
  onShowPaywall?: () => void;
}

export function StreakMilestoneModal({ milestone, onDismiss, onShowPaywall }: StreakMilestoneModalProps) {
  const { user, isPremium } = useAuth();
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => { if (show) haptic.success(); }, [show]);
    const text = `🔥 ${milestone} Day Streak on Pique!\nI've been sharpening my mind for ${milestone} days straight.\n\nPlay at piquepuzzles.lovable.app`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Pique Streak', text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Streak stats copied!');
    }
  }, [milestone]);

  const handleDismiss = useCallback(async () => {
    setDismissing(true);
    // Clear pending_milestone on profile
    if (user) {
      await supabase.from('profiles').update({ pending_milestone: null }).eq('id', user.id);
    }
    onDismiss();
  }, [user, onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{
          paddingTop: 'var(--safe-area-top, 0px)',
          paddingBottom: 'var(--safe-area-bottom, 0px)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-primary/95" />

        <motion.div
          className="relative z-10 text-center space-y-6 max-w-sm w-full"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/* Animated flame */}
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Flame className="w-20 h-20 text-destructive mx-auto drop-shadow-lg" />
          </motion.div>

          {/* Streak number */}
          <div>
            <h1 className="text-5xl font-bold text-primary-foreground">{milestone} Day Streak</h1>
            <p className="text-primary-foreground/70 mt-2 text-sm">
              You've been playing Pique for {milestone} days straight
            </p>
          </div>

          {/* Share button */}
          <Button
            onClick={handleShare}
            variant="secondary"
            size="lg"
            className="w-full max-w-xs mx-auto"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share Achievement
          </Button>

          {/* CTA */}
          <Button
            onClick={handleDismiss}
            disabled={dismissing}
            size="lg"
            className="w-full max-w-xs mx-auto bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            Keep it going
          </Button>

          {/* Premium upsell for free users */}
          {!isPremium && onShowPaywall && (
            <button
              onClick={() => { handleDismiss(); onShowPaywall(); }}
              className="flex items-center justify-center gap-1.5 text-primary-foreground/60 hover:text-primary-foreground/80 text-xs transition-colors mx-auto"
            >
              <Crown className="w-3 h-3" />
              Protect your streak with Premium →
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
