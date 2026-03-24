import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function adminFetch(action: string, params?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, params }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }

  return resp.json();
}

export function useAdminData(action: string, params?: any, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: ["admin", action, params],
    queryFn: () => adminFetch(action, params),
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval,
    staleTime: 10000,
  });
}

export function useAdminAction() {
  return useMutation({
    mutationFn: ({ action, params }: { action: string; params?: any }) =>
      adminFetch(action, params),
  });
}
