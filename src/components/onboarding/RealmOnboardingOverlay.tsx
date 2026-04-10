import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CrownIcon } from '@/components/game/CrownIcon';
import { X } from 'lucide-react';

interface RealmOnboardingOverlayProps {
  onDismiss: () => void;
}

export function RealmOnboardingOverlay({ onDismiss }: RealmOnboardingOverlayProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
    >
      <motion.div
        className="w-full max-w-sm space-y-6 text-center"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crown icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CrownIcon size={36} color="hsl(var(--primary))" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold">Realm</h2>

        {/* Instructions */}
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Find where each crown belongs.</p>
          <p>One crown per row, column, and region.</p>
          <p>Logic only. No guessing required.</p>
        </div>

        {/* Mini example grid */}
        <div className="flex justify-center">
          <div className="inline-grid grid-cols-3 gap-0 rounded-lg overflow-hidden border border-border">
            {[
              { state: 'empty', color: '#E8735A' },
              { state: 'x', color: '#E8735A' },
              { state: 'empty', color: '#2A9D8F' },
              { state: 'x', color: '#E8735A' },
              { state: 'crown', color: '#2A9D8F' },
              { state: 'x', color: '#2A9D8F' },
              { state: 'empty', color: '#E9C46A' },
              { state: 'x', color: '#E9C46A' },
              { state: 'empty', color: '#E9C46A' },
            ].map((cell, i) => (
              <div
                key={i}
                className="w-10 h-10 flex items-center justify-center border border-border/30"
                style={{ backgroundColor: `${cell.color}30` }}
              >
                {cell.state === 'crown' && <CrownIcon size={18} />}
                {cell.state === 'x' && (
                  <X className="text-muted-foreground/50" size={14} strokeWidth={2.5} />
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Tap to eliminate. Cycle through states to place a crown.
        </p>

        {/* CTA */}
        <Button
          onClick={onDismiss}
          className="w-full h-12 text-base font-semibold"
        >
          Got it. Let's play.
        </Button>
      </motion.div>
    </motion.div>
  );
}
