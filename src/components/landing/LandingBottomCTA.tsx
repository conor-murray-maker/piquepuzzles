import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

interface Props {
  onSignIn: () => void;
  onGuestPlay: () => void;
}

export default function LandingBottomCTA({ onSignIn, onGuestPlay }: Props) {
  return (
    <motion.section
      className="px-5 py-10 max-w-md mx-auto text-center"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="text-2xl font-bold tracking-tight mb-2">Ready to find out?</h2>
      <p className="text-sm text-muted-foreground/70 mb-6">Free to play. Takes 30 seconds to start.</p>

      <div className="space-y-2">
        <Button
          size="lg"
          variant="outline"
          onClick={onSignIn}
          className="w-full h-14 text-base font-medium gap-3 border-2"
        >
          <GoogleIcon />
          Continue with Google — it's free
        </Button>

        <button
          onClick={onGuestPlay}
          className="w-full text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-2"
        >
          Try a game without signing in
        </button>
      </div>
    </motion.section>
  );
}
