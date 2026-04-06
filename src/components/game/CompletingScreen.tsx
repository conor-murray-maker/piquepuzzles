import { motion } from 'framer-motion';

interface CompletingScreenProps {
  resultType: 'win' | 'loss' | 'giveup';
}

const MESSAGES = {
  win: 'Calculating your score...',
  loss: 'Saving your game...',
  giveup: 'Recording result...',
};

export function CompletingScreen({ resultType }: CompletingScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
      {/* Pique wordmark */}
      <motion.div
        className="text-3xl font-bold tracking-tight mb-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <span className="text-primary">Pique</span>
      </motion.div>

      {/* Gold shimmer bar */}
      <motion.div
        className="w-48 h-1 rounded-full overflow-hidden mb-6"
        style={{ background: 'hsl(var(--muted))' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, hsl(42 100% 50%), hsl(42 100% 70%), hsl(42 100% 50%))',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>

      {/* Context message */}
      <motion.p
        className="text-sm text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        {MESSAGES[resultType]}
      </motion.p>
    </div>
  );
}
