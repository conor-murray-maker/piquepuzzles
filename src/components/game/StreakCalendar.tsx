import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface StreakDay {
  date: string;
  condition_met: string;
}

export function StreakCalendar() {
  const { user } = useAuth();

  const { data: streakDays = [] } = useQuery({
    queryKey: ['streak-history', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data } = await (supabase as any)
        .from('streak_history')
        .select('date, condition_met')
        .eq('user_id', user.id)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true });
      return (data || []) as StreakDay[];
    },
    enabled: !!user,
    staleTime: 60000,
  });

  // Build 30-day array
  const days: { date: string; type: 'streak' | 'freeze' | 'missed' }[] = [];
  const streakMap = new Map(streakDays.map(d => [d.date, d.condition_met]));

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const condition = streakMap.get(dateStr);
    days.push({
      date: dateStr,
      type: condition ? 'streak' : 'missed',
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Last 30 Days</p>
      <TooltipProvider>
        <div className="flex gap-1 flex-wrap">
          {days.map(day => (
            <Tooltip key={day.date}>
              <TooltipTrigger asChild>
                <div
                  className={`w-3 h-3 rounded-full cursor-default ${
                    day.type === 'streak'
                      ? 'bg-primary'
                      : 'bg-muted'
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {day.date} — {day.type === 'streak'
                    ? `Streak (${streakMap.get(day.date)})`
                    : 'Missed'}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
