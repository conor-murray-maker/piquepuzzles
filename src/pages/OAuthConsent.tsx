import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Spade, Loader2 } from "lucide-react";

type ConsentClient = { name?: string | null } | null;
type ConsentDetails = {
  client?: ConsentClient;
  redirect_url?: string;
  redirect_to?: string;
} | null;

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: ConsentDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: ConsentDetails; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: ConsentDetails; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<ConsentDetails>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error: err } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (err) {
        setError(err.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "this app";

  return (
    <main
      className="bg-background flex flex-col items-center justify-center p-6"
      style={{ minHeight: "100dvh" }}
    >
      <div className="w-full max-w-sm space-y-6 text-center">
        <Spade className="w-8 h-8 text-primary mx-auto" />
        {error ? (
          <>
            <h1 className="text-xl font-bold tracking-tight">Authorization failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : !details ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading authorization request
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight">Connect {clientName} to Pique</h1>
            <p className="text-sm text-muted-foreground">
              {clientName} will be able to read your Pique profile, game history and daily challenge
              results as you.
            </p>
            <div className="space-y-2 pt-2">
              <Button className="w-full h-11" disabled={busy} onClick={() => decide(true)}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
              </Button>
              <Button
                variant="outline"
                className="w-full h-11"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Deny
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
