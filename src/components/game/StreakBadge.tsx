import { Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface StreakBadgeProps {
  streak: number;
  size?: 'sm' | 'md';
  showPulse?: boolean;
}

export function StreakBadge({ streak, size = 'md', showPulse = false }: StreakBadgeProps) {
  if (streak < 2) return null;

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            className={`flex items-center gap-0.5 ${textSize}`}
            initial={showPulse ? { scale: 1 } : undefined}
            animate={showPulse ? { scale: [1, 1.1, 1] } : undefined}
            transition={showPulse ? { duration: 1.5, repeat: 2, ease: 'easeInOut' } : undefined}
          >
            <Flame className={`${iconSize} text-destructive`} />
            <span className="font-mono font-bold">{streak}</span>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p>You're on a {streak}-day streak. Play today to keep it alive.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
