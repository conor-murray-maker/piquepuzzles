import { motion } from 'framer-motion';
import { Layers, BarChart3, Trophy } from 'lucide-react';

const steps = [
  {
    icon: Layers,
    title: 'Play any puzzle',
    desc: 'Every deal is hand-verified. No unsolvable games, ever.',
  },
  {
    icon: BarChart3,
    title: 'Get your Pique IQ',
    desc: 'Every move scored against the deal difficulty. Your IQ reflects how good you actually are, not just whether you won.',
  },
  {
    icon: Trophy,
    title: 'Compete every day',
    desc: 'One daily challenge. One global leaderboard. Everyone plays the same deal.',
  },
];

export default function LandingHowItWorks() {
  return (
    <section className="px-5 py-16 max-w-md mx-auto">
      <h2 className="text-xs text-muted-foreground/70 uppercase tracking-wider font-medium mb-8 text-center">
        How it works
      </h2>
      <div className="space-y-7">
        {steps.map(({ icon: Icon, title, desc }, i) => (
          <motion.div
            key={title}
            className="flex items-start gap-4"
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
