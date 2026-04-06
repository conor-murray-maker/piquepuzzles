import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';

interface HintBannerProps {
  message: string | null;
  duration?: number; // ms
}

export function HintBanner({ message, duration = 3000 }: HintBannerProps) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!message) { setProgress(1); return; }
    setProgress(1);
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 1 - elapsed / duration);
      setProgress(remaining);
      if (remaining > 0) requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [message, duration]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="fixed left-3 right-3 z-50 flex items-center gap-3 rounded-xl bg-card/95 border border-border backdrop-blur-sm px-4 py-3 shadow-lg"
          style={{ bottom: 'calc(56px + 80px + var(--safe-area-bottom, 0px))' }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Lightbulb className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="text-sm font-medium flex-1">{message}</span>
          {/* Progress dots */}
          <div className="flex items-center gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-opacity duration-300"
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  opacity: progress > (2 - i) / 3 ? 1 : 0.2,
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
