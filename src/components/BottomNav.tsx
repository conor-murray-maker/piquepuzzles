import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { Layers, Calendar, BarChart3, User } from 'lucide-react';
import { haptic } from '@/lib/haptics';

interface BottomNavProps {
  hidden?: boolean;
}

export function BottomNav({ hidden }: BottomNavProps) {
  const location = useLocation();

  if (hidden) return null;

  const tabs = [
    { path: '/', icon: Layers, label: 'Play' },
    { path: '/daily', icon: Calendar, label: 'Daily' },
    { path: '/stats', icon: BarChart3, label: 'Stats' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border"
      style={{ paddingBottom: 'var(--safe-area-bottom)' }}
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <NavLink
              key={path}
              to={path}
              onClick={() => haptic.light()}
              className={`flex flex-col items-center justify-center gap-0.5 w-16 h-full min-h-[44px] transition-colors ${
                isActive ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
