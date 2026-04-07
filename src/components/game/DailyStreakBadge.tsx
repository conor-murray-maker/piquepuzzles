import { motion } from 'framer-motion';
import { Flame, Zap, Diamond, Trophy, Crown, Star, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface StreakMilestoneInfo {
  emoji: string;
  name: string;
  icon: React.ElementType;
  color: string;       // tailwind text color
  bgColor: string;     // tailwind bg color
  hslColor: string;    // for inline styles
}

export const STREAK_MILESTONES: Record<number, StreakMilestoneInfo> = {
  3:   { emoji: '🔥', name: 'On Fire',        icon: Flame,     color: 'text-amber-500',   bgColor: 'bg-amber-500/15',   hslColor: 'hsl(38, 92%, 50%)' },
  7:   { emoji: '⚡', name: 'Week Warrior',    icon: Zap,       color: 'text-yellow-400',  bgColor: 'bg-yellow-400/15',  hslColor: 'hsl(48, 96%, 53%)' },
  14:  { emoji: '💎', name: 'Fortnight',       icon: Diamond,   color: 'text-blue-400',    bgColor: 'bg-blue-400/15',    hslColor: 'hsl(217, 91%, 60%)' },
  30:  { emoji: '🏆', name: 'Monthly',         icon: Trophy,    color: 'text-gold',        bgColor: 'bg-gold/15',        hslColor: 'hsl(42, 100%, 50%)' },
  60:  { emoji: '👑', name: 'Dedicated',       icon: Crown,     color: 'text-purple-400',  bgColor: 'bg-purple-400/15',  hslColor: 'hsl(270, 60%, 60%)' },
  100: { emoji: '🌟', name: 'Century',         icon: Star,      color: 'text-gold',        bgColor: 'bg-gold/15',        hslColor: 'hsl(42, 100%, 50%)' },
  365: { emoji: '🔮', name: 'Legend',           icon: Sparkles,  color: 'text-primary',     bgColor: 'bg-primary/15',     hslColor: 'hsl(280, 80%, 60%)' },
};

const MILESTONE_THRESHOLDS = [365, 100, 60, 30, 14, 7, 3];

export function getCurrentMilestone(streak: number): StreakMilestoneInfo | null {
  for (const t of MILESTONE_THRESHOLDS) {
    if (streak >= t) return STREAK_MILESTONES[t];
  }
  return null;
}

export function getStreakCopy(streak: number, percentile?: number | null): string {
  if (streak >= 365) return "A full year. There are no words.";
  if (streak >= 100) return "100 days. You are Pique.";
  if (streak >= 60) return "Two months. This is becoming part of who you are.";
  if (streak >= 30) return `30 days straight. Only ${percentile ?? '?'}% of players reach this.`;
  if (streak >= 14) return "Two weeks of daily play. You're in rare company.";
  if (streak >= 7) return "One full week. Most players never make it here.";
  if (streak >= 3) return "You're just getting started. Don't break it now.";
  if (streak >= 1) return "Play tomorrow to start your streak.";
  return "Play today's challenge to start a streak.";
}

interface DailyStreakBadgeProps {
  streak: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function DailyStreakBadge({ streak, size = 'md', showLabel = false }: DailyStreakBadgeProps) {
  const milestone = getCurrentMilestone(streak);

  if (!milestone && streak < 1) return null;

  const sizes = {
    sm: { icon: 'w-3.5 h-3.5', text: 'text-xs', gap: 'gap-1' },
    md: { icon: 'w-4 h-4', text: 'text-sm', gap: 'gap-1.5' },
    lg: { icon: 'w-6 h-6', text: 'text-lg', gap: 'gap-2' },
  };
  const s = sizes[size];

  if (!milestone) {
    // No milestone yet, show simple flame + count
    return (
      <div className={`flex items-center ${s.gap} ${s.text}`}>
        <Flame className={`${s.icon} text-muted-foreground`} />
        <span className="font-mono font-bold">{streak}</span>
      </div>
    );
  }

  const Icon = milestone.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            className={`flex items-center ${s.gap} ${s.text} ${milestone.bgColor} rounded-full px-2.5 py-1`}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
          >
            <Icon className={`${s.icon} ${milestone.color}`} />
            <span className={`font-mono font-bold ${milestone.color}`}>{streak}</span>
            {showLabel && <span className={`font-medium ${milestone.color}`}>{milestone.name}</span>}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{milestone.emoji} {milestone.name} — {streak} day streak</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Mini badge for leaderboard rows
export function LeaderboardStreakIcon({ streak }: { streak: number }) {
  if (streak < 3) return null;
  const milestone = getCurrentMilestone(streak);
  if (!milestone) return null;
  const Icon = milestone.icon;
  return <Icon className={`w-3 h-3 ${milestone.color} flex-shrink-0`} />;
}
