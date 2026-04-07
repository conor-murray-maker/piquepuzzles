import { motion } from 'framer-motion';
import { Spade } from 'lucide-react';

function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-2xl border-2 border-border/50 bg-card/50 p-2 w-full max-w-[180px] aspect-[9/16] flex items-center justify-center overflow-hidden">
        {children}
      </div>
      <span className="text-xs text-muted-foreground/60">{label}</span>
    </div>
  );
}

function RealmMockup() {
  const grid = [
    [0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 1],
  ];
  const colors = [
    'hsl(var(--primary)/0.15)',
    'hsl(var(--accent)/0.12)',
    'hsl(var(--destructive)/0.1)',
    'hsl(var(--gold)/0.12)',
    'hsl(var(--platinum)/0.12)',
  ];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-3 gap-2">
      <div className="grid grid-cols-5 gap-[3px] w-full max-w-[140px]">
        {grid.flat().map((hasCrown, i) => {
          const row = Math.floor(i / 5);
          return (
            <div
              key={i}
              className="aspect-square rounded-sm flex items-center justify-center"
              style={{ backgroundColor: colors[row % colors.length], fontSize: '8px' }}
            >
              {hasCrown ? '👑' : ''}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="text-[8px] text-muted-foreground">5 of 5 placed</span>
      </div>
    </div>
  );
}

function WinScreenMockup() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-3 gap-2">
      <Spade className="w-4 h-4 text-muted-foreground/40" />
      <div className="text-center space-y-1.5">
        <p className="text-2xl font-bold font-mono" style={{ color: '#7B2FBE' }}>1,847</p>
        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold" style={{ backgroundColor: 'hsl(270 58% 47% / 0.15)', color: '#7B2FBE' }}>
          ELITE
        </div>
        <p className="text-sm font-bold font-mono" style={{ color: '#22c55e' }}>+18</p>
      </div>
      <div className="w-full space-y-1 mt-1">
        <div className="flex justify-between text-[8px] text-muted-foreground">
          <span>Time</span><span className="font-mono">2:34</span>
        </div>
        <div className="flex justify-between text-[8px] text-muted-foreground">
          <span>Moves</span><span className="font-mono">87</span>
        </div>
      </div>
    </div>
  );
}

export default function LandingProductPreview() {
  return (
    <section className="px-5 py-16 max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium mb-6 text-center">
          See it in action
        </p>

        <div className="flex items-start justify-center gap-4">
          <PhoneFrame label="Realm">
            <RealmMockup />
          </PhoneFrame>
          <PhoneFrame label="Your Pique IQ">
            <WinScreenMockup />
          </PhoneFrame>
        </div>

        <p className="text-xs text-muted-foreground/60 text-center mt-5">
          Your IQ updates the moment you finish. No waiting. No guessing.
        </p>
      </motion.div>
    </section>
  );
}
