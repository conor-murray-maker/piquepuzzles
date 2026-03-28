import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGuest } from '@/contexts/GuestContext';
import { X, Spade } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function GuestBanner() {
  const { shouldPromptSignIn, dismissPrompt } = useGuest();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {shouldPromptSignIn && (
        <motion.div
          className="fixed top-0 left-0 right-0 z-50 px-4 pt-2"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
        >
          <div className="bg-card border border-border rounded-xl px-4 py-3 max-w-md mx-auto flex items-center gap-3"
            style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <span className="text-xs text-muted-foreground flex-1">
              Sign in to save your Pique IQ and track your progress
            </span>
            <button onClick={() => navigate('/auth')} className="text-xs text-primary font-medium whitespace-nowrap">
              Sign in
            </button>
            <button onClick={dismissPrompt} className="text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GuestSignInModal() {
  const { shouldShowModal, dismissModal, provisionalIQ } = useGuest();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {shouldShowModal && (
        <motion.div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full text-center space-y-5"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <Spade className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">You've played 3 games as a guest</h3>
              <p className="text-sm text-muted-foreground">
                Sign in to save your rating of <span className="font-bold text-foreground">{provisionalIQ}</span> and keep your progress.
              </p>
            </div>
            <div className="space-y-2">
              <Button onClick={() => navigate('/auth')} className="w-full h-12 text-base font-medium gap-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign In with Google
              </Button>
              <button
                onClick={dismissModal}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Keep playing as guest
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
