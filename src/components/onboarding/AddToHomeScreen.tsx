import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spade, X, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SESSION_KEY = 'pique-session-count';
const A2HS_SHOWN_KEY = 'pique-a2hs-shown';
const A2HS_DISMISSED_KEY = 'pique-a2hs-dismissed-at';

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function AddToHomeScreen() {
  const [show, setShow] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Increment session count
    const count = parseInt(localStorage.getItem(SESSION_KEY) || '0') + 1;
    localStorage.setItem(SESSION_KEY, String(count));

    // Check if already shown and dismissed recently
    const dismissedAt = localStorage.getItem(A2HS_DISMISSED_KEY);
    if (dismissedAt) {
      const dismissedDate = new Date(dismissedAt);
      const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return;
    }

    // Already installed or shown
    if (localStorage.getItem(A2HS_SHOWN_KEY) === 'installed') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    if (count < 3) return;

    setIsIOSDevice(isIOS());

    if (isIOS()) {
      setShow(true);
      return;
    }

    // Listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        localStorage.setItem(A2HS_SHOWN_KEY, 'installed');
      }
      setDeferredPrompt(null);
    }
    setShow(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(A2HS_DISMISSED_KEY, new Date().toISOString());
    setShow(false);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed bottom-16 left-0 right-0 z-50 px-4 pb-4"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
        >
          <div className="bg-card border border-border rounded-2xl p-5 max-w-md mx-auto"
            style={{ boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Spade className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">Add Pique to your home screen</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Play instantly without opening a browser. Get notified about daily challenges.
                </p>
              </div>
              <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOSDevice ? (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Share className="w-4 h-4 flex-shrink-0" />
                <span>Tap the <strong>Share</strong> icon → <strong>Add to Home Screen</strong></span>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={handleInstall} className="flex-1">
                  Add to Home Screen
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Not now
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
