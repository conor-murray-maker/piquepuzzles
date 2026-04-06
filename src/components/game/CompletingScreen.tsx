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
      {/* White flash overlay */}
      <motion.div
        className="absolute inset-0 bg-white z-10 pointer-events-none"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      />

      {/* Pique wordmark */}
      <motion.div
        className="text-3xl font-bold tracking-tight mb-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <span className="text-primary">Pique</span>
      </motion.div>

      {/* Gold shimmer progress bar */}
      <motion.div
        className="w-48 rounded-full overflow-hidden mb-6 relative"
        style={{ height: 3, background: 'hsl(var(--muted))' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <motion.div
          className="absolute inset-y-0 w-2/5 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #B8860B, #FFD700, #FFF8DC, #FFD700, #B8860B, transparent)',
          }}
          animate={{ left: ['-40%', '100%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>

      {/* Context message */}
      <motion.p
        className="text-sm text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
      >
        {MESSAGES[resultType]}
      </motion.p>
    </div>
  );
}
