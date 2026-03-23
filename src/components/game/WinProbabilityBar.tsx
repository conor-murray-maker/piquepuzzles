import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WinProbabilityBarProps {
  probability: number | null; // 0–1, null = hidden
  visible: boolean;
}

function getBarColor(p: number): string {
  if (p <= 0.30) return '#ef4444';
  if (p <= 0.60) return '#f59e0b';
  if (p <= 0.85) return '#22c55e';
  return '#1B2340';
}

export function WinProbabilityBar({ probability, visible }: WinProbabilityBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('pique-winprob-dismissed') === '1'; } catch { return false; }
  });
  const [showIntro, setShowIntro] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (visible && probability !== null && !dismissed) {
      setShowIntro(true);
    }
  }, [visible, probability, dismissed]);

  const handleDismissIntro = useCallback(() => {
    setShowIntro(false);
    setDismissed(true);
    try { localStorage.setItem('pique-winprob-dismissed', '1'); } catch {}
  }, []);

  const handleTap = useCallback(() => {
    if (showIntro) {
      handleDismissIntro();
      return;
    }
    setShowTooltip(true);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setShowTooltip(false), 2000);
  }, [showIntro, handleDismissIntro]);

  if (!visible || probability === null) return null;

  const pct = Math.round(probability * 100);
  const color = getBarColor(probability);

  return (
    <div className="relative px-3 py-1.5" onClick={handleTap}>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e2e8f0' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2.5 py-1 rounded-md text-xs font-medium z-10"
            style={{ backgroundColor: '#1B2340', color: '#fff' }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            Win probability: {pct}%
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIntro && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-3 py-1.5 rounded-md text-xs font-medium z-10 cursor-pointer"
            style={{ backgroundColor: '#1B2340', color: '#fff', whiteSpace: 'nowrap' }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            onClick={handleDismissIntro}
          >
            Win probability: updates as you play
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
