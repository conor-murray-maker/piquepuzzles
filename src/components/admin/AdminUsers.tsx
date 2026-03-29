import { useState, useMemo } from "react";
import { useAdminData, useAdminAction } from "@/hooks/useAdminQuery";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, Download, RotateCcw, Crown, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MODES = ["klondike", "freecell", "realm"] as const;
const MODE_LABELS: Record<string, string> = { klondike: "Klondike", freecell: "FreeCell", realm: "Realm" };

function MiniSparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 20;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="inline-block ml-2">
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
    </svg>
  );
}

function ModeRatingsInline({ modeRatings }: { modeRatings: any[] }) {
  return (
    <div className="flex gap-3">
      {MODES.map((mode) => {
        const mr = modeRatings.find((r: any) => r.game_mode === mode);
        const iq = mr?.iq ?? 1000;
        const gp = mr?.games_played ?? 0;
        const isMuted = !mr || gp === 0;
        return (
          <span key={mode} className={`text-xs font-mono ${isMuted ? "text-muted-foreground/50" : ""}`}>
            {MODE_LABELS[mode][0]}: {iq}
          </span>
        );
      })}
    </div>
  );
}

function ModeBreakdownRow({ modeRatings, modeStats, iqHistory }: {
  modeRatings: any[];
  modeStats: Record<string, { played: number; won: number }>;
  iqHistory: Record<string, number[]>;
}) {
  return (
    <div className="grid gap-1.5">
      {MODES.map((mode) => {
        const mr = modeRatings.find((r: any) => r.game_mode === mode);
        const iq = mr?.iq ?? 1000;
        const gp = mr?.games_played ?? 0;
        const stats = modeStats?.[mode];
        const winPct = stats && stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
        const isMuted = !mr || gp === 0;
        const sparkData = iqHistory?.[mode] || [];
        return (
          <div key={mode} className={`flex items-center gap-3 text-xs ${isMuted ? "text-muted-foreground/50" : ""}`}>
            <span className="w-16 font-medium">{MODE_LABELS[mode]}</span>
            <span className="font-mono w-10">{iq}</span>
            <span className="text-muted-foreground w-16">{gp} games</span>
            <span className="w-12">{stats ? `${winPct}%` : "—"}</span>
            <MiniSparkline values={sparkData} />
          </div>
        );
      })}
    </div>
  );
}

function RecentGamesTable({ games }: { games: any[] }) {
  const [modeFilter, setModeFilter] = useState<string>("all");
  const filtered = useMemo(() => {
    if (modeFilter === "all") return games;
    return games.filter((g: any) => g.game_mode === modeFilter);
  }, [games, modeFilter]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm font-medium">Recent Games</p>
        <div className="flex gap-1 ml-auto">
          {["all", ...MODES].map((m) => (
            <Button key={m} size="sm" variant={modeFilter === m ? "default" : "outline"} className="h-6 text-xs px-2" onClick={() => setModeFilter(m)}>
              {m === "all" ? "All" : MODE_LABELS[m]}
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>DDS</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Moves</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Hints</TableHead>
              <TableHead>Before</TableHead>
              <TableHead>After</TableHead>
              <TableHead>Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((g: any) => {
              const delta = g.rating_change;
              const isOutlier = Math.abs(delta) > 200;
              return (
                <TableRow key={g.id}>
                  <TableCell className="text-xs">{new Date(g.played_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">{g.game_mode}</TableCell>
                  <TableCell className="text-xs font-mono">{g.dds ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={g.won ? "default" : "destructive"} className="text-xs">
                      {g.won ? "Won" : "Lost"}
                    </Badge>
                  </TableCell>
                  <TableCell>{g.moves}</TableCell>
                  <TableCell>{Math.floor(g.time_seconds / 60)}:{(g.time_seconds % 60).toString().padStart(2, "0")}</TableCell>
                  <TableCell>{g.hints_used}</TableCell>
                  <TableCell className="font-mono text-xs">{g.rating_before}</TableCell>
                  <TableCell className="font-mono text-xs">{g.rating_after}</TableCell>
                  <TableCell className={`font-mono text-xs ${isOutlier ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold rounded" : delta >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {delta >= 0 ? "+" : ""}{delta}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AdminUsers() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [resetModal, setResetModal] = useState<{ userId: string; name: string; mode: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; type: string; name: string } | null>(null);
  const { toast } = useToast();
  const action = useAdminAction();

  const { data, isLoading, refetch } = useAdminData("users_list", { page, search, sortBy, sortDir, pageSize: 20 });
  const { data: userDetail } = useAdminData("user_detail", { userId: expandedUser }, { enabled: !!expandedUser });

  const users = data?.users || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
    setPage(0);
  };

  const handleResetIQ = async () => {
    if (!resetModal) return;
    try {
      await action.mutateAsync({
        action: "user_action",
        params: { userId: resetModal.userId, actionType: "reset_rating", resetMode: resetModal.mode },
      });
      toast({ title: "Success", description: `Reset ${resetModal.mode === "all" ? "all" : MODE_LABELS[resetModal.mode]} IQ for ${resetModal.name}` });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setResetModal(null);
  };

  const handleGrantPremium = async () => {
    if (!confirmAction) return;
    try {
      await action.mutateAsync({ action: "user_action", params: { userId: confirmAction.userId, actionType: confirmAction.type } });
      toast({ title: "Success", description: `Action completed for ${confirmAction.name}` });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setConfirmAction(null);
  };

  const exportUserHistory = async (userId: string, name: string) => {
    try {
      const data = await action.mutateAsync({ action: "export_user_history", params: { userId } });
      const csv = arrayToCsv(data);
      downloadCsv(csv, `${name}_game_history.csv`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort(col)}>
      {children} {sortBy === col && (sortDir === "asc" ? "↑" : "↓")}
    </TableHead>
  );

  const [showResetPicker, setShowResetPicker] = useState<{ userId: string; name: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <SortHeader col="rating">Pique IQ</SortHeader>
                <TableHead>Mode IQs</TableHead>
                <SortHeader col="games_played">Games</SortHeader>
                <SortHeader col="current_streak">Streak</SortHeader>
                <SortHeader col="best_streak">Best</SortHeader>
                <TableHead>Status</TableHead>
                <SortHeader col="created_at">Joined</SortHeader>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">No users found</TableCell></TableRow>
              ) : users.map((u: any) => (
                <>
                  <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {(u.display_name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{u.display_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-semibold">{u.rating}</TableCell>
                    <TableCell><ModeRatingsInline modeRatings={u.mode_ratings || []} /></TableCell>
                    <TableCell>{u.games_played}</TableCell>
                    <TableCell>{u.current_streak > 0 ? `🔥 ${u.current_streak}` : "—"}</TableCell>
                    <TableCell>{u.best_streak}</TableCell>
                    <TableCell>
                      <Badge variant={u.subscription_status === "premium" ? "default" : "secondary"}>
                        {u.subscription_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {expandedUser === u.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </TableCell>
                  </TableRow>
                  {expandedUser === u.id && (
                    <TableRow key={`${u.id}-detail`}>
                      <TableCell colSpan={9} className="bg-muted/30 p-4">
                        <div className="space-y-4">
                          {/* Mode breakdown */}
                          <div>
                            <p className="text-sm font-medium mb-2">Per-Mode Breakdown</p>
                            <ModeBreakdownRow
                              modeRatings={u.mode_ratings || []}
                              modeStats={userDetail?.modeStats || {}}
                              iqHistory={userDetail?.iqHistory || {}}
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setShowResetPicker({ userId: u.id, name: u.display_name || "user" }); }}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Reset IQ
                            </Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setConfirmAction({ userId: u.id, type: "grant_premium", name: u.display_name }); }}>
                              <Crown className="h-3 w-3 mr-1" /> Grant Premium 30d
                            </Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); exportUserHistory(u.id, u.display_name || "user"); }}>
                              <Download className="h-3 w-3 mr-1" /> Export CSV
                            </Button>
                          </div>

                          {/* Recent games */}
                          {userDetail?.games?.length > 0 && (
                            <RecentGamesTable games={userDetail.games} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} users total</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm py-1 px-2">{page + 1} / {totalPages || 1}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Reset IQ mode picker */}
      <Dialog open={!!showResetPicker} onOpenChange={() => setShowResetPicker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset IQ for {showResetPicker?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => { setResetModal({ userId: showResetPicker!.userId, name: showResetPicker!.name, mode: "all" }); setShowResetPicker(null); }}>
              Reset All IQ (all modes → 1000)
            </Button>
            {MODES.map((mode) => (
              <Button key={mode} variant="outline" onClick={() => { setResetModal({ userId: showResetPicker!.userId, name: showResetPicker!.name, mode }); setShowResetPicker(null); }}>
                Reset {MODE_LABELS[mode]} IQ only
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPicker(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <Dialog open={!!resetModal} onOpenChange={() => setResetModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Reset</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Reset {resetModal?.mode === "all" ? "all mode IQs" : `${MODE_LABELS[resetModal?.mode || ""] || resetModal?.mode} IQ`} to 1000 for {resetModal?.name}? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleResetIQ} disabled={action.isPending}>Confirm Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant premium confirmation */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Grant 30 days Premium to {confirmAction?.name}?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button onClick={handleGrantPremium} disabled={action.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function arrayToCsv(data: any[]) {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
