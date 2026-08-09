import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Spade, Mail, Lock, User, ArrowRight, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const returnUrl = `${window.location.origin}${next}`;
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);


  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success('Check your email for a reset link');
        setMode('login');
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: displayName || undefined },
            emailRedirectTo: returnUrl,
          },
        });
        if (error) throw error;
        toast.success('Check your email to confirm your account');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(next);
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="bg-background overflow-y-auto overscroll-contain flex flex-col items-center justify-center p-4" style={{ height: '100dvh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', WebkitOverflowScrolling: 'touch' }}>
      <motion.div
        className="w-full max-w-sm space-y-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Logo */}
        <div className="text-center space-y-2">
          <Spade className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === 'forgot' ? 'Reset Password' : 'Welcome to Pique'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'forgot'
              ? 'Enter your email to receive a reset link'
              : 'Sharpen your mind with premium puzzle games'}
          </p>
        </div>

        {/* Primary: Google Sign-In */}
        {mode !== 'forgot' && (
          <Button
            className="w-full h-12 text-base font-medium gap-3"
            onClick={handleGoogleAuth}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>
        )}

        {/* Toggle for email option */}
        {mode !== 'forgot' && !showEmail && (
          <button
            onClick={() => setShowEmail(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <Mail className="w-3.5 h-3.5" />
            Use email instead
            <ChevronDown className="w-3 h-3" />
          </button>
        )}

        {/* Email form (collapsible) */}
        <AnimatePresence>
          {(showEmail || mode === 'forgot') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {mode !== 'forgot' && (
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleEmailAuth} className="space-y-3">
                {mode === 'signup' && (
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Display name"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="pl-9"
                  />
                </div>
                {mode !== 'forgot' && (
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pl-9"
                    />
                  </div>
                )}
                <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {mode === 'forgot' ? 'Send Reset Link' : mode === 'signup' ? 'Create Account' : 'Sign In'}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer links */}
        <div className="text-center text-sm space-y-1">
          {mode === 'login' && showEmail && (
            <button onClick={() => setMode('forgot')} className="text-muted-foreground hover:text-foreground transition-colors block w-full text-xs">
              Forgot password?
            </button>
          )}
          {mode === 'login' && (
            <p className="text-muted-foreground text-xs">
              Don't have an account?{' '}
              <button onClick={() => { setMode('signup'); setShowEmail(true); }} className="text-primary hover:underline font-medium">
                Sign up
              </button>
            </p>
          )}
          {mode === 'signup' && (
            <p className="text-muted-foreground text-xs">
              Already have an account?{' '}
              <button onClick={() => setMode('login')} className="text-primary hover:underline font-medium">
                Sign in
              </button>
            </p>
          )}
          {mode === 'forgot' && (
            <button onClick={() => setMode('login')} className="text-primary hover:underline font-medium text-xs">
              Back to sign in
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}