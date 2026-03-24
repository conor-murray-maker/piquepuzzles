import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { Spade, BarChart3, Trophy, Flame, ChevronRight, Layers, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRef, useState, useEffect } from 'react';

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const duration = 1200;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

const TIERS = [
  { name: 'Bronze', color: 'hsl(25, 60%, 50%)', min: 0 },
  { name: 'Silver', color: 'hsl(220, 10%, 66%)', min: 1000, highlight: true },
  { name: 'Gold', color: 'hsl(45, 93%, 47%)', min: 1250 },
  { name: 'Platinum', color: 'hsl(200, 50%, 55%)', min: 1500 },
  { name: 'Elite', color: 'hsl(280, 60%, 55%)', min: 1750 },
];

export default function Landing() {
  const navigate = useNavigate();

  const handleGuestPlay = () => {
    // Set guest mode flag
    localStorage.setItem('pique-guest-mode', 'true');
    navigate('/play?mode=klondike&guest=true');
  };

  const handleSignIn = () => {
    navigate('/auth');
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="bg-background overflow-y-auto overscroll-contain" style={{ height: '100dvh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', WebkitOverflowScrolling: 'touch' }}>
      {/* Hero */}
      <motion.section
        className="px-4 pt-12 pb-10 text-center max-w-md mx-auto"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Spade className="w-8 h-8 text-primary" />
          </div>
        </motion.div>

        <motion.h1 variants={item} className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          How sharp is your mind?
        </motion.h1>

        <motion.p variants={item} className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-8">
          The puzzle platform that measures your skill. Every deal rated. Every move counted. Your Puzzle IQ grows with you.
        </motion.p>

        <motion.div variants={item} className="space-y-3">
          <Button
            size="lg"
            onClick={handleGuestPlay}
            className="w-full h-14 text-base font-semibold"
          >
            Play Free. No Sign Up Needed
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>

          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in to save your progress
          </button>
        </motion.div>
      </motion.section>

      {/* Social proof */}
      <section className="px-4 py-8 border-y border-border bg-muted/30">
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto text-center">
          <div>
            <p className="text-xl sm:text-2xl font-bold font-mono">
              <AnimatedCounter target={10000} suffix="+" />
            </p>
            <p className="text-xs text-muted-foreground mt-1">Deals played</p>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold font-mono">
              <AnimatedCounter target={1247} />
            </p>
            <p className="text-xs text-muted-foreground mt-1">Avg Puzzle IQ</p>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold font-mono">
              <AnimatedCounter target={24} />
            </p>
            <p className="text-xs text-muted-foreground mt-1">Top streak</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-10 max-w-md mx-auto">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-6 text-center">How it works</h2>
        <div className="space-y-5">
          {[
            { icon: Layers, title: 'Play any deal', desc: 'Every deal is verified solvable before you see it' },
            { icon: BarChart3, title: 'Get rated instantly', desc: 'Your performance is scored against the deal difficulty' },
            { icon: Trophy, title: 'Climb the ranks', desc: 'From Bronze to Elite, prove your skill over time' },
          ].map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              className="flex items-start gap-4"
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Tier ladder */}
      <section className="px-4 py-8 border-t border-border bg-muted/20">
        <div className="max-w-md mx-auto">
          <h2 className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-4 text-center">
            Puzzle IQ Tiers
          </h2>
          <div className="flex items-center justify-center gap-1 mb-3">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`flex flex-col items-center px-2 py-2 rounded-lg transition-all ${
                  tier.highlight ? 'bg-card border border-border scale-105' : ''
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full mb-1"
                  style={{ backgroundColor: tier.color }}
                />
                <span className={`text-[10px] font-medium ${tier.highlight ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {tier.name}
                </span>
                {tier.highlight && (
                  <span className="text-[9px] text-muted-foreground mt-0.5">You start here</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Your Puzzle IQ updates after every game. Beat harder deals, earn more points.
          </p>
        </div>
      </section>

      {/* Daily challenge teaser */}
      <section className="px-4 py-8 border-t border-border">
        <div className="max-w-md mx-auto text-center">
          <div className="stat-card py-5 space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Flame className="w-4 h-4 text-destructive" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Today's Challenge</span>
            </div>
            <p className="text-sm font-semibold">Expert Deal: Daily challenge for all players</p>
            <Button variant="outline" size="sm" onClick={handleGuestPlay}>
              <Zap className="w-3.5 h-3.5 mr-1" />
              Try Today's Challenge
            </Button>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 py-10 border-t border-border">
        <div className="max-w-md mx-auto space-y-4">
          <Button
            variant="outline"
            size="lg"
            onClick={handleSignIn}
            className="w-full h-14 text-base font-medium gap-3 border-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Free to play. No credit card. Premium available at €5.99/month.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-6 border-t border-border">
        <div className="max-w-md mx-auto text-center">
          <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline">
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}
