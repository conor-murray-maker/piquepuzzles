import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spade, BarChart3, Lightbulb, Zap, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PuzzleIQBadge } from '@/components/game/PuzzleIQBadge';

const TIERS = [
  { name: 'Bronze', rating: 800, color: 'hsl(var(--bronze))' },
  { name: 'Silver', rating: 1100, color: 'hsl(var(--silver))', highlight: true },
  { name: 'Gold', rating: 1250, color: 'hsl(var(--gold))' },
  { name: 'Platinum', rating: 1500, color: 'hsl(var(--platinum))' },
  { name: 'Elite', rating: 1800, color: 'hsl(var(--elite))' },
];

interface OnboardingCarouselProps {
  userName: string;
  onComplete: () => void;
  firstDealDifficulty?: string;
}

export function OnboardingCarousel({ userName, onComplete, firstDealDifficulty = 'Medium' }: OnboardingCarouselProps) {
  const [step, setStep] = useState(0);

  const handleSkip = () => {
    onComplete();
  };

  const handleNext = () => {
    if (step === 3) {
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  };

  const steps = [
    // Step 1: Welcome
    <div className="text-center space-y-6" key="welcome">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
        <Spade className="w-9 h-9 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">Welcome to Pique, {userName}!</h2>
        <p className="text-muted-foreground text-sm">
          You're about to play your first rated game. Here's what makes Pique different.
        </p>
      </div>
    </div>,

    // Step 2: Puzzle IQ explained
    <div className="text-center space-y-5" key="iq">
      <div className="space-y-3">
        <BarChart3 className="w-8 h-8 text-primary mx-auto" />
        <h2 className="text-xl font-bold">Your Puzzle IQ</h2>
      </div>
      <div className="py-3">
        <PuzzleIQBadge rating={1000} size="lg" />
      </div>
      <p className="text-sm text-muted-foreground">
        Every deal has a difficulty rating. Beat hard deals, gain more points. Every move is measured — speed, efficiency, hints used.
      </p>
      <div className="flex items-center justify-center gap-2 pt-2">
        {TIERS.map((tier) => (
          <div key={tier.name} className={`flex flex-col items-center px-1.5 py-1.5 rounded ${tier.highlight ? 'bg-primary/10' : ''}`}>
            <div className="w-2.5 h-2.5 rounded-full mb-0.5" style={{ backgroundColor: tier.color }} />
            <span className="text-[9px] font-medium text-muted-foreground">{tier.name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-primary font-medium">You start at Silver — prove you belong</p>
    </div>,

    // Step 3: How scoring works
    <div className="text-center space-y-5" key="scoring">
      <div className="space-y-3">
        <Lightbulb className="w-8 h-8 text-primary mx-auto" />
        <h2 className="text-xl font-bold">How scoring works</h2>
      </div>
      <div className="space-y-3">
        {[
          { text: 'Win a hard deal → big rating boost', emoji: '🚀' },
          { text: 'Win an easy deal → small boost', emoji: '📈' },
          { text: 'Use hints → smaller bonus', emoji: '💡' },
        ].map((item, i) => (
          <motion.div
            key={item.text}
            className="stat-card flex items-center gap-3 text-left"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.15 }}
          >
            <span className="text-lg">{item.emoji}</span>
            <span className="text-sm font-medium">{item.text}</span>
          </motion.div>
        ))}
      </div>
    </div>,

    // Step 4: Ready to play
    <div className="text-center space-y-6" key="ready">
      <div className="space-y-3">
        <Zap className="w-8 h-8 text-primary mx-auto" />
        <h2 className="text-xl font-bold">Your first deal is ready</h2>
      </div>
      <div className={`inline-block px-3 py-1.5 rounded-lg text-sm font-medium ${
        firstDealDifficulty === 'Easy' ? 'bg-rating-up/20 text-rating-up' :
        firstDealDifficulty === 'Medium' ? 'bg-gold/20 text-gold' :
        'bg-destructive/20 text-destructive'
      }`}>
        {firstDealDifficulty} Deal
      </div>
      <p className="text-sm text-muted-foreground">
        This is a {firstDealDifficulty.toLowerCase()} deal — a good starting point.
      </p>
    </div>,
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="absolute top-4 right-4 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        Skip <X className="w-4 h-4" />
      </button>

      <div className="w-full max-w-sm">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-primary' : i < step ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="min-h-[320px] flex items-center justify-center"
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>

        {/* CTA */}
        <div className="mt-8">
          <Button onClick={handleNext} className="w-full h-12 text-base font-semibold">
            {step === 3 ? 'Play My First Game' : 'Next'}
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
