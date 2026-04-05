import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Check } from 'lucide-react';
import { motion } from 'framer-motion';

function getPlatform(): string {
  if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
    return 'pwa';
  }
  return 'web';
}

export function FeedbackBox({ userIQ }: { userIQ: number }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      await supabase.from('feedback' as any).insert({
        user_id: user?.id ?? null,
        content: content.trim().slice(0, 2000),
        user_iq: userIQ,
        platform: getPlatform(),
        app_version: null,
      } as any);
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setContent('');
      }, 3000);
    } catch {
      // silent fail
    } finally {
      setSending(false);
    }
  }, [content, sending, user, userIQ]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Share Feedback</p>
          </div>
          <p className="text-xs text-muted-foreground">Bug, idea, or comment — we read everything.</p>

          {sent ? (
            <div className="flex items-center gap-2 py-4 justify-center text-sm text-primary font-medium">
              <Check className="w-4 h-4" />
              Thanks — we got it.
            </div>
          ) : (
            <>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                className="min-h-[80px] text-sm resize-none"
                maxLength={2000}
              />
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || sending}
                className="w-full"
                size="sm"
              >
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
