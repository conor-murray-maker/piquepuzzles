import { motion } from 'framer-motion';

interface WinProbabilityBarProps {
  probability: number | null;
  visible: boolean;
  foundationCount?: number;
}

export function WinProbabilityBar({ visible, foundationCount = 0 }: WinProbabilityBarProps) {
  if (!visible) return null;

  const pct = Math.round((foundationCount / 52) * 100);

  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground font-medium">Cards home</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{foundationCount} / 52</span>
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden bg-secondary">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
