import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingHero from '@/components/landing/LandingHero';
import LandingStats from '@/components/landing/LandingStats';
import LandingProductPreview from '@/components/landing/LandingProductPreview';
import LandingHowItWorks from '@/components/landing/LandingHowItWorks';
import LandingTiers from '@/components/landing/LandingTiers';
import LandingDailyChallenge from '@/components/landing/LandingDailyChallenge';
import LandingBottomCTA from '@/components/landing/LandingBottomCTA';

export default function Landing() {
  const navigate = useNavigate();

  // Force dark mode on landing page
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!wasDark) root.classList.remove('dark');
    };
  }, []);

  const handleSignIn = () => navigate('/auth');
  const handleGuestPlay = () => {
    localStorage.setItem('pique-guest-mode', 'true');
    navigate('/play?mode=klondike&guest=true');
  };

  return (
    <div
      className="bg-background overflow-y-auto overscroll-contain"
      style={{
        height: '100dvh',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <LandingHero onSignIn={handleSignIn} onGuestPlay={handleGuestPlay} />
      <LandingStats />
      <LandingProductPreview />
      <LandingHowItWorks />
      <LandingTiers />
      <LandingDailyChallenge onSignIn={handleSignIn} />
      <LandingBottomCTA onSignIn={handleSignIn} onGuestPlay={handleGuestPlay} />

      <footer className="px-5 py-6">
        <div className="max-w-md mx-auto text-center">
          <a href="/privacy" className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors underline">
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}
