import { useState } from 'react';
import { useAdminData } from '@/hooks/useAdminQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface FeedbackRow {
  id: string;
  content: string;
  created_at: string;
  user_iq: number | null;
  platform: string | null;
  display_name: string | null;
}

export function AdminFeedback() {
  const { data, isLoading } = useAdminData('feedback_list') as { data: { feedback: FeedbackRow[]; total: number } | undefined; isLoading: boolean };
  const [copied, setCopied] = useState(false);

  const feedback = data?.feedback || [];
  const total = data?.total || 0;

  const handleCopyAll = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = feedback.filter(f => new Date(f.created_at) >= thirtyDaysAgo);

    const text = recent.map(f => {
      const date = new Date(f.created_at).toLocaleDateString();
      const name = f.display_name || 'Anonymous';
      const iq = f.user_iq != null ? ` (IQ: ${f.user_iq})` : '';
      return `[${date}] ${name}${iq}: ${f.content}`;
    }).join('\n\n');

    navigator.clipboard.writeText(
      `User feedback from last 30 days (${recent.length} submissions):\n\n${text}`
    );
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Feedback</h2>
          <span className="text-sm text-muted-foreground">({total} total)</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={feedback.length === 0}>
          {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
          {copied ? 'Copied' : 'Copy all for AI summary'}
        </Button>
      </div>

      {feedback.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No feedback submitted yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {feedback.map((f) => (
            <Card key={f.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-medium">{f.display_name || 'Anonymous'}</span>
                      {f.user_iq != null && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">IQ {f.user_iq}</span>
                      )}
                      {f.platform && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{f.platform}</span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{f.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(f.created_at).toLocaleDateString()} {new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
