import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LAST_ACTIVE_KEY = 'pique-last-active';

interface WelcomeBackBannerProps {
  currentStreak: number;
  dailyCompleted: boolean;
  dailyAttempts?: number;
}

export function WelcomeBackBanner({ currentStreak, dailyCompleted, dailyAttempts }: WelcomeBackBannerProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const lastActive = localStorage.getItem(LAST_ACTIVE_KEY);
    const now = Date.now();

    // Always update last active
    localStorage.setItem(LAST_ACTIVE_KEY, String(now));

    if (!lastActive) return;

    const hoursSince = (now - parseInt(lastActive)) / (1000 * 60 * 60);
    if (hoursSince < 24) return;

    // Priority 1: Streak
    if (currentStreak >= 2) {
      setMessage(`🔥 ${currentStreak} game streak — keep it going`);
    }
    // Priority 2: Daily challenge
    else if (!dailyCompleted) {
      setMessage(`Today's challenge is live${dailyAttempts ? ` — ${dailyAttempts} players have attempted it` : ''}`);
    }
    // No message needed otherwise

    if (message) setVisible(true);
  }, [currentStreak, dailyCompleted, dailyAttempts]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && message && (
        <motion.div
          className="fixed top-0 left-0 right-0 z-50 px-4 pt-2"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          onClick={() => setVisible(false)}
        >
          <div className="bg-primary text-primary-foreground text-xs font-medium px-4 py-2.5 rounded-xl text-center max-w-md mx-auto">
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
